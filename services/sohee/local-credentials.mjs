import { createRequire } from 'node:module';
import path from 'node:path';

// Optional operator-only reuse of an explicitly selected Firebase CLI login.
// Credentials stay in memory; no new key file is created or sent to the browser.
export function cliCredentials(directory) {
  if (!path.isAbsolute(directory)) throw new Error('FIREBASE_CLI_PATH_MUST_BE_ABSOLUTE');
  const require = createRequire(path.join(directory, 'package.json'));
  if (require('./package.json').name !== 'firebase-tools') throw new Error('INVALID_FIREBASE_CLI');
  const { getGlobalDefaultAccount, getAccessToken } = require('./lib/auth.js');
  const { clientId, clientSecret } = require('./lib/api.js');
  const account = getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error('FIREBASE_CLI_LOGIN_REQUIRED');
  const scopes = ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/userinfo.email'];
  return {
    firestore: { type: 'authorized_user', client_id: clientId(), client_secret: clientSecret(), refresh_token: account.tokens.refresh_token },
    credential: { async getAccessToken() { const token = await getAccessToken(account.tokens.refresh_token, scopes); return { access_token: token.access_token, expires_in: Math.max(60, Math.floor(((token.expires_at || Date.now() + 3600000) - Date.now()) / 1000)) }; } },
  };
}
