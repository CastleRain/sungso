// Editor-only, transient data. Never mounted by the guest page or persisted by the composition store.
export function mountAccountPreview(controller) {
  if (!controller || window.parent === window) return;
  window.addEventListener('message', event => {
    if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='studio-v2:accounts-preview')return;
    const sides=event.data.sides;
    if(!Array.isArray(sides)||sides.length!==2||sides.some((g,i)=>g?.id!==['groom','bride'][i]||!Array.isArray(g.accounts)||g.accounts.length>3||g.accounts.some(a=>!a||Object.keys(a).some(k=>!['relation','holder','bank','number','payUrl'].includes(k))||!['신랑','신부','아버지','어머니'].includes(a.relation)||['holder','bank','number'].some(k=>typeof a[k]!=='string'||a[k].length>40)||!/^\d{6,20}$/.test(a.number.replace(/[ -]/g,'')))))return;
    controller.replaceGroups(sides, {previewOnly:true});
    if(['groom','bride'].includes(event.data.side))controller.render(event.data.side);
    const note=document.querySelector('#accounts .demo-note');if(note)note.textContent='계좌 편집 미리보기 · 변경 내용은 반영 버튼으로 저장해 주세요.';
    // This is a read-only account preview; account UI demonstrations cannot copy financial details.
    document.querySelectorAll('#account-panel .account-copy').forEach(b=>{b.disabled=true;b.textContent='계좌 미리보기';});
  });
  window.parent.postMessage({type:'studio-v2:accounts-ready'},location.origin);
}
