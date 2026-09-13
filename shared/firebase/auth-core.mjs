export const MEMBER_ROLES = Object.freeze({ sungwoo: '성우', sohee: '소희' });

export function memberFromClaims(user, claims, record) {
  if (!user?.uid || claims?.email_verified !== true || claims?.firebase?.sign_in_provider !== 'google.com'
      || record?.active !== true || !Object.hasOwn(MEMBER_ROLES, record.role)) return null;
  return Object.freeze({ uid: user.uid, role: record.role, name: MEMBER_ROLES[record.role] });
}

export function safeReturnPath(input, origin, base = '/sungso/') {
  if (typeof input !== 'string' || !input || /[\\\u0000-\u001f]/.test(input)) return null;
  try {
    const url = new URL(input, origin + base);
    if (url.origin !== origin || url.username || url.password || !url.pathname.startsWith(base)) return null;
    // Reject encoded separators/dot traversal rather than relying on URL normalization.
    if (/%(?:2f|5c|2e)/i.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export function createAuthEpoch() {
  let epoch = 0;
  return { next: () => ++epoch, current: () => epoch, valid: value => value === epoch };
}
