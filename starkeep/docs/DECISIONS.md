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
**Decision:** UI, URLs, and code use wireframe names (Avatar, Star Maps, Academy, Mission Log, LUX). Manifesto names (Heroics, Subspace, Light, Social, Guilds) are valid in narrative copy only. "Guilds" was renamed to "Mission Log" to better reflect the nav's function. Mission Log ships its own route in phase 7 (`docs/STARKEEP_CONTEXT.md §14`'s Phase Build Order).  
**Rationale:** Wireframes are the shipped product; manifesto is the vision. Dual vocabulary causes drift.  
**Mapping:** See `docs/STARKEEP_CONTEXT.md §2`.

---

## DEC-003 — LUX v1: LVM Formula + Manual Admin Validation
**Date:** 2026-04-25  
**Status:** LOCKED  
**Decision:** Full LVM formula runs server-side on every validated milestone. Validation is manual via Django admin. Validator staking, peer validation, and slashing deferred to v2.  
**Rationale:** Manual validation exposes the formula to human judgment before automation. Generates labeled data for future ML-assisted scoring. Avoids risk of issuing real economic value via unvetted automation.  
**DeferredTo:** Phase 6 ships manual. v2 ships peer staking.

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
**Status:** LOCKED, amended 2026-08-14 (see below)  
**Decision:** Single codebase — React Native + Expo Router — targeting iOS, Android, and web simultaneously. No web-first then native-later strategy.  
**Rationale:** Avoids maintaining two codebases. Expo Router's file-based routing works on all three targets. The hiring pool knows React. The tradeoff (some layout quirks on web) is accepted.  
**Constraint:** Screens are built mobile-first. Desktop web gets hover states and wider layouts added on top, never instead of.

**Amendment 2026-08-14 — Web target ships as a separate client, not Expo web.** In practice, the web target ships as `frontend-web/` — a standalone vanilla JS + Three.js application, not Expo Router's web build. Mobile (iOS/Android) still ships from the shared React Native/Expo codebase in `frontend/`, and both talk to the same Django backend, so the "single codebase... targeting iOS, Android, and web simultaneously" claim above no longer holds for the web platform specifically. See `docs/WEB_FRONTEND_ARCHITECTURE.md` for `frontend-web/`'s structure.

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
**Upgrade path:** Push added in phase 8 hardening.

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

## DEC-013 — Constellation Structure is a User-Editable Graph
**Date:** 2026-08-11  
**Status:** LOCKED  
**Supersedes:** `STARMAP_SPEC.md` §4 "Constellation Shape Rules (LOCKED)" and the §7 mitosis deletion rule.

**Decision:** A constellation's stars form a **directed acyclic graph**, stored as an explicit edge list, and the user can restructure it directly.

Four rules from `STARMAP_SPEC.md` are replaced:

| Spec rule (was LOCKED) | Replaced by |
|---|---|
| §4 "Shape must not be changed after confirmation — it is the permanent visual identity of that chapter." | Structure is editable at any time via Constellation Edit Mode. |
| §4 "Shape is stored as a set of (x, y) coordinates per star." | Position is **derived** from the graph, not authored. `x`/`y` become computed output, not input. |
| §4 "Connecting lines: drawn between stars in sequence order." | Lines are drawn per edge. A star may have several predecessors and successors — branches, and branches that rejoin the trunk. |
| §7 "original star is not deleted on mitosis… structurally all stars are peers." | Offshoots are **prerequisites** of the parent, sequenced ahead of it. A parent left with no steps and no evidence is **consumed** by its offshoots. |

**Why the parent is consumed rather than kept as a rollup.** Splitting means breaking work into pieces that culminate in the original's completion, so once nothing of the original remains, completing the offshoots *is* completing it. Keeping it as an auto-completing aggregate would break two invariants: a Star always requires evidence to complete, and the parent would be issued LUX on top of the LUX its offshoots already earned — double-counting against the immutable ledger (DEC-008). A parent that still holds steps or evidence has independent work and survives.

**Why a DAG rather than a sequence.** Real plans contain work that can proceed in parallel and then converge. A linear chain cannot express "these three things in any order, then this".

**Rationale for editability:** shape-as-permanent-identity assumed the AI's initial structure is correct and final. In practice the structure is the user's own understanding of their plan, and that changes as they learn — most sharply right after a mitosis, which is exactly when the spec forbade rearrangement.

**Implementation:** `frontend-web/js/starGraph.js` (pure graph + layout, unit-tested via `starGraph.test.mjs`), consumed by `frontend-web/js/views/StarMapView.js`.

