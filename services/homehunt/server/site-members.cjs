// Shared by Render, HomeHunt Functions and the legacy default codebase.
// Admin SDK bypasses Firestore rules, so every HTTP request checks membership.
class SiteAuthError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

function createSiteMemberGate({ auth, db }) {
  return async (req) => {
    const match = /^Bearer ([^\s]+)$/.exec(String(req.headers?.authorization || ''));
    if (!match || match[1].length > 8192) throw new SiteAuthError('AUTH_REQUIRED', 'Google 로그인이 필요합니다.', 401);
    let token;
    try { token = await auth.verifyIdToken(match[1], true); }
    catch { throw new SiteAuthError('AUTH_INVALID', '로그인이 만료되었습니다. 다시 로그인해주세요.', 401); }
    const uid = token.uid;
    const email = String(token.email || '').trim();
    if (token.email_verified !== true || token.firebase?.sign_in_provider !== 'google.com'
      || typeof uid !== 'string' || !uid || uid.length > 128 || /[\x00-\x1f/]/.test(uid)
      || !email || /[\x00-\x1f/]/.test(email)) {
      throw new SiteAuthError('MEMBERSHIP_REQUIRED', '허용된 Google 계정으로 로그인해주세요.', 403);
    }
    // No email/body/cookie fallback: the verified token UID is the only lookup key.
    let member;
    try { member = (await db.doc(`site_members/${uid}`).get()).data(); }
    catch { throw new SiteAuthError('MEMBERSHIP_UNAVAILABLE', '회원 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', 503); }
    if (member?.active !== true || !['sungwoo', 'sohee'].includes(member.role)) {
      throw new SiteAuthError('MEMBERSHIP_REQUIRED', '이 계정은 개인 홈 접근 권한이 없습니다.', 403);
    }
    return { uid, role: member.role, householdId: member.householdId };
  };
}

module.exports = { createSiteMemberGate, SiteAuthError };
