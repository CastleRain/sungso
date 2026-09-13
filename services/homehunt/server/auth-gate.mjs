export class ApiError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

// Membership is maintained by the administrator. Never accept household IDs,
// email addresses, or the site's cosmetic access code from a request body.
export function createAuthGate({ auth, db }) {
  return async (req) => {
    const match = /^Bearer ([^\s]+)$/.exec(String(req.headers?.authorization || ''));
    if (!match || match[1].length > 8192) throw new ApiError('AUTH_REQUIRED', 'Google 로그인이 필요합니다.', 401);
    let token;
    try { token = await auth.verifyIdToken(match[1], true); }
    catch { throw new ApiError('AUTH_INVALID', '로그인이 만료되었습니다. 다시 로그인해주세요.', 401); }
    const email = String(token.email || '').trim().toLowerCase();
    if (token.email_verified !== true || token.firebase?.sign_in_provider !== 'google.com'
      || !email || /[\x00-\x1f/]/.test(email) || !token.uid) {
      throw new ApiError('MEMBERSHIP_REQUIRED', '허용된 Google 계정으로 로그인해주세요.', 403);
    }
    const member = (await db.doc(`homehunt_members/${email}`).get()).data();
    if (member?.active !== true || !/^[a-zA-Z0-9_-]{1,80}$/.test(member.householdId || '')) {
      throw new ApiError('MEMBERSHIP_REQUIRED', '이 계정은 HomeHunt 저장 권한이 없습니다.', 403);
    }
    return { uid: token.uid, householdId: member.householdId };
  };
}
