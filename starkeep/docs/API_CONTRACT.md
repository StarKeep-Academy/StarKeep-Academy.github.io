# Starkeep Academy — API Contract Reference

> This is the authoritative list of v1 REST endpoints and WebSocket channels.
> Frontend and backend implement against this. When in doubt, this file wins.
> Version: v1. All endpoints under `/api/v1/`.

---

## Response Envelope

Every response uses this shape:

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

---

## Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | None | Email signup |
| POST | `/auth/login` | None | Returns JWT (mobile) or sets session (web) |
| POST | `/auth/logout` | Required | Clears session / revokes refresh token |
| POST | `/auth/token/refresh` | None | JWT refresh |
| GET | `/auth/social/google` | None | OAuth redirect |
| GET | `/auth/social/apple` | None | OAuth redirect |
| GET | `/auth/me` | Required | Current user + avatar bundle |

### `/auth/me` Response
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

---

## Avatar

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/avatars/{id}` | Required | Full avatar profile (Image 7 data) |
| PATCH | `/avatars/{id}` | Required (owner) | Update alias, display_name, purpose, north_star_goal, paths |
| POST | `/avatars/{id}/archetype` | Integration token | Sync quiz results from external repo |
| GET | `/avatars/{id}/archetype` | Required | Get archetype profile |

### `GET /avatars/{id}` Response (VR-ready — never rename these fields)
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

### `PATCH /avatars/{id}` Request

Any subset of: `alias`, `display_name`, `purpose`, `north_star_goal`, `heroic_path`, `learning_path`. Response: the full updated Avatar (same shape as `GET /avatars/{id}`).

```json
// Request
{ "north_star_goal": "Become a self-sustaining regenerative farmer" }
```

---

## Star Map (VR-ready)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/star-maps/{avatar_id}` | Required | Full star map tree |
| GET | `/milestones` | Required | Paginated list, filterable by status |
| POST | `/milestones` | Required | Create milestone |
| GET | `/milestones/{id}` | Required | Milestone detail |
| PATCH | `/milestones/{id}` | Required (owner) | Update title, description, constellation, planets, x/y/z placement |
| DELETE | `/milestones/{id}` | Required (owner) | Delete milestone; heals the constellation's sequence |
| POST | `/milestones/{id}/submit` | Required (owner) | Submit for validation (requires ≥1 evidence item) |
| POST | `/milestones/{id}/evidence` | Required (owner) | Add evidence item |
| POST | `/milestones/{id}/split` | Required (owner) | Mitosis: atomic split into N milestones (DEC-013) |
| GET | `/constellations` | Required | List constellations for avatar |
| POST | `/constellations` | Required | Create constellation (server assigns sky position) |
| GET | `/constellations/{id}` | Required | Constellation + its stars |
| DELETE | `/constellations/{id}` | Required (owner) | Delete constellation AND its milestones |
| POST | `/constellations/{id}/edges` | Required (owner) | Replace constellation's edge list (DEC-013) |

> `POST /milestones/{id}/validate` (admin validation + LVM scoring + LUX issuance) is Phase 6 and **not yet implemented**.