**Backend impact (implemented, Phase 4):** `ConstellationEdge` (`backend/apps/starmap/models.py`) stores the DAG explicitly — `constellation`, `from_milestone`, `to_milestone` FKs, unique per constellation, no self-edges. The client's full edge list is replaced atomically via `POST /constellations/{id}/edges`; the server re-validates acyclicity independently of the client (`apps/starmap/graph.py`'s `find_cycle`, a DFS 3-color check — defense in depth, never trust the client for something this structural). Mitosis (`POST /milestones/{id}/split`) rewires edges using `apps/starmap/graph.py`'s `replace_node_with_chain`/`insert_chain_before` — deliberate line-for-line ports of the same functions in `starGraph.js`, so client-side preview and server-side persistence can never disagree about the rewiring rules. See `API_CONTRACT.md` §Star Map.

**Amendment 2026-08-13 — `x`/`y`/`z` are now authored, not derived-only.** The table row above ("Position is derived from the graph, not authored") is superseded. In practice, a drag that repositions a star without also changing which star it's structurally attached to (e.g. nudging it within the same general spot) produces no edge-graph change at all — there was nothing for a derive-only model to persist, so manual repositioning silently failed to survive a reload even though the edge-graph save itself succeeded. `Milestone.x`/`y`/`z` are now writable (`PATCH /milestones/{id}`) and are saved verbatim wherever the client places a star; `z` is a new field (the model previously only had 2D `x`/`y`, with a standing comment that `z` would be added "when VR client needs it" — frontend-web's real 3D scene is that client). On load, a star with saved (non-null) `x`/`y`/`z` uses it directly; `computeLayout()`'s procedural placement is now only the fallback for a star that has never been explicitly positioned. Note the unit convention diverges from the mobile app's 0.0–1.0 normalized `x`/`y` (frontend-web writes raw 3D local-space world units) — there is no 3D mobile consumer yet to conflict with this, but a future unified VR client will need to reconcile the two conventions; flagged here, not solved.

---

## DEC-014 — Quiz Identity Handoff is a One-Time Ticket, Redeemed Server-to-Server
**Date:** 2026-08-23  
**Status:** LOCKED  
**Extends:** DEC-007 (Archetype Quiz: Mode A)

**Decision:** Starkeep acts as the identity provider for the archetype quiz. On launch, Starkeep
mints a **single-use, 120-second, opaque ticket** and sends the browser to the quiz carrying it.
The quiz's *backend* redeems that ticket over a back channel — authenticated with the shared
integration token **and** an HMAC over the request body — and receives the user's identity
(`starkeep_user_id`, `avatar_id`, `email`, `alias`, …). It then creates or finds its own local
account, keyed on `starkeep_user_id`, and starts its own session.

DEC-007 settled *where the quiz runs*; it never said how the quiz learns **who is taking it**.
That gap is why the quiz link was a bare `window.open` to a hardcoded URL that carried no identity
at all, leaving the already-built `POST /avatars/{id}/archetype` endpoint with no way to know which
avatar to write to.

**Why not put a Starkeep JWT in the URL or a postMessage.** Simpler, and rejected: it hands a live,
full-scope account credential to another origin and writes it into browser history, `Referer`
headers, and server logs. A ticket is worthless without the shared secret, is dead 120 seconds
later, and is dead immediately after one use.

**Why not full OAuth2 (django-oauth-toolkit).** Correct if Starkeep ever has several third-party
consumers; heavy for exactly one. The flow above is the authorization-code shape with the
generality removed, so it upgrades to real OAuth without changing the sequence.

**Why the ticket lives in Postgres, not the Redis cache.** It survives a Redis-less local run, and
the consumed/unconsumed trail is what you actually want when debugging an integration with a team
whose code you cannot step through.

**Accepted limitation:** one shared credential pair, no per-caller identity, rotation, or
revocation — any holder of the token may post results for any `avatar_id`. Acceptable while the
quiz is the sole consumer and the data is non-financial. Revisit when a second consumer appears.

**Implementation:** `backend/apps/integrations/` — `QuizLaunchTicket`, `POST
/api/v1/integrations/quiz/launch` (user JWT, throttled), `POST /api/v1/integrations/quiz/exchange`
(integration token + HMAC). Shared credential checks live in
`backend/apps/common/integration_security.py` — in `common` rather than `integrations` because
`apps/avatar/views.py` also uses them and `avatar` sits *below* `integrations` in the DEC-009 layer
order. `apps.integrations` joins the starmap tier in `.importlinter`.

Client: `frontend-web/js/integrationsApi.js`; the launch button is `AvatarView.launchQuiz()`. The
return is a full page load at `/avatar?quiz=complete`, so `main.js` reads that marker *before* its
existing reset-URL-to-`/` step discards it, and hands it to the view through a new one-shot
`Router.navigate(path, context)` argument.

