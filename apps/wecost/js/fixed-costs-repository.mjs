import { validateCost, costPatch, costFields } from './fixed-costs-core.mjs';

// Dependency injection keeps the same transactions testable against the real emulator.
export function createFixedCostsRepository({ db, doc, runTransaction, serverTimestamp, onSnapshot, work }) {
  const ref = doc(db,'wecost_settings','fixed_costs');
  return {
    subscribe(next,error) {
      return work.observe(onSnapshot,ref,{ includeMetadataChanges: true },snap => {
        const data = snap.exists() ? snap.data() : {};
        if (data.schemaVersion != null && data.schemaVersion !== 1) { error(Error('새 버전에서 저장된 고정비예요. 페이지를 새로고침해주세요.')); return; }
        const items = Object.entries(data.items || {}).map(([id,item]) => ({ ...item,id }));
        try { for (const item of items) validateCost(item); }
        catch { error(Error('고정비 데이터 형식을 확인해야 해요. 원본은 변경하지 않았어요.')); return; }
        next({ items, fromCache: !!snap.metadata?.fromCache, pending: !!snap.metadata?.hasPendingWrites });
      },error);
    },
    async save(command,operationId) {
      const request = work.capture();
      if (!/^[\w-]{1,100}$/.test(operationId || '') || !/^[\w-]{1,100}$/.test(command.id || '') || !['create','update'].includes(command.action)) throw Error('저장 요청을 다시 열어주세요.');
      const frozen = structuredClone(command), signature = JSON.stringify(frozen);
      const logRef = doc(db,'wecost_settings',`fixed_costs_log_${operationId}`);
      await runTransaction(db,async tx => {
        request.assert();
        const [snap,log] = await Promise.all([tx.get(ref),tx.get(logRef)]);
        request.assert();
        if (log.exists()) {
          if (log.data().signature !== signature || log.data().actorUid !== request.member.uid) throw Error('다른 저장 요청이에요. 다시 확인해주세요.');
          return;
        }
        const data = snap.exists() ? snap.data() : { schemaVersion:1,items:{},revision:0 };
        if (data.schemaVersion !== 1) throw Error('고정비 데이터 버전을 확인해주세요.');
        const current = data.items?.[frozen.id] || null;
        let after;
        if (frozen.action === 'create') {
          if (current) throw Error('이미 저장된 항목이에요. 목록에서 확인해주세요.');
          if (Object.keys(data.items || {}).length >= 300) throw Error('고정비는 최대 300개까지 보관할 수 있어요.');
          after = costFields(validateCost(frozen.values));
        } else {
          if (!current) throw Error('항목이 없어요. 최신 목록을 확인해주세요.');
          after = { ...current,...costPatch(current,frozen.expected || {},frozen.values || {}) };
        }
        tx.set(ref,{ schemaVersion:1, items:{ ...data.items,[frozen.id]:after },revision:(data.revision || 0)+1,updatedBy:request.member.uid,updatedAt:serverTimestamp() });
        tx.set(logRef,{ kind:'fixed-cost',targetId:frozen.id,signature,actorUid:request.member.uid,actor:request.member.role === 'sohee' ? '소희' : '성우',before:current,after,updatedAt:serverTimestamp() });
      });
      request.assert();
    },
  };
}