### `GET /star-maps/{avatar_id}` Response (VR-ready)
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
            "completed_at": "2026-03-01T00:00:00Z",
            "angle_deg": 45.0,
            "radius": 0.6,
            "is_north_star": false,
            "stars": [
              {
                "id": "uuid",
                "title": "Completed 3D Printing 101",
                "description": "...",
                "completed_at": "2026-02-01T00:00:00Z",
                "lux_issued": 14,
                "x": 0.42,
                "y": 0.67,
                "z": null,
                "orbit_order": null,
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
        "planets": [
          { "label": "Source materials", "done": true, "order": 1 }
        ],
        "evidence": [],
        "rejection_feedback": "",
        "x": null,
        "y": null,
        "z": null
      }
    ]
  }
}
```

`edges` is DEC-013's DAG — each `{from, to}` names a milestone id that must precede another within the same constellation. `x`/`y`/`z` on a star or pending milestone are writable (DEC-013 amended 2026-08-13): the client saves wherever it places a star/milestone and reads it back verbatim on the next load; `null` means never explicitly positioned, and the client falls back to its own procedural layout for those. They are no longer derived from `edges`.

### `POST /milestones` Request / Response

```json
// Request
{ "title": "Build sustainable lamp", "description": "...", "constellation_id": "uuid", "source": "manual" }
// Response: the created Milestone (same shape as GET /milestones/{id})
```

### `PATCH /milestones/{id}` Request

Any subset of: `title`, `description`, `constellation_id`, `planets` (full replacement array — `[{ "label", "done", "order" }]`), `x`, `y`, `z` (DEC-013 amended — writable star placement; null means never explicitly positioned, client falls back to procedural layout). `status`, `lux_issued`, `validated_at`, `validated_by`, `lvm_scores`, `rejection_feedback` are server-controlled (Phase 6) and rejected if sent. Checking a planet (`done: false → true`) auto-transitions `pending → active` server-side.

### `DELETE /milestones/{id}`

No body. `204 No Content` on success. The constellation's edge sequence is healed first (predecessors join directly to successors) rather than left severed.

### `POST /milestones/{id}/evidence` Request / Response

```json
// Request
{ "type": "text", "payload": "I documented the process...", "label": "Project notes" }
// Response: the created Evidence object { id, type, payload, label, created_at }
```
Attaching evidence to a `pending` milestone also auto-transitions it to `active`.

### `POST /milestones/{id}/submit`

No body. Requires the milestone to be `pending`/`active` and have ≥1 evidence item, or returns `400`. Response: `{ "id": "uuid", "status": "submitted" }`.

### `POST /milestones/{id}/split` Request / Response (Mitosis, DEC-013)

```json
// Request
{ "offshoots": [
  { "title": "Part A", "description": "...", "source_planet_order": 1 },
  { "title": "Part B", "source_planet_order": 2 }
] }
// Response
{
  "consumed_parent": true,
  "parent": null,
  "offshoots": [ /* full Milestone objects */ ],
  "constellation": { /* full Constellation, including its fresh edges */ }
}
```
If the parent still has planets or evidence after the promoted ones are removed, it survives (`consumed_parent: false`, `parent` is the updated Milestone) and the offshoots are spliced in as its prerequisites; otherwise the parent is deleted and the offshoot chain takes its place in the sequence.

### `POST /constellations` Request / Response

```json
// Request
{ "name": "Creative Technology", "symbol": "wolf", "path_id": "uuid" }
// Response: the created Constellation (server-assigned angle_deg/radius, empty edges)
```

### `DELETE /constellations/{id}`

No body. `204 No Content` on success. Deletes the constellation AND its milestones (`Milestone.constellation` is `SET_NULL`, not `CASCADE` — this endpoint deletes the milestones explicitly rather than orphaning them). Edge rows cascade automatically.

### `POST /constellations/{id}/edges` Request / Response (DEC-013)

```json
// Request — the FULL replacement edge list, not a delta
{ "edges": [ { "from": "uuid", "to": "uuid" }, { "from": "uuid", "to": "uuid" } ] }
// Response: the full Constellation, with the new edges
```
Every `from`/`to` must be a milestone belonging to this constellation, and the resulting graph must be acyclic — both are validated server-side independently of the client (`400` otherwise).

### Milestone Statuses
```
pending      → created but not started
active       → in progress
submitted    → awaiting admin validation
approved     → validated → triggers LUX issuance → becomes a Star
rejected     → returned with feedback
```

### Evidence Types
```
photo        → image upload (GCS in phase 4+, base64 in v1 dev)
video        → video upload (GCS phase 4+)
text         → text description
link         → external URL
certificate  → file upload
```

---

## LUX (VR-ready)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/lux/wallet/{avatar_id}` | Required (owner) | Wallet balance |
| GET | `/lux/transactions` | Required | Paginated ledger |
| POST | `/lux/transfer` | Required | Transfer LUX+ to avatar (501 in v1) |
| POST | `/lux/donate` | Required | Donate LUX to mission/project (501 in v1) |

### `GET /lux/wallet/{avatar_id}` Response (VR-ready)
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

### Transaction Object (VR-ready)
```json
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
```

### Transaction Types
```
issuance     → LUX earned from validated milestone (LUX+)
level_up     → 5 LUX consumed per level (non-cashable, removed from supply)
transfer     → LUX+ sent to another avatar (v2)
donation     → LUX donated to project (v2)
spend        → Cosmetic store purchase (v2+)
```

---

## Social Feed (VR-ready)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/social/feed` | Required | Paginated activity feed |
| POST | `/social/posts` | System only | Auto-posted on milestone validation |

### Post Object (VR-ready)
```json
{
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
```

---

## Missions (VR-ready, Stubbed v1)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/missions` | Required | List available missions |
| GET | `/missions/{id}` | Required | Mission detail |
| POST | `/missions/{id}/accept` | Required | Accept mission (501 in v1) |

### Mission Object (VR-ready)
```json
{
  "id": "uuid",
  "title": "Plant a community garden",
  "description": "...",
  "issuer_type": "admin",
  "issuer_id": null,
  "heroic_paths": ["earthwatcher", "peacebringer"],
  "estimated_lux": 12,
  "status": "available",
  "location_hint": null,
  "created_at": "2026-04-25T00:00:00Z"
}
```

---

## Academy / Guilds

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/guilds` | Required | List all guilds |
| GET | `/guilds/{id}` | Required | Guild detail |
| GET | `/guilds/{id}/members` | Required | Paginated member list |

---

## AI Microservice (Internal — starkeep-ai)

Not called directly by frontend. Called by `starkeep-api` → proxied.

| Method | Path | Description |
|---|---|---|
| POST | `/v1/missions/generate` | Suggest missions for avatar context |
| POST | `/v1/roadmap/draft` | Draft constellation roadmap from goal |
| POST | `/v1/milestones/refine` | Refine milestone title + description |
| GET | `/v1/health` | Liveness + current provider name |

---

## WebSocket Channels

Base URL: `ws://api.starkeep.io/ws/`

| Channel | Auth | Payload Shape | Description |
|---|---|---|---|
| `/ws/notifications/` | JWT | `{ "type": "lux_issued", "data": {...} }` | Per-user: validation results, LUX issued, level-up |
| `/ws/star-map/{avatar_id}/` | JWT | `{ "type": "star_added", "data": {...} }` | Live star map updates (VR-subscribed) |
| `/ws/feed/` | JWT | Post object | Global activity feed (VR-subscribed for ambient) |
| `/ws/channels/{channel_id}/` | JWT | Message object | Academy chat (phase 6+) |

### Notification Types
```
lux_issued          → milestone validated, LUX credited
level_up            → user crossed a level threshold
milestone_rejected  → validation rejected with feedback
milestone_approved  → validation approved (fires before lux_issued)
new_mission         → admin posted a new mission matching user's heroic path
```
