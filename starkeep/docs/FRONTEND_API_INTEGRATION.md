# Starkeep Academy — Frontend API Integration Guide

> **Audience:** `frontend-web/` — a vanilla JS (ES modules) + Three.js web frontend consuming the Starkeep Django/DRF backend. No React, no TypeScript, no bundler or build step (see DEC-005 amendment in `docs/DECISIONS.md`).
> **Authority:** All endpoint shapes come from `API_CONTRACT.md` and the actual backend models.
> Do not invent endpoints. Do not rename VR-stable fields. If something is marked `501 in v1`, stub it.
>
> Code samples below that show TypeScript/Next.js-flavored client code (§1.6, §1.7, §10) are
> illustrative shape references only, kept from this doc's original draft — `frontend-web/`'s
> real client is plain JS. See `frontend-web/js/api.js`, `frontend-web/js/starmapApi.js`, and
> `frontend-web/js/avatarApi.js` for the actual, working implementation.
>
> Base URL: `https://api.starkeep.io/api/v1` (dev: `http://localhost:8000/api/v1`)
> WebSocket base: `wss://api.starkeep.io/ws/` (dev: `ws://localhost:8000/ws/`)

---

> ### Architecture Note — Shared Backend, Split Frontends
>
> The Starkeep platform runs **two separate frontends against one backend**:
>
> | Frontend | Stack | Directory |
> |---|---|---|
> | **Mobile app** | React Native + Expo, SVG canvas | `frontend/` |
> | **Web app** | Vanilla JS (ES modules) + Three.js, no framework/build step | `frontend-web/` — built; Star Map read+write is live |
>
> Both frontends consume identical API endpoints and WebSocket channels. The backend API contract
> is client-agnostic — no web-only or mobile-only fields exist. Do not add them.
> VR-stable field naming (DEC-006) applies equally to both. The mobile and web apps share the
> same JWT tokens — a user logged in on web can seamlessly continue on mobile.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Star Map](#2-star-map)
3. [Avatar Profile](#3-avatar-profile)
4. [LUX Wallet](#4-lux-wallet)
5. [Academy Chat](#5-academy-chat)
6. [Guilds](#6-guilds)
7. [WebSocket Channels](#7-websocket-channels)
8. [TypeScript Type Definitions](#8-typescript-type-definitions)
9. [What the Backend Does Automatically](#9-what-the-backend-does-automatically)
10. [Three.js Star Map Implementation](#10-threejs-star-map-implementation)

---

## 1. Authentication

Starkeep uses **JWT for API requests on web** — sent as a Bearer token in the `Authorization` header. Session cookies are an alternative for web-only flows but JWT is preferred for the vanilla-JS/Three.js frontend since it works cleanly with plain `fetch` (no `axios` — no dependency of any kind is used).

### 1.1 Register

```
POST /auth/register
Content-Type: application/json
```

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "display_name": "Ryan Boyd"
}
```

**Response:**
```json
{
  "data": {
    "access": "<jwt-access-token>",
    "refresh": "<jwt-refresh-token>",
    "user_id": "uuid",
    "email": "user@example.com",
    "avatar": {
      "id": "uuid",
      "alias": "DREAMWALKER",
      "display_name": "Ryan Boyd",
      "level": 1,
      "heroic_path": "dreamwalker",
      "learning_path": "divergent",
      "has_archetype": false
    }
  },
  "errors": null
}
```
Note the nested `avatar` bundle (same shape as `/auth/me`'s), not a bare `avatar_id` — cache `avatar.id` from here exactly like you would from `/auth/me`.

### 1.2 Login

```
POST /auth/login
Content-Type: application/json
```

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** Same shape as register — `access` + `refresh` tokens, plus `user_id`, `email`, and the nested `avatar` bundle.

### 1.3 Logout

```
POST /auth/logout
Authorization: Bearer <access-token>
```

No body required. Revokes the refresh token server-side.

### 1.4 Refresh Token

```
POST /auth/token/refresh
Content-Type: application/json
```

**Request body:**
```json
{ "refresh": "<refresh-token>" }
```

**Response:**
```json
{
  "data": {
    "access": "<new-jwt-access-token>"
  }
}
```

### 1.5 Current User + Avatar Bundle

```
GET /auth/me
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "data": {
    "user_id": "uuid",
    "email": "user@example.com",
    "avatar": {
      "id": "uuid",
      "alias": "DREAMWALKER",
      "display_name": "Ryan Boyd",
      "level": 700,
      "heroic_path": "dreamwalker",
      "learning_path": "divergent",
      "has_archetype": true
    }
  }
}
```

Use this endpoint on app load to rehydrate the current user. Cache `avatar.id` — it is the primary key used by most other endpoints.

### 1.6 Attaching the Token to Every Request

`frontend-web/js/api.js` is the real, working client — this is what it actually does, not an illustrative sketch. Tokens live in `localStorage` (namespaced `starkeep_web_access_token`/`starkeep_web_refresh_token`, not just `access_token`, so this never collides with the mobile app's own web build if the two are ever hosted under the same origin), not in memory:

```javascript
// frontend-web/js/api.js
import { API_BASE } from './config.js';

const ACCESS_TOKEN_KEY = 'starkeep_web_access_token';
const REFRESH_TOKEN_KEY = 'starkeep_web_refresh_token';

export const tokenStorage = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (access, refresh) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clearTokens: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
};

async function request(path, options = {}) {
  const { skipAuth = false, ...fetchOptions } = options;
  const headers = { 'Content-Type': 'application/json', ...(fetchOptions.headers || {}) };
  if (!skipAuth) {
    const token = tokenStorage.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  // ...401 → tryRefreshToken() → retry once, else clearTokens() and throw. See §1.7.
  return parseResponse(response); // unwraps { data, meta, errors }, throws ApiError on !ok
}

export const apiClient = {
  get: (path, options) => request(path, { method: 'GET', ...options }),
  post: (path, body, options) => request(path, { method: 'POST', body: JSON.stringify(body), ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body: JSON.stringify(body), ...options }),
  delete: (path, options) => request(path, { method: 'DELETE', ...options })
};
```

`API_BASE` comes from `frontend-web/js/config.js` (hostname-based dev/prod default, overridable via `window.STARKEEP_API_BASE`) — there is no `process.env`/Next.js build step to read from.

### 1.7 Token Refresh Flow

Also inside `frontend-web/js/api.js` — one silent refresh-and-retry on a 401, matching the mobile app's client:

```javascript
async function tryRefreshToken() {
  const refresh = tokenStorage.getRefreshToken();
  if (!refresh) return false;
  try {
    const response = await fetch(`${API_BASE}/auth/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh })
    });
    if (!response.ok) return false;
    const json = await response.json();
    // TokenRefreshView only returns a fresh `access` unless simplejwt's
    // ROTATE_REFRESH_TOKENS also issues a new refresh — keep the old one
    // rather than overwriting it with undefined.
    tokenStorage.setTokens(json.data.access, json.data.refresh ?? refresh);
    return true;
  } catch {
    return false;
  }
}
```

`request()` (§1.6) calls this on a 401 and retries the original call once; if the refresh itself fails, it calls `tokenStorage.clearTokens()` and throws an `ApiError(401, ...)` for the view layer to catch (there is no automatic redirect inside the client — the caller decides what "session expired" means for that screen).

---

## 2. Star Map

The Star Map is the core visualization. All data is fetched in a single tree call, then individual mutation endpoints are called as the user interacts.

### 2.1 Full Star Map Tree

```
GET /star-maps/{avatar_id}
Authorization: Bearer <token>
```

This is the primary data source for the Three.js canvas. Fetch once on mount; subscribe to `/ws/star-map/{avatar_id}/` for live updates (not implemented yet — the channel is scaffolded but no consumer exists; poll/refetch until it lands).

**Response:**
```json
{
  "data": {
    "avatar_id": "uuid",
    "total_stars": 42,
    "total_constellations": 7,
    "constellation_paths": [
      {
        "id": "uuid",
        "name": "Digital Futures Arc",
        "constellations": [
          {
            "id": "uuid",
            "name": "Creative Technology",
            "symbol": "wolf",
            "angle_deg": 45.0,
            "radius": 0.6,
            "is_north_star": false,
            "completed_at": "2026-03-01T00:00:00Z",
            "stars": [
              {
                "id": "uuid",
                "title": "Completed 3D Printing 101",
                "completed_at": "2026-02-01T00:00:00Z",
                "lux_issued": 14,
                "x": 14.2,
                "y": -6.8,
                "z": 3.5,
                "planets": []
              }
            ],
            "edges": [
              { "from": "uuid", "to": "uuid" }
            ]
          }
        ]
      }
    ],
    "pending_milestones": [
      {
        "id": "uuid",
        "title": "Build sustainable lamp",
        "description": "Design and build a solar-powered community lamp",
        "status": "active",
        "validation_status": "not_submitted",
        "constellation_id": "uuid",
        "x": 3.1,
        "y": 9.4,
        "z": -1.0,
        "planets": [
          { "label": "Source materials", "done": true, "order": 1 }
        ],
        "evidence": []
      }
    ]
  }
}
```

**Frontend usage:** Parse `constellation_paths` to position constellation nodes on the Three.js scene using `angle_deg` + `radius` (polar coordinates, North Star at origin). `x`/`y`/`z` on each star or pending milestone are writable placement (DEC-013 amended 2026-08-13) — the client saves wherever it places a star and reads it back verbatim; `null` means never explicitly positioned, in which case the client falls back to its own procedural layout (`starGraph.js`). These are raw 3D local-space world units for frontend-web, not a 0–1 normalized convention. `edges` is the DAG of that constellation's milestones (any status, not just approved ones); combine `constellation_paths[].constellations[].stars` (approved only) with the top-level `pending_milestones` (everything else, tagged by `constellation_id`) to get every milestone in a constellation. The North Star constellation is identified by `is_north_star: true`.

### 2.2 List Constellations

```
GET /constellations
Authorization: Bearer <token>
```

Returns all constellations for the authenticated avatar. Supports standard pagination via `?page=1&page_size=20`.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Creative Technology",
      "symbol": "wolf",
      "angle_deg": 45.0,
      "radius": 0.6,
      "is_north_star": false,
      "completed_at": "2026-03-01T00:00:00Z"
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total": 7 }
}
```

### 2.3 Constellation Detail

```
GET /constellations/{id}
Authorization: Bearer <token>
```

Returns one constellation with its full star list. Use when drilling into a constellation.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "name": "Creative Technology",
    "symbol": "wolf",
    "angle_deg": 45.0,
    "radius": 0.6,
    "is_north_star": false,
    "completed_at": null,
    "stars": [
      {
        "id": "uuid",
        "title": "Build a 3D prototype",
        "description": "Use Blender or similar to model a concept",
        "status": "active",
        "lux_issued": 0,
        "x": 5.0,
        "y": 2.2,
        "z": 0.8,
        "orbit_order": null,
        "evidence": [],
        "planets": []
      }
    ],
    "edges": [
      { "from": "uuid", "to": "uuid" }
    ]
  }
}
```

### 2.4 Create Constellation

```
POST /constellations
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**
```json
{ "name": "Creative Technology", "symbol": "wolf", "path_id": "uuid" }
```

`path_id` is optional. `angle_deg`/`radius` are NOT accepted from the client — the server assigns a free sky slot (mock-AI placement, per STARMAP_SPEC §11). **Response:** the created constellation, with an empty `edges` array.

### 2.5 Replace Constellation Edges (DEC-013)

```
POST /constellations/{id}/edges
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body** — the FULL replacement edge list, not a delta:
```json
{ "edges": [ { "from": "uuid", "to": "uuid" }, { "from": "uuid", "to": "uuid" } ] }
```

Every `from`/`to` must be a milestone belonging to this constellation, and the resulting graph must be acyclic — both validated server-side (`400` with a clean error otherwise; never trust the client's own validation, even though it validates the same rules interactively during drag/mitosis previews). **Response:** the full constellation, with the new `edges`.

### 2.6 List Milestones

```
GET /milestones
Authorization: Bearer <token>
```

Paginated list. Filter by status with `?status=active` or `?status=approved`.

**Query params:** `status`, `constellation_id`, `page`, `page_size`

**Response:** Array of milestone objects (same shape as 2.10 below).

### 2.7 Create Milestone

```
POST /milestones
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**
```json
{
  "title": "Build sustainable lamp",
  "description": "Design and build a solar-powered community lamp",
  "constellation_id": "uuid",
  "source": "manual"
}
```

`source` values: `manual` | `course` | `mission` | `ai` | `mentor`. Starts at `status: "pending"`, `planets: []`.

**Response:** The created milestone object.

### 2.8 Update Milestone

```
PATCH /milestones/{id}
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body** (any subset of editable fields):
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "constellation_id": "uuid",
  "planets": [
    { "label": "Source materials", "done": true, "order": 1 }
  ],
  "x": 12.4,
  "y": -3.1,
  "z": 8.0
}
```

`planets` is a full replacement of the array, not a per-item patch. `x`/`y`/`z` are writable (DEC-013 amended 2026-08-13) — save wherever the client places a star, verbatim; null means never explicitly positioned, in which case the client falls back to its own procedural layout. Units are raw 3D local-space world units for frontend-web, NOT the 0.0–1.0 normalized convention `x`/`y` originally documented (that convention was for the mobile app's 2D canvas — there's no 3D mobile consumer yet to conflict with this). Do not attempt to patch `status`, `lux_issued`, `validated_at`, `validated_by`, or `lvm_scores` — these are server-controlled and rejected if sent. Flipping a planet from `done: false` to `true` auto-transitions the milestone `pending → active` server-side (same rule as attaching evidence, 2.11).

### 2.9 Delete Milestone

```
DELETE /milestones/{id}
Authorization: Bearer <token>
```

No body. `204 No Content` on success. The constellation's edge sequence is healed first (every predecessor is joined directly to every successor) rather than left severed — the frontend does not need to separately patch surrounding edges.

### 2.10 Get Milestone Detail

```
GET /milestones/{id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "title": "Build sustainable lamp",
    "description": "Design and build a solar-powered community lamp",
    "status": "active",
    "source": "manual",
    "lux_issued": 0,
    "lvm_scores": {},
    "rejection_feedback": "",
    "validated_at": null,
    "x": 14.2,
    "y": -6.8,
    "z": 3.5,
    "orbit_order": null,
    "planets": [],
    "evidence": [],
    "constellation_id": "uuid",
    "created_at": "2026-05-01T00:00:00Z",
    "updated_at": "2026-05-01T00:00:00Z"
  }
}
```
(Note: this is `constellation_id`, a plain UUID — not a nested `constellation: {id, name}` object.)

### 2.11 Add Evidence

```
POST /milestones/{id}/evidence
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**
```json
{
  "type": "text",
  "payload": "I documented the process with detailed notes...",
  "label": "Project notes"
}
```

`type` values: `text` | `link` | `photo` | `video` | `certificate`

For `photo` in v1 dev: `payload` is a base64-encoded string. In phase 4+: `payload` is a GCS URL — same field, no schema change. Attaching evidence to a `pending` milestone auto-transitions it to `active`.

**Response:** The created evidence object.
```json
{
  "data": {
    "id": "uuid",
    "type": "text",
    "payload": "I documented...",
    "label": "Project notes",
    "created_at": "2026-05-01T00:00:00Z"
  }
}
```

### 2.12 Submit Milestone for Validation

```
POST /milestones/{id}/submit
Authorization: Bearer <token>
```

No request body. Requires status `pending`/`active` AND at least one evidence item — enforced server-side (`400` if not), not just via a disabled submit button in the UI. Transitions status to `submitted`.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "status": "submitted"
  }
}
```

### 2.13 Split Milestone — Mitosis (DEC-013)

```
POST /milestones/{id}/split
Authorization: Bearer <token>
Content-Type: application/json
```

Atomic: creates N offshoot milestones and either consumes the parent (no planets/evidence left) or leaves it in place with the offshoots spliced in as its prerequisites — one DB transaction, so a partial failure never leaves orphaned milestones or a dangling edge graph.

**Request body:**
```json
{
  "offshoots": [
    { "title": "Part A", "description": "...", "source_planet_order": 1 },
    { "title": "Part B", "source_planet_order": 2 }
  ]
}
```
`source_planet_order` (matching a parent planet's `order`, not its `label` — labels aren't guaranteed unique) identifies which parent planet each offshoot promotes; omit it for an offshoot with no corresponding parent planet.

**Response:**
```json
{
  "data": {
    "consumed_parent": true,
    "parent": null,
    "offshoots": [ /* full Milestone objects, same shape as 2.10 */ ],
    "constellation": { /* full Constellation, including its fresh edges */ }
  }
}
```
If the parent survives, `consumed_parent` is `false` and `parent` is the updated Milestone (its promoted planets removed).

### 2.14 Validate Milestone (Admin Only)

```
POST /milestones/{id}/validate
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Request body:**
```json
{
  "lvm_scores": {
    "i": 4,
    "s": 3,
    "u": 2,
    "r": 2,
    "h": 3,
    "vsm": 1.10
  }
}
```

Admin-only, Phase 6 — not built yet. The backend will run the LVM formula and issue LUX automatically. The frontend never calls this — it exists for the admin panel. Listed here so Gemini understands the validation lifecycle.

### Milestone Status Machine

```
pending → active → submitted → approved
                ↘              ↘
                 rejected        (LUX issued automatically)
```

`pending → active` also happens automatically (server-side) when a planet is checked (2.8) or evidence is attached (2.11) — the frontend never sets `status` directly.

---

## 3. Avatar Profile

### 3.1 Get Full Avatar Profile

```
GET /avatars/{id}
Authorization: Bearer <token>
```

The canonical profile data for Image 7 (three-panel layout). VR-stable — field names never change.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "alias": "DREAMWALKER",
    "display_name": "Ryan Boyd",
    "level": 700,
    "heroic_path": {
      "slug": "dreamwalker",
      "display_name": "Dreamwalker",
      "campus": "Soul Campus",
      "campus_insignia": "star_tetrahedron",
      "glyph_url": "/static/glyphs/dreamwalker.svg"
    },
    "learning_path": {
      "slug": "divergent",
      "display_name": "Divergent",
      "glyph_url": "/static/glyphs/divergent.svg"
    },
    "purpose": "Self-Actualization Architect",
    "north_star_goal": "Build technology that serves human consciousness",
    "powers": [],
    "archetype": {
      "sun_sign": "aries",
      "moon_sign": "cancer",
      "rising_sign": "capricorn",
      "jung_archetype": "magician",
      "mbti": "INFP",
      "recommended_heroic_path": "dreamwalker",
      "recommended_learning_path": "divergent",
      "purpose_seed": "Self-Actualization Architect",
      "visionary_trait": "You express Visionary energy through...",
      "divergent_trait": "You bridge nature, technology..."
    },
    "hours_of_impact": 7000,
    "impact_sources": [
      { "label": "Bachelors Degree in Digital Futures", "hours": 4000 }
    ],
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-04-25T00:00:00Z"
  }
}
```

**Frontend usage:** `archetype` may be `null` if the user has not yet completed the quiz. Gate the right panel display on `has_archetype` from `/auth/me`. The `heroic_path` and `learning_path` objects include glyph URLs — fetch these SVGs and display inline.

### 3.2 Update Avatar

```
PATCH /avatars/{id}
Authorization: Bearer <token>
Content-Type: application/json
```

Owner only. Editable fields: `alias`, `display_name`, `purpose`, `north_star_goal`, `heroic_path` (slug string), `learning_path` (slug string). All optional/partial — send only the fields you're changing.

**Request body:**
```json
{
  "alias": "STARWEAVER",
  "purpose": "New purpose statement"
}
```

`north_star_goal` is how frontend-web persists the North Star goal text — both the onboarding modal's confirm step and the standalone "create a North Star" flow (shown once an avatar has no goal yet) call this same endpoint with `{ "north_star_goal": "..." }`. There is no separate North Star endpoint.

Do not send `level`, `powers`, `hours_of_impact`, or `impact_sources` — these are computed by the backend.

### 3.3 Get Archetype Profile

```
GET /avatars/{id}/archetype
Authorization: Bearer <token>
```

Returns the archetype sub-object only. Same data as the `archetype` key in the full avatar response.

### 3.4 Sync Archetype from Quiz (Integration Token)

```
POST /avatars/{id}/archetype
Authorization: Bearer <integration-token>
Content-Type: application/json
```

This endpoint is called by the external quiz repo, not by the frontend. The frontend embeds the quiz as an iframe/WebView; the quiz POSTs the results directly to this endpoint using its own integration token. The frontend listens for the result via the `/ws/notifications/` channel (`archetype_updated` type — see Section 7).

---

## 4. LUX Wallet

### 4.1 Get Wallet Balance

```
GET /lux/wallet/{avatar_id}
Authorization: Bearer <token>
```

Owner only.

**Response:**
```json
{
  "data": {
    "avatar_id": "uuid",
    "positive_balance": 847,
    "negative_balance": 0,
    "total_earned_lifetime": 1203,
    "level": 700,
    "updated_at": "2026-04-25T00:00:00Z"
  }
}
```

**Frontend usage:** Display `positive_balance` as the spendable LUX+ balance. `negative_balance` (LUX-) is always 0 in v1 — transfers are stubbed. `level` mirrors `avatar.level`.

### 4.2 List Transactions

```
GET /lux/transactions
Authorization: Bearer <token>
```

Paginated ledger, newest first. Filter by `?type=issuance` for milestone earnings only.

**Query params:** `type`, `page`, `page_size`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "issuance",
      "charge": "POS",
      "amount": 16,
      "source_milestone_id": "uuid",
      "source_milestone_title": "Community solar lamp distribution",
      "hero_action_type": "community_impact",
      "lvm_scores": { "i": 4, "s": 3, "u": 2, "r": 2, "h": 3, "vsm": 1.1 },
      "created_at": "2026-04-25T00:00:00Z",
      "metadata": {}
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total": 47 }
}
```

**Transaction types:** `issuance` | `level_up` | `transfer` (v2) | `donation` (v2) | `spend` (v2+)
**Charge codes:** `POS` = LUX+ earned | `NEG` = LUX- received | `CON` = consumed for level-up

### 4.3 Transfer LUX — Stubbed

```
POST /lux/transfer
Authorization: Bearer <token>
```

**Returns `501 Not Implemented` in v1.** Do not implement UI for this. Stub the button as disabled with a "Coming in v2" tooltip.

### 4.4 Donate LUX — Stubbed

```
POST /lux/donate
Authorization: Bearer <token>
```

**Returns `501 Not Implemented` in v1.** Same as above.

---

## 5. Academy Chat

> **Status: Schema exists in v1. All UI is deferred to Phase 6.**
> The backend models are fully migrated (Guild, Channel, Message). The API endpoints respond
> but the WebSocket consumer is not connected in v1. Render an "Academy — Coming Soon" stub.

### 5.1 List Guilds

```
GET /guilds
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Dreamwalker Guild",
      "heroic_path": "dreamwalker",
      "description": "Consciousness, philosophy, esoterics, applied metaphysics",
      "slug": "dreamwalker-guild",
      "member_count": 47
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total": 6 }
}
```

**Frontend usage (v1):** Display guild cards as a read-only directory. Membership management is Phase 6.

### 5.2 Guild Detail

```
GET /guilds/{id}
Authorization: Bearer <token>
```

Returns one guild with its metadata. No channel list in v1.

### 5.3 Guild Members

```
GET /guilds/{id}/members
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "avatar_id": "uuid",
      "alias": "DREAMWALKER",
      "heroic_path": "dreamwalker",
      "level": 700,
      "role": "member"
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total": 47 }
}
```

**Guild roles:** `member` | `officer` | `council`

### 5.4 Academy Chat Endpoints (Phase 6 — Not Implemented in v1)

The following endpoints will exist in Phase 6 but are not available in v1. Do not call them:

- `GET /channels` — list channels for authenticated avatar
- `GET /channels/{id}/messages` — paginated message history
- `POST /channels/{id}/messages` — send a message
- WebSocket: `/ws/channels/{channel_id}/` — real-time message delivery

---

## 6. Guilds

See Section 5 — Guilds are scoped under Academy and documented there.

---

## 7. WebSocket Channels

All WebSocket connections require a JWT token passed as a query parameter on the initial handshake URL.

```
wss://api.starkeep.io/ws/<channel>/?token=<access-token>
```

All payloads follow the envelope:
```json
{
  "type": "<event-type>",
  "data": { }
}
```

### 7.1 Per-User Notifications

```
/ws/notifications/?token=<access-token>
```

Subscribe on login. Delivers real-time updates to the authenticated user.

**Event types:**

| Type | When | `data` shape |
|---|---|---|
| `lux_issued` | Milestone validated, LUX credited to wallet | `{ milestone_id, amount, new_balance }` |
| `level_up` | User crossed a level threshold | `{ level_reached, lux_consumed }` |
| `milestone_approved` | Validation approved (fires before `lux_issued`) | `{ milestone_id, title }` |
| `milestone_rejected` | Validation rejected with feedback | `{ milestone_id, title, feedback }` |
| `new_mission` | Admin posted a new mission matching the user's heroic path | `{ mission_id, title, estimated_lux }` |

**Example `lux_issued` payload:**
```json
{
  "type": "lux_issued",
  "data": {
    "milestone_id": "uuid",
    "milestone_title": "Community Solar Lamp Distribution",
    "amount": 16,
    "new_balance": 863,
    "hero_action_type": "community_impact"
  }
}
```

**Frontend usage:** On `lux_issued` / `level_up`, invalidate the wallet query cache and show a celebratory animation. On `milestone_approved`, update the star map — the milestone has become a Star and its Three.js node should transition to the glowing `approved` state.

### 7.2 Star Map Live Updates

```
/ws/star-map/{avatar_id}/?token=<access-token>
```

Subscribe when the Star Map screen is open. Delivers live changes to the user's star map — important for multi-device sync and for receiving admin validation results in real time.

**Event types:**

| Type | When | `data` shape |
|---|---|---|
| `star_added` | Milestone moves to `approved` | Full milestone/star object |
| `constellation_complete` | All stars in a constellation approved | `{ constellation_id, name }` |
| `milestone_updated` | Any field on a milestone changed | Partial milestone object |

**Example `star_added` payload:**
```json
{
  "type": "star_added",
  "data": {
    "id": "uuid",
    "title": "Build sustainable lamp",
    "lux_issued": 16,
    "constellation_id": "uuid",
    "x": 14.2,
    "y": -6.8,
    "z": 3.5
  }
}
```

### 7.3 Global Activity Feed

```
/ws/feed/?token=<access-token>
```

Delivers the global social feed. Subscribe on any screen that shows activity.

**Payload:** Post object:
```json
{
  "type": "new_post",
  "data": {
    "id": "uuid",
    "avatar": {
      "id": "uuid",
      "alias": "DREAMWALKER",
      "heroic_path": "dreamwalker",
      "level": 700
    },
    "post_type": "milestone_complete",
    "hero_action_type": "community_impact",
    "title": "DREAMWALKER completed: Community Solar Lamp Distribution",
    "body": "Earned 16 LUX for this achievement.",
    "milestone_id": "uuid",
    "lux_earned": 16,
    "created_at": "2026-04-25T00:00:00Z"
  }
}
```

### 7.4 Academy Channel Chat (Phase 6)

```
/ws/channels/{channel_id}/?token=<access-token>
```

**Not active in v1.** Do not connect. Will deliver `{ type: "message", data: MessageObject }` in Phase 6.

### 7.5 WebSocket Connection Pattern

```typescript
// lib/websocket.ts
export function openSocket(
  path: string,
  token: string,
  onMessage: (event: MessageEvent) => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}${path}?token=${token}`);
  ws.onmessage = onMessage;
  ws.onclose = (e) => {
    if (!e.wasClean) {
      // Reconnect with exponential backoff
      setTimeout(() => openSocket(path, token, onMessage), 3000);
    }
  };
  return ws;
}
```

---

## 8. TypeScript Type Definitions

Paste this block into `lib/types/api.ts` in the Three.js/React frontend.

```typescript
// ─── Shared ──────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta: PaginationMeta | null;
  errors: ApiError | null;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
  invalid_params?: Array<{ field: string; message: string }>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface CurrentUser {
  user_id: string;
  email: string;
  avatar: CurrentUserAvatar;
}

export interface CurrentUserAvatar {
  id: string;
  alias: string;
  display_name: string;
  level: number;
  heroic_path: HeroicPathSlug;
  learning_path: LearningPathSlug;
  has_archetype: boolean;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export type HeroicPathSlug =
  | 'earthwatcher' | 'peacebringer' | 'storyteller'
  | 'innovator' | 'dreamwalker' | 'truthseeker';

export type LearningPathSlug =
  | 'scholar' | 'wayfinder' | 'specialist'
  | 'divergent' | 'generalist' | 'mystic';

export interface HeroicPathDetail {
  slug: HeroicPathSlug;
  display_name: string;
  campus: string;
  campus_insignia: string;
  glyph_url: string;
}

export interface LearningPathDetail {
  slug: LearningPathSlug;
  display_name: string;
  glyph_url: string;
}

export interface ArchetypeProfile {
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
  jung_archetype: string;
  mbti: string;
  recommended_heroic_path: HeroicPathSlug;
  recommended_learning_path: LearningPathSlug;
  purpose_seed: string;
  visionary_trait: string;
  divergent_trait: string;
}

export interface ImpactSource {
  label: string;
  hours: number;
}

export interface AvatarProfile {
  id: string;
  alias: string;
  display_name: string;
  level: number;
  heroic_path: HeroicPathDetail;
  learning_path: LearningPathDetail;
  purpose: string;
  north_star_goal: string;
  powers: string[];
  archetype: ArchetypeProfile | null;
  hours_of_impact: number;
  impact_sources: ImpactSource[];
  created_at: string;
  updated_at: string;
}

// ─── Star Map ─────────────────────────────────────────────────────────────────

export type MilestoneStatus = 'pending' | 'active' | 'submitted' | 'approved' | 'rejected';
export type MilestoneSource = 'manual' | 'course' | 'mission' | 'ai' | 'mentor';
export type EvidenceType    = 'photo' | 'video' | 'text' | 'link' | 'certificate';

export interface LvmScores {
  i: number;    // 0–5 Impact Longevity
  s: number;    // 0–5 Scope of Benefit
  u: number;    // 0–5 Urgency of Need
  r: number;    // 0–5 Rarity & Innovation
  h: number;    // 0–5 Human Effort & Skill
  vsm: 1.00 | 1.10 | 1.15 | 1.25;
}

export interface Evidence {
  id: string;
  type: EvidenceType;
  payload: string;
  label: string;
  created_at: string;
}

export interface Planet {
  label: string;
  done: boolean;
  order: number;
}

export interface Edge {
  from: string;
  to: string;
}

export interface Star {
  id: string;
  title: string;
  completed_at: string | null;
  lux_issued: number;
  // Writable (DEC-013 amended) — null until explicitly placed. Raw 3D
  // local-space units for frontend-web, not the 0-1 normalized convention
  // originally documented (that was for the mobile app's 2D canvas).
  x: number | null;
  y: number | null;
  z: number | null;
  planets: Planet[];
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  source: MilestoneSource;
  lux_issued: number;
  lvm_scores: LvmScores | Record<string, never>;
  rejection_feedback: string;
  validated_at: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  // Reserved for a different, unbuilt concept (a Milestone nested as a planet
  // of another Milestone) — NOT what drives planet-ring depth. That's
  // Planet.order above (1 = innermost); see docs/STARMAP_SPEC.md §11.
  orbit_order: number | null;
  planets: Planet[];
  evidence: Evidence[];
  constellation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConstellationSummary {
  id: string;
  name: string;
  symbol: string;
  angle_deg: number | null;    // 0–360, polar position in sky; null until set by AI
  radius: number | null;       // 0–1 normalized distance from North Star
  is_north_star: boolean;
  completed_at: string | null;
  stars: Star[];
  edges: Edge[];                // DEC-013 — the DAG covering every milestone in this constellation
}

export interface ConstellationPath {
  id: string;
  name: string;
  constellations: ConstellationSummary[];
}

export interface PendingMilestone {
  id: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  validation_status: string;
  constellation_id: string | null;
  // Writable (DEC-013 amended) — see Star.x/y/z above; same convention.
  x: number | null;
  y: number | null;
  z: number | null;
  planets: Planet[];
  evidence: Evidence[];
}

export interface StarMap {
  avatar_id: string;
  total_stars: number;
  total_constellations: number;
  constellation_paths: ConstellationPath[];
  pending_milestones: PendingMilestone[];
}

// ─── LUX ──────────────────────────────────────────────────────────────────────

export type TransactionType   = 'issuance' | 'level_up' | 'transfer' | 'donation' | 'spend';
export type TransactionCharge = 'POS' | 'NEG' | 'CON';

export interface LuxWallet {
  avatar_id: string;
  positive_balance: number;
  negative_balance: number;
  total_earned_lifetime: number;
  level: number;
  updated_at: string;
}

export interface LuxTransaction {
  id: string;
  type: TransactionType;
  charge: TransactionCharge;
  amount: number;
  source_milestone_id: string | null;
  source_milestone_title: string | null;
  hero_action_type: string;
  lvm_scores: LvmScores | Record<string, never>;
  created_at: string;
  metadata: Record<string, unknown>;
}

// ─── Academy / Guilds ─────────────────────────────────────────────────────────

export type GuildRole = 'member' | 'officer' | 'council';

export interface Guild {
  id: string;
  name: string;
  heroic_path: HeroicPathSlug;
  description: string;
  slug: string;
  member_count: number;
}

export interface GuildMember {
  avatar_id: string;
  alias: string;
  heroic_path: HeroicPathSlug;
  level: number;
  role: GuildRole;
}

// ─── Social Feed ──────────────────────────────────────────────────────────────

export type PostType = 'milestone_complete';

export interface SocialPost {
  id: string;
  avatar: {
    id: string;
    alias: string;
    heroic_path: HeroicPathSlug;
    level: number;
  };
  post_type: PostType;
  hero_action_type: string;
  title: string;
  body: string;
  milestone_id: string;
  lux_earned: number;
  created_at: string;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export type WsNotificationEvent =
  | { type: 'lux_issued';          data: { milestone_id: string; milestone_title: string; amount: number; new_balance: number; hero_action_type: string } }
  | { type: 'level_up';            data: { level_reached: number; lux_consumed: number } }
  | { type: 'milestone_approved';  data: { milestone_id: string; title: string } }
  | { type: 'milestone_rejected';  data: { milestone_id: string; title: string; feedback: string } }
  | { type: 'new_mission';         data: { mission_id: string; title: string; estimated_lux: number } };

export type WsStarMapEvent =
  | { type: 'star_added';            data: Star & { constellation_id: string } }
  | { type: 'constellation_complete'; data: { constellation_id: string; name: string } }
  | { type: 'milestone_updated';     data: Partial<Milestone> & { id: string } };

export type WsFeedEvent =
  | { type: 'new_post'; data: SocialPost };
```

---

## 9. What the Backend Does Automatically

The following things happen **server-side** and must **not** be re-implemented in the frontend. Gemini should read these, understand the lifecycle, and only react to the output via WebSocket events or re-fetches.

### LUX Issuance

When an admin calls `POST /milestones/{id}/validate`, the backend:
1. Runs the LVM formula (`lux/scoring.py`) using the submitted `lvm_scores`
2. Creates an immutable `Transaction` with `type=issuance`, `charge=POS`
3. Updates `Wallet.positive_balance` and `Wallet.total_earned_lifetime`
4. Fires a Django signal (`milestone_validated`) that the lux app handles (DEC-009 — cross-app via signal only)
5. Emits a WebSocket event `lux_issued` to the user's notification channel
6. Also emits `milestone_approved` before `lux_issued`

The frontend **never** computes LUX amounts. Display `milestone.lux_issued` from the API.

### Level-Up Calculation

Immediately after LUX issuance, the backend:
1. Calls `lux_after_level_up()` — first 5 LUX of every issuance is consumed for 1 level (configurable)
2. Creates a separate `Transaction` with `type=level_up`, `charge=CON`
3. Increments `Avatar.level`
4. Emits `level_up` WebSocket event with `{ level_reached, lux_consumed }`

The frontend reacts to the `level_up` WS event and updates the displayed level. Do not compute levels locally.

### Social Post Creation

When a milestone is validated and approved, the backend auto-creates a `SocialPost` with `post_type=milestone_complete`. The frontend never POSTs to `/social/posts` — that endpoint is `System only`. The frontend only GETs from `/social/feed` or listens on `/ws/feed/`.

### Milestone Status Transitions (Server-enforced)

Status can only advance in this order: `pending → active → submitted → approved | rejected`. The frontend cannot skip steps or set status directly — it calls `POST /milestones/{id}/submit` and the backend enforces the transition (and now also auto-transitions `pending → active` when a planet is checked or evidence is attached, Phase 4). `approved` and `rejected` are set only by admin validation.

### Wallet Balance Integrity

`Wallet.positive_balance` is a materialized cache computed from the append-only `Transaction` ledger. The backend recomputes it on every write. The frontend must never try to compute or mutate balances — only read from `GET /lux/wallet/{id}`.

### Impact Hours

`Avatar.hours_of_impact` is computed by the backend from `impact_sources` (a JSON field set during avatar creation / import). The frontend displays it read-only.

### Archetype Sync

The quiz posts directly to `POST /avatars/{id}/archetype` using its own integration token. The frontend only needs to:
1. Embed the quiz URL as an iframe/WebView
2. Listen on `/ws/notifications/` for `archetype_updated` (future event)
3. Refetch `GET /avatars/{id}` when the user returns to the profile page

### Constellation Sequence (DEC-013, Phase 4)

The DAG of a constellation's milestones (`ConstellationEdge`) is fully server-persisted and server-validated (ownership + acyclicity) — the frontend's own client-side graph algorithms (`starGraph.js`) exist for the interactive drag/mitosis preview only, not as the authority. `POST /constellations/{id}/edges` always re-validates independently before writing. `x`/`y`/`z` on a milestone are writable (DEC-013 amended 2026-08-13) — the client's placement is saved verbatim, not derived from `edges`.

Structural edits (create/rename/delete a star, link/unlink edges, drag to reposition) are batched client-side in an "edit mode" session and only synced on **LOCK IN** — not one atomic transaction. The sync order is: `POST /milestones` for any newly-created stars, a combined title+position `PATCH /milestones/{id}` per remaining star, `DELETE /milestones/{id}` for removed stars, then `POST /constellations/{id}/edges` with the full replacement edge list. Mitosis (`POST /milestones/{id}/split`) is the one exception — it is fired immediately/atomically on the server rather than batched into the edit session, since it is itself already a single transaction.

---

## 10. Three.js Star Map Implementation

This was originally a placeholder for a template file; the real implementation now exists and is
built out well beyond what a static template would show (full DAG editing, mitosis, edit-mode
batching, evidence, submit-for-validation). It lives at:

```
frontend-web/js/views/StarMapView.js   — the view/scene: mount/render/destroy, camera phases,
                                          star meshes, edit mode, all UI wiring
frontend-web/js/starGraph.js           — pure, THREE-free graph + force-directed layout math
                                          (edge DAG, mitosis rewiring); unit-tested via
                                          starGraph.test.mjs (103 assertions)
frontend-web/js/starmapApi.js          — Star Map API client wrapper (built on js/api.js)
frontend-web/js/avatarApi.js           — Avatar API client (North Star goal persistence)
```

Key integration points, corrected against the real code:

- `StarMap` (from `GET /star-maps/{avatar_id}`) is fetched in `StarMapView.resetState()`, mapped
  via `mapStarMapResponse()` in `starmapApi.js`, and feeds `renderExistingStarMap()` for a
  returning user with existing constellations (skipping onboarding), or the mock-seeded
  onboarding walkthrough for a brand-new account.
- `constellation.angle_deg` + `constellation.radius` → polar-to-Cartesian via `polarToVector3()`
  (`frontend-web/js/constants.js`) for a constellation's position in the sky.
- `star.x` / `star.y` / `star.z` are used directly when present (DEC-013 amendment — authored,
  not derived); `starGraph.js`'s `computeLayout()` is only the fallback for a star that has never
  been explicitly positioned.
- `/ws/star-map/{avatar_id}/` is still **not implemented** (no consumer exists server-side) — the
  frontend does not subscribe to it; state changes are reflected by re-fetching, not live push.
- Planet orbit ring depth (innermost = first to complete) is driven by each planet's own
  `order` field inside the `planets` JSONField array (`planets[].order`), **not**
  `milestone.orbit_order` — that field exists on the model but is reserved for a different,
  unbuilt concept (a Milestone nested as a planet of another Milestone) and is unused by the
  planet-ring UI. See `docs/STARMAP_SPEC.md` §11.

---

## Appendix A — Response Envelope

Every REST response wraps its payload:

```json
{
  "data": { },
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 87
  },
  "errors": null
}
```

Error shape (RFC 7807):
```json
{
  "data": null,
  "errors": {
    "type": "https://starkeep.io/errors/validation",
    "title": "Validation Error",
    "status": 422,
    "detail": "alias: This field is required.",
    "invalid_params": [
      { "field": "alias", "message": "This field is required." }
    ]
  }
}
```

Always check `errors !== null` before reading `data`.

---

## Appendix B — LVM Formula Reference

The backend computes all LUX amounts. This is documented here so the frontend can display a *preview* to the user (e.g., "this milestone could earn ~14 LUX") without committing to a value.

```
RawScore  = (I × 0.30) + (S × 0.25) + (U × 0.20) + (R × 0.15) + (H × 0.10)
BaseLUX   = RawScore × 5
IssuedLUX = floor(BaseLUX × VSM)
IssuedLUX = min(IssuedLUX, 30)   ← hard cap
```

VSM values: `1.00` (basic) | `1.10` (peer) | `1.15` (NGO) | `1.25` (certificate)

All axes are 0–5. The formula lives exclusively in `backend/apps/lux/scoring.py` — never duplicate the authoritative computation in the frontend.

---

## Appendix C — Heroic Path & Learning Path Reference

| Slug | Display Name | Campus |
|---|---|---|
| `earthwatcher` | Earthwatcher | Mountain (Cube) |
| `peacebringer` | Peacebringer | Ocean (Icosahedron) |
| `storyteller` | Storyteller | Cloud (Octahedron) |
| `innovator` | Innovator | Sun (Tetrahedron) |
| `dreamwalker` | Dreamwalker | Soul (Star Tetrahedron) |
| `truthseeker` | Truthseeker | World (Dodecahedron) |

| Slug | Display Name |
|---|---|
| `scholar` | Scholar |
| `wayfinder` | Wayfinder |
| `specialist` | Specialist |
| `divergent` | Divergent |
| `generalist` | Generalist |
| `mystic` | Mystic |
