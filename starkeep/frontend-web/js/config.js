// frontend-web has no build step (plain ES modules via import map), so this
// can't read a bundler env var the way frontend/'s Expo app does.
//
// Resolution order:
//   1. window.STARKEEP_API_BASE — an explicit <script> override set before this
//      module loads, for ops to repoint per-deploy without touching code.
//   2. A separate static-server port (Live Server on 5500, Expo on 3000/8081):
//      the page is on its own origin, so point at Django on :8000 explicitly.
//   3. Otherwise same-origin — because runserver serves frontend-web itself
//      (the DEBUG block in starkeep_project/urls.py), so the API lives at
//      /api/v1 on whatever host the page was loaded from.
//
// Case 3 is what makes tunnel testing work. Previously any non-localhost
// hostname fell through to a hardcoded PROD_API_BASE that does not exist yet,
// so loading the app over a Cloudflare tunnel (DEC-014 Tier 2, see
// docs/QUIZ_SSO_INTEGRATION.md §7) sent every request to api.starkeep.io and
// the whole client failed before the quiz handoff could be exercised at all.
// Same-origin also removes the 127.0.0.1-vs-localhost CORS wrinkle described in
// settings.py's CORS block: on :8000 there is no cross-origin request left.

const DEV_API_BASE = 'http://localhost:8000/api/v1';

// Ports where a *separate* dev server hosts the frontend, i.e. the page's own
// origin is NOT the Django origin.
const SEPARATE_FRONTEND_PORTS = ['5500', '3000', '8081'];

const isSeparateStaticServer = SEPARATE_FRONTEND_PORTS.includes(window.location.port);

// Exported so other modules (store.js's dev-login bypass, HomeView's dev-only
// UI) can gate on the same check without duplicating it — this flag must
// never be true outside local dev, since it controls a real auth bypass.
// Note this is deliberately hostname-based, not origin-based: over a tunnel it
// is false, so the dev bypass is unavailable there and a real sign-in is
// required. That is the correct behaviour for any externally reachable URL.
export const IS_LOCAL_DEV = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_BASE =
    window.STARKEEP_API_BASE
    || (isSeparateStaticServer ? DEV_API_BASE : `${window.location.origin}/api/v1`);
