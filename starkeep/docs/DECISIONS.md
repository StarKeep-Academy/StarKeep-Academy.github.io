# Starkeep Academy — Decision Log

> Append-only. Never delete a decision — mark it superseded if it changes.
> Format: date, decision, rationale, alternatives considered.

---

## DEC-001 — MVP Slice: Auth + Avatar + Star Map
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** v1 ships Auth, Avatar, and Star Map only. Academy chat, full Guilds, LUX trade flows, and all manifesto features beyond these are deferred.  
**Rationale:** Identity + progress core validates the product's central loop before investing in social infrastructure. A user who can create an Avatar and track Stars will tell us if the concept works.  
**Alternatives considered:** Social core (chat + guilds first), Full shell with all features stubbed.

---

## DEC-002 — Menu Naming: Wireframe Canon
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** UI, URLs, and code use wireframe names (Avatar, Star Maps, Academy, Mission Log, LUX). Manifesto names (Heroics, Subspace, Light, Social, Guilds) are valid in narrative copy only. "Guilds" was renamed to "Mission Log" to better reflect the nav's function.  
**Rationale:** Wireframes are the shipped product; manifesto is the vision. Dual vocabulary causes drift.  
**Mapping:** See `docs/STARKEEP_CONTEXT.md §2`.

---

## DEC-003 — LUX v1: LVM Formula + Manual Admin Validation
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** Full LVM formula runs server-side on every validated milestone. Validation is manual via Django admin. Validator staking, peer validation, and slashing deferred to v2.  
**Rationale:** Manual validation exposes the formula to human judgment before automation. Generates labeled data for future ML-assisted scoring. Avoids risk of issuing real economic value via unvetted automation.  
**DeferredTo:** Phase 5 ships manual. v2 ships peer staking.

---

## DEC-004 — AI: Mock Service from Day One
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** `starkeep-ai` microservice ships in v1 with a mock provider. The production interface (FastAPI routes + Provider protocol) is real. Mock returns deterministic canned responses.  
**Rationale:** Real AI costs money and has provider risk. The mock lets frontend teams build against a real API without burning budget. Swapping to OpenAI/Claude is a single env var change.  
**Note:** Archetype quiz is handled by external repo (DEC-007). Mock AI handles mission generation and roadmap drafts only.

---

## DEC-005 — Cross-Platform: True Parity from Day One
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** Single codebase — React Native + Expo Router — targeting iOS, Android, and web simultaneously. No web-first then native-later strategy.  
**Rationale:** Avoids maintaining two codebases. Expo Router's file-based routing works on all three targets. The hiring pool knows React. The tradeoff (some layout quirks on web) is accepted.  
**Constraint:** Screens are built mobile-first. Desktop web gets hover states and wider layouts added on top, never instead of.

---

## DEC-006 — VR Future-Proofing: Five Domains
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** Exactly five API domains are treated as VR-client-ready from day one: Social Posts, Avatar Profile, Star Map, LUX Wallet, Missions. All other domains (settings, billing, admin) may be tighter to current clients.  
**Rationale:** These five contain the data a VR client needs for ambient spatial awareness and the core loop. Full API decoupling everywhere adds cost without benefit.  
**Contract:** See `docs/STARKEEP_CONTEXT.md §8`.

---

## DEC-007 — Archetype Quiz: Mode A (Hosted iframe/WebView)
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** Archetype quiz runs at its own URL (external repo). Starkeep embeds it in a WebView. On completion, quiz POSTs signed results to `/api/v1/avatars/{id}/archetype`.  
**Rationale:** Lowest coupling. Quiz team can iterate without Starkeep deploys. Results contract (DEC-007-A) governs the interface.  
**Upgrade path:** Mode B (RN package) or Mode C (API-only, Starkeep owns quiz UI) in v2 once contract is proven.  
**Action item:** Coordinate with quiz repo team at start of Phase 2. Share payload spec from `STARKEEP_CONTEXT.md §7`.

---

## DEC-008 — Database: PostgreSQL, Immutable LUX Ledger
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** PostgreSQL primary. LUX transactions are append-only (no UPDATE on transaction rows). Wallet balance is recomputed from ledger or cached in `wallet.positive_balance`.  
**Rationale:** Immutable ledger gives auditable history, supports manifesto transparency requirement, and makes future crypto/blockchain integration straightforward.

---

## DEC-009 — Module Dependency Direction
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** Dependency graph flows: `common → users → avatar → {starmap, academy, missions} → lux`. LUX sits at the bottom; no module imports from it. Cross-module communication via Django signals only.  
**Rationale:** Keeps the economy isolated and replaceable. Prevents circular imports. Enforced by `import-linter` in CI.  
**Rule:** If you find yourself importing from `lux` in another app, you are doing it wrong. Emit a signal instead.

---

## DEC-010 — Notifications: In-App WebSocket Only in v1
**Date:** 2026-04-25  
**Status:** DEFAULT (not formally confirmed — confirm before phase 5)  
**Decision:** v1 notifications delivered via WebSocket to connected clients only. No push notifications (FCM/APNs) in v1.  
**Upgrade path:** Push added in phase 7 hardening.

---

## DEC-011 — Auth: No Anonymous Browsing
**Date:** 2026-04-25  
**Status:** DEFAULT (confirm before phase 1)  
**Decision:** All five top-level routes require authentication. Unauthenticated users see only `/splash` and `/(auth)/*`.

---

## DEC-012 — Path Selection Timing
**Date:** 2026-04-25  
**Status:** DEFAULT (confirm before phase 2)  
**Decision:** Heroic Path and Learning Path are selected after the archetype quiz, with the quiz's recommendation pre-filled and editable. Not at signup.

---

## PENDING — Settings v1 Contents
**Status:** OPEN — resolve before phase 6  
**Default proposal:** Account info, sign-out, notifications toggle (in-app), theme (auto/light/dark).

---

## PENDING — Mission Inception in v1
**Status:** OPEN — resolve before phase 6  
**Default proposal:** Missions are admin-seeded. Mock AI generates suggestions shown as a list; user picks from the curated set.
