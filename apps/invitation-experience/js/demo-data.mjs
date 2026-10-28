// This adapter has no network capability. The deployed lab cannot select live mode.
export const DATA_MODE = 'demo';
export const SAMPLE_ACCOUNTS = Object.freeze(['groom', 'bride'].map(side => ({
  id: side, label: side === 'groom' ? '신랑 측' : '신부 측',
  accounts: ['본인', '아버지', '어머니'].map((relation, index) => ({
    id: `${side}-${index}`, relation: index ? relation : side === 'groom' ? '신랑' : '신부',
    holder: index ? relation === '아버지' ? '아빠' : '엄마' : side === 'groom' ? '성우' : '소희',
    bank: '예시은행', number: `000-000-000${index + (side === 'groom' ? 1 : 4)}`, paymentUrl: '',
  })),
})));

export function validateMessage({ name, message, consent, website = '' }) {
  if (website) throw new Error('입력 내용을 다시 확인해 주세요.');
  name = String(name || '').trim().normalize('NFC');
  message = String(message || '').trim().normalize('NFC');
  if (!name || [...name].length > 20) throw new Error('이름은 1~20자로 입력해 주세요.');
  if (!message || [...message].length > 300) throw new Error('메시지는 1~300자로 입력해 주세요.');
  if (!consent) throw new Error('이름과 메시지 공개에 동의해 주세요.');
  return { name, message };
}

export function createDemoAdapter({ variant, photos, storage, now = () => new Date(), uuid = () => crypto.randomUUID() }) {
  if (!/^[fg]$/.test(variant)) throw new TypeError('Unknown invitation variant');
  const key = `sungso_invitation_experience_6_1_${variant}_guestbook`;
  let messages = [], persistent = true;
  try {
    const saved = JSON.parse(storage?.getItem(key) || '[]');
    if (Array.isArray(saved)) messages = saved.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.message === 'string' && Number.isFinite(Date.parse(item.createdAt))).slice(0, 100);
    if (!storage) persistent = false;
  } catch { persistent = false; }
  const clone = value => JSON.parse(JSON.stringify(value));
  function persist() {
    try { if (!storage) throw Error(); storage.setItem(key, JSON.stringify(messages)); }
    catch { persistent = false; }
  }
  return {
    mode: DATA_MODE,
    get persistent() { return persistent; },
    photos: async () => clone(photos),
    accounts: async () => clone(SAMPLE_ACCOUNTS),
    messages: async () => clone(messages),
    async write(input) {
      const fields = validateMessage(input);
      const entry = { id: uuid(), ...fields, createdAt: now().toISOString(), owned: true };
      messages = [entry, ...messages].slice(0, 100); persist(); return clone(entry);
    },
    async remove(id) {
      if (!messages.some(item => item.id === id && item.owned)) throw new Error('이 기기에서 작성한 메시지만 삭제할 수 있어요.');
      messages = messages.filter(item => item.id !== id); persist();
    },
  };
}
