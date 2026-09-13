import { apps } from './runtime.mjs';
export function initializeApp(options, name = '[DEFAULT]') { const existing = apps.find(app => app.name === name); if (existing) return existing; const app = { options, name }; apps.push(app); return app; }
export function getApps() { return [...apps]; }
export function getApp(name = '[DEFAULT]') { const app = apps.find(app => app.name === name); if (!app) throw new Error('QA app missing'); return app; }
export async function deleteApp(app) { const index = apps.indexOf(app); if (index >= 0) apps.splice(index, 1); }
