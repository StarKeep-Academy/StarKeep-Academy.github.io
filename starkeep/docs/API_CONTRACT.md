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
| PATCH | `/avatars/{id}` | Required (owner) | Update alias, purpose, paths |
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

---

## Star Map (VR-ready)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/star-maps/{avatar_id}` | Required | Full star map tree |
| GET | `/milestones` | Required | Paginated list, filterable by status |
| POST | `/milestones` | Required | Create milestone |
| GET | `/milestones/{id}` | Required | Milestone detail |
| PATCH | `/milestones/{id}` | Required (owner) | Update title, description, constellation |
| POST | `/milestones/{id}/submit` | Required (owner) | Submit for validation |
| POST | `/milestones/{id}/validate` | Admin only | Validate + score (triggers LUX issuance) |
| POST | `/milestones/{id}/evidence` | Required (owner) | Add evidence item |
| GET | `/constellations` | Required | List constellations for avatar |
| GET | `/constellations/{id}` | Required | Constellation + its stars |

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
            "stars": [
              {
                "id": "uuid",
                "title": "Completed 3D Printing 101",
                "completed_at": "2026-02-01T00:00:00Z",
                "lux_issued": 14,
                "x": 0.42,
                "y": 0.67
              }
            ]
          }
        ]
      }
    ],
    "pending_milestones": [
      {
        "id": "uuid",
        "title": "Build sustainable lamp",
        "status": "active",
        "validation_status": "not_submitted",
        "constellation_id": "uuid"
      }
    ]
  }
}
```

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