**Also fixed alongside, in `apps/avatar/views.py`:** the results payload is now schema-validated
before write (`ArchetypePayloadSerializer`) — previously `recommended_heroic_path` was copied
straight onto `avatar.heroic_path`, so a typo'd slug silently corrupted the profile despite
`STARKEEP_CONTEXT.md §7` claiming validation existed. Also: constant-time bearer comparison,
idempotent replay of a repeated `quiz_run_id`, `raw_quiz_output` now stores the quiz's own `raw`
rather than our whole envelope, and `visionary_trait` / `divergent_trait` are finally accepted —
the Avatar page renders both and nothing had ever been able to populate them.

**Contract for the quiz repo:** `docs/QUIZ_SSO_INTEGRATION.md`.

**Amendment 2026-08-24 — contract v1.1, after the quiz repo's response.** Four changes, all
additive or subtractive at the edges; the handoff mechanism above is untouched.

1. **The chart is twelve placements, not three.** The quiz computes a full natal chart (Swiss
   Ephemeris), so `mercury_sign` through `pluto_sign` plus `midheaven_sign` are now stored
   alongside the original sun/moon/rising. This cost one migration and turned the Avatar page's
   twelve inert "coming soon" glyphs into real data. The grid is exactly these twelve
   (`☉ ☽ ASC ☿ ♀ ♂ ♃ ♄ ♅ ♆ ♇ MC`), served as an ordered, glyph-annotated `chart` array so the
   client never hardcodes placement order. The Imum Coeli and Descendant were briefly served as
   derived fields (each being the exact opposite of the Midheaven / Ascendant) and then removed:
   derivable is not the same as wanted, nothing renders them, and a derived API field no client
   reads is only surface area. The North Node has no source in the quiz's output at all.

2. **`breakdowns` — interpretive copy from the quiz.** A `{results_key: {title, body}}` JSONB
   column holding the quiz's own per-field prose, so the Avatar page can show a real reading
   rather than our generic per-sign line. **Plain text, not markdown**: `frontend-web` has no
   bundler and no markdown library, and this is third-party content rendered on our page — plain
   text goes through `textContent` and generates no HTML at all. Size-capped on ingest
   (`ArchetypeBreakdownsField`) so a runaway payload cannot park megabytes in the column. Where a
   breakdown exists it takes precedence over `archetypeCopy.js`, which only knows the sign in
   general rather than this user's chart.

3. **`visionary_trait` / `divergent_trait` retired.** The quiz repo pointed out that "Visionary"
   and "Divergent" were its *old category names* for the Heroic Path and Learning Path systems —
   these were never independent outputs, they duplicated `recommended_heroic_path` and
   `recommended_learning_path`. Verified against the UI, which renders each one directly beneath
   its corresponding path title. Removed from the documented contract; the columns stay and are
   still accepted, so nothing breaks and no destructive migration was needed. The short trait line
   now comes from `archetypeCopy.js` (our copy, our voice) and the long form from `breakdowns`.

4. **`recommended_learning_path` is no longer expected from the quiz.** No chamber produces one,
   and the two offered builds were a derived `MBTI × Jung` lookup or a new mini-assessment. Chose
   neither: the six Learning Paths describe how a student *structures their education*, which MBTI
   does not measure, so a derived value would be invented rather than evidenced — and DEC-012 has
   the user explicitly confirm this choice, which reads badly if it was silently inferred. The
   field stays in the schema and the DEC-012 pre-fill still works if it ever arrives; until then
   the Avatar page prompts the user to choose. This also removed the integration's only genuine
   build gap on the quiz side.

**`hermit` is the canonical Jungian slug for this archetype, not `sage`.** The quiz repo asked for
this on the grounds that `sage` is ambiguous with a heroic path name; that was initially judged
wrong, since none of the six current paths is called Sage — but Truthseeker *was* called Sage
earlier in the project, so the objection was correct. Storing a single name per archetype also
keeps any *future* path rename from re-creating the collision, which is the real reason to hold the
line here. `sage` → `hermit` and `outlaw` → `rebel` are accepted on the wire as deprecated aliases
and folded to canonical by `metadata.canonical_jung()` before validation, so legacy callers keep
working while the database only ever holds one name per concept.

`QUIZ_SSO_LAUNCH_PATH` now defaults to `/api/sso/starkeep`, because the quiz's SPA serves every
non-`/api/*` path as `index.html`.

The chart grid is the twelve placements the quiz sends, and nothing else.

**Bug found while implementing this:** `purpose_seed` validated at 500 characters but its column
was `max_length=200`, so a value in between passed validation and then raised a `DataError` on
save. The quiz repo's stated 500-char truncation would have hit it on the first real payload.

---

## PENDING — Settings v1 Contents
**Status:** OPEN — resolve before phase 6  
**Default proposal:** Account info, sign-out, notifications toggle (in-app), theme (auto/light/dark).

---

## PENDING — Mission Inception in v1
**Status:** OPEN — resolve before phase 6  
**Default proposal:** Missions are admin-seeded. Mock AI generates suggestions shown as a list; user picks from the curated set.
