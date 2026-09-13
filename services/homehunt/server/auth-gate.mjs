import { createSiteMemberGate } from './site-members.cjs';

export class ApiError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

// Membership is maintained by the administrator. Never accept household IDs,
// email addresses, or the site's cosmetic access code from a request body.
export function createAuthGate({ auth, db }) {
  const siteMember = createSiteMemberGate({ auth, db });
  return async (req) => {
    let member;
    try { member = await siteMember(req); }
    catch (error) { throw new ApiError(error.code, error.message, error.status); }
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(member.householdId || '')) {
      throw new ApiError('MEMBERSHIP_REQUIRED', '이 계정은 HomeHunt 저장 권한이 없습니다.', 403);
    }
    // Preserve the original household and per-UID API contract.
    return { uid: member.uid, householdId: member.householdId };
  };
}
