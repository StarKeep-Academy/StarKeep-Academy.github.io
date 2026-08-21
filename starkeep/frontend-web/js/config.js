// frontend-web has no build step (plain ES modules via import map), so this
// can't read a bundler env var the way frontend/'s Expo app does. Resolution
// order: an explicit window.STARKEEP_API_BASE (set via a <script> tag before
// this module loads, for ops to override per-deploy without touching code)
// > hostname-based default. localhost/127.0.0.1 talks to the local Django
// dev server; any other hostname (a real deploy) talks to the production API.
// Update PROD_API_BASE once the production backend domain is finalized.
const DEV_API_BASE = 'http://localhost:8000/api/v1';
const PROD_API_BASE = 'https://api.starkeep.io/api/v1';

// Exported so other modules (store.js's dev-login bypass, HomeView's dev-only
// UI) can gate on the same check without duplicating it — this flag must
// never be true outside local dev, since it controls a real auth bypass.
export const IS_LOCAL_DEV = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_BASE = window.STARKEEP_API_BASE || (IS_LOCAL_DEV ? DEV_API_BASE : PROD_API_BASE);
