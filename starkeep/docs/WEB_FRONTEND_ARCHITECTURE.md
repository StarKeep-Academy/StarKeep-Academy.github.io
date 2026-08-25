# Starkeep Web Frontend — Persistent WebGL Shell & Modular SPA

> Source: "ARCHITECTURE SPECIFICATION: Persistent WebGL Shell & Modular SPA" (Gemini-authored design doc, transcribed here for repo memory).
> Lives in the repo at `frontend-web/`, per the split-frontend plan in [FRONTEND_API_INTEGRATION.md](FRONTEND_API_INTEGRATION.md).

> **Resolved 2026-08-14:** `docs/DECISIONS.md` DEC-005 ("Cross-Platform: True Parity from Day One") originally locked a single Expo/React Native codebase for iOS, Android, *and* web. DEC-005 now carries a 2026-08-14 amendment documenting that the web target actually ships as this separate Three.js codebase (`frontend-web/`), while mobile (iOS/Android) still ships from the shared React Native/Expo codebase (`frontend/`) — both against the same Django backend. See DEC-005 in `docs/DECISIONS.md` for the full note.

## Objective

Refactor the web app into an SPA with a **persistent WebGL shell** running Three.js. View transitions (e.g. main menu → Star Maps) perform smooth 3D camera animations and dynamic UI overlays without full browser reloads — preserving WebGL context, active WebSockets, and state memory across navigation.

## Target Project Structure

```
frontend-web/
├── index.html          # Single HTML shell holding #three-canvas and #app
├── css/
│   └── styles.css      # Modal/panel/glassmorphism system + CSS custom properties
├── js/
│   ├── main.js          # Application bootstrapper — builds the static routes map, initial scene trigger
│   ├── scene.js          # Core Three.js engine (starfield, persistent lighting, camera/tick registry)
│   ├── router.js          # SPA router (History API pushState/popstate)
│   ├── store.js          # Global state manager (user session, socket state)
│   ├── constants.js       # Shared static data/config (star + constellation seed data)
│   ├── config.js          # API_BASE resolution (same-origin by default; :5500/:3000/:8081 fall back to :8000; window.STARKEEP_API_BASE overrides)
│   ├── api.js             # Base HTTP client, auth token storage, ApiError — everything else wraps this
│   ├── starmapApi.js      # Star Map API client (GET/POST star maps, constellations, milestones/evidence)
│   ├── avatarApi.js       # Avatar API client (North Star goal persistence, avatar profile)
│   ├── integrationsApi.js # Archetype-quiz SSO launch (DEC-014) — the quiz URL lives on the server, never here
│   ├── archetypeCopy.js   # Display copy for zodiac / Jung / MBTI / path vocabulary (presentation only)
│   ├── starGraph.js       # Pure, THREE-free constellation edge-graph + force-directed layout (DEC-013; unit-tested, see below)
│   ├── starGraph.test.mjs # Node-runnable test suite for starGraph.js (103 assertions)
│   ├── materials/
│   │   ├── RadialGradientMaterial.js  # unlit view-space gradient shader (planet + star gem bodies)
│   │   └── StarSigilMaterial.js       # faceted gem shader (Fresnel rim + pulse) for star cores
│   └── views/
│       ├── HomeView.js         # Radial-nav hub (Phase 2 shell) & 3D nav-node overlay
│       ├── StarMapView.js      # Star Maps UI & constellation 3D overlays — real backend read+write via starmapApi.js/avatarApi.js
│       ├── AvatarView.js       # Image 7 profile — paths, archetype, editing, quiz launch (Phase 5)
│       ├── ProfileView.js      # Account & identity subpage (email, member-since, sign-out) — Phase 5
│       └── AcademyChatView.js  # NOT YET BUILT — Chat/Discord UI overlay
```

`HomeView.js` is the radial-nav hub (Phase 2 shell) — it links to five nodes: `starmap` and
`avatar` (both built), plus `academy`, `missions`, `lux` (still stubs). `router.js` falls
back to `home` for any route with no registered module, so clicking an unbuilt nav node
currently just re-mounts the hub rather than erroring.

A nav node's submenu entry may carry its own `route` (`{label, route}` instead of a bare
string) — that is how **AVATAR ▸ PROFILE** reaches `/profile`. Entries without a route stay
inert labels, as they were.

`Router.navigate(path, context)` takes an optional one-shot `context` object, passed through to
the incoming view's `mount()`. It exists for the archetype-quiz return (DEC-014): that redirect
is a full page load at `/avatar?quiz=complete`, and `main.js` reads the marker *before* its
reset-URL-to-`/` step discards it, then hands it to `AvatarView` this way. Context is not
persisted, so a later reload or Back does not replay it.

## Technical Specifications

### 1. Persistent WebGL Engine (`js/scene.js`)

- Keeps `WebGLRenderer`, main `Scene`, `Camera`, and core background meshes (Earth sphere, starfield) persistent across all views.
- Exposes smooth interpolation functions — `cameraTo(targetPos, targetLookAt, duration)`, `setWarpSpeed(intensity)` — that views/router can invoke during transitions.
- Supports dynamic registration and cleanup of view-specific 3D objects (`addOverlayMesh` / `removeOverlayMesh`) via a shared `viewGroup`.
- Exposes a per-frame tick registration (`registerTick` / `unregisterTick`) so views can hook animation logic into the single persistent render loop instead of running their own `requestAnimationFrame`/render calls (this avoids double-rendering — an addition beyond the original spec, needed because views must never own a render loop).

### 2. Router & View Manager (`js/router.js`)

Superseded the original fade/dynamic-`import()` design with a simpler synchronous version
(Gemini's later revision — adopted verbatim):

- Uses the browser **History API** (`pushState`/`popstate`) for real paths (`/starmap`, not
  `#starmap`). `router.navigate(path)` pushes a history entry and re-resolves; a `popstate`
  listener (back/forward buttons) re-resolves the same way.
- Views are **statically imported** in `main.js` and passed into the router as a plain
  `{ path: ViewClass }` map — no lazy `import()`, no code-splitting. `main.js` calls
  `new Router(routes, sceneEngine)`, then `router.handleRoute()` once for the initial URL.
- `handleRoute()`: destroys the outgoing view (`currentView.destroy()`), resolves
  `routes[path] || routes.home`, instantiates it (`new ViewClass(this)`), injects
  `render()`'s markup into `#app`, then calls `mount({ scene, camera })` — no fade
  transition and no router-driven camera animation; each view now owns its own entrance
  animation entirely (see `HomeView.js`'s internal reveal classes and
  `StarMapView.js`'s `sceneEngine.cameraTo()` call in `mount()`).
- **Deep-link caveat:** because routes are real paths, a hard refresh or a typed-in URL on
  `/starmap` will 404 on a plain static file server (there's no file at that path) — only
  in-app `navigate()`/`popstate` transitions work without a server rewrite rule. See "How to
  run it" below for the workaround.

### 3. Modular View Standard Protocol (as actually implemented)

Each view in `js/views/` is a **class**, default-exported (and named-exported), instantiated
fresh by the router on every navigation — `new ViewClass(router)` — so per-visit state (phase,
selection, etc.) never leaks between mounts. The router only ever calls `.render()`,
`.mount({scene, camera})`, and `.destroy()` directly (no `init`/`cleanup` aliases are invoked
by this router, though `HomeView.js` still defines them as harmless dual-protocol wrappers):

```js
export class SomeView {
  constructor(router) {
    this.router = router; // stash — also your only path to router.sceneEngine
  }

  // 1. Returns the UI markup for insertion into #app
  render() {
    return `<div class="view-container"><!-- View Markup --></div>`;
  }

  // 2. Runs after DOM injection; sets up listeners & scene-specific 3D objects.
  //    Router passes only {scene, camera} — reach the engine via this.router.sceneEngine
  //    if you need cameraTo()/registerTick()/addOverlayMesh().
  mount({ scene, camera }) {
    // Attach event listeners
    // Inject view-specific 3D meshes/particles into scene
  }

  // 3. Runs prior to route transition out (called with no arguments); disposes local resources.
  destroy() {
    // Remove DOM/window listeners
    // Dispose geometries, materials, textures from GPU memory
    // Remove view-specific 3D objects from scene
  }
}

export default SomeView;
```

`HomeView.js` runs its own lightweight `requestAnimationFrame` loop for DOM position syncing
(projecting 3D nav-node positions to 2D screen coordinates) — this is fine and does **not**
violate the single-render-loop rule, because it never calls `renderer.render()` itself; only
`scene.js`'s persistent loop does that. `StarMapView.js` instead registers its per-frame work
with `sceneEngine.registerTick()` (an addition beyond the PDF, described below) — either
pattern is acceptable as long as a view never renders on its own.

### 4. GPU Memory & Asset Lifecycle Guidelines

- **Geometry/Texture Management:** any mesh or texture loaded specifically for a view (e.g. avatar meshes, constellation particles) must be explicitly disposed of inside the module's `destroy()`:

  ```js
  geometry.dispose();
  material.dispose();
  if (material.map) material.map.dispose();
  scene.remove(mesh);
  ```

- **Persistent WebSockets:** chat/notification socket connections live in `js/store.js` at the shell level so routes can mount/unmount without terminating network sockets.

## How to run it

ES modules (`import`) are blocked over `file://`, and History API routing needs URL rewriting
for anything beyond the root, so use a real static server:

```
cd frontend-web
npx serve -s .        # -s enables SPA fallback: unknown paths resolve to index.html
```

`python -m http.server` also works for the root `/` route and in-app navigation, but a hard
refresh on `/starmap` will 404 without `-s`-style SPA fallback.

## Implementation Roadmap

- [x] Step 1: Refactor menu setup into a clean `index.html` shell containing only `<canvas id="three-canvas">` and `<div id="app">`.
- [x] Step 2: Extract Three.js rendering and camera controller logic into `js/scene.js`.
- [x] Step 3: Implement lightweight client-side router in `js/router.js` (History API, static route map — see Section 2 above for how this diverged from the original dynamic-`import()` design).
- [x] Step 4: Convert main menu/hub overlay into `js/views/HomeView.js` (radial nav, Phase 2 shell).
- [x] Step 5: Convert Star Maps screen into `js/views/StarMapView.js`, with constellation line creation in `mount()` and camera deceleration on entry via `sceneEngine.cameraTo()`.
- [ ] Step 6: Verify zero page reloads during navigation and confirm memory disposal when toggling between views.
- [ ] Step 7 (not in original spec, partial): Build `AvatarView.js` **(done, Phase 5)** and `ProfileView.js` **(done, Phase 5)**; still to build — `AcademyChatView.js`, `MissionLogView.js`, `LuxWalletView.js`.
- [x] Step 8 (not in original spec, partial): Wire real API calls per [FRONTEND_API_INTEGRATION.md](FRONTEND_API_INTEGRATION.md) for Star Maps — `js/starmapApi.js` and `js/avatarApi.js` (built on the shared `js/api.js` client) now do real read+write against the backend for an existing map, per-star mutations, and North Star goal persistence. `constants.js`'s `STAR_DATA`/`CONSTELLATION_CONFIG` remain in use only as the first-time onboarding walkthrough's seed content (no real AI roadmap-generation endpoint exists yet) — a real, logged-in account with a persisted map no longer touches mock data at all.

## Star Map — STARMAP_SPEC.md alignment

`StarMapView.js` was audited against [STARMAP_SPEC.md](STARMAP_SPEC.md) (LOCKED for v1) and brought in line on functionality/IA while keeping the existing 3D aesthetic. What now maps to the spec:

- **Four zoom levels** (§1) — `PHASE.CREATION / NORTH_STAR / FULL_SKY / CONST_FOCUS`. Named constants, not bare integers.
- **Zoom 0 North Star screen** (§2) — real camera state (flies to the North Star, sky fades to 20%) with computed purpose / last-star / most-active / next-step content. `computeNextStep()` implements the spec's priority order.
- **Polar positioning** (§3, §11) — constellations store `angle_deg` + `radius`; `polarToVector3()` in `constants.js` is the single conversion point, so real API data drops in unchanged. `tilt_deg` is a web-only 3D extra, not an API field.
- **Constellation states** (§3) — `complete` / `in_progress` / `incomplete`, computed as the mobile app does; connector + spoke lines now re-light at runtime via `refreshConstellationVisuals()`.
- **Planet orbits** (§5) — built on star expand only (`buildPlanetOrbits()`); rings derive from `planet.order`, innermost = first to complete (LOCKED rule). The resting star keeps its 2 decorative astrolabe rings.
- **Panel content states** (§5) — description, all-planets-complete gold prompt, and a read-only completed state (completion date, LUX earned, archived planets).
- **Mitosis** (§7) — "AI: split a step into its own star". Promoted steps become stars sequenced *ahead* of the parent as prerequisites; see the star graph below. Sub-step breakdowns are local placeholders; `starkeep-ai` wiring is Phase 5 per DEC-004.

**Deliberately not implemented:**
- **Minimap** (§9) — declined; the left-HUD directory panel (with per-constellation progress bars) serves the same navigational purpose.
- Spec's react-native-skia / gesture-handler IMPL notes (§3, §4) — 2D-canvas-specific; this is a Three.js/OrbitControls scene.
- Spec's literal ms-by-ms transition choreography (§6) — treated as intent; the 3D camera tweens serve it.

## Star graph & Constellation Edit Mode (DEC-013)

`js/starGraph.js` holds a constellation's structure as a **directed acyclic graph** —
an edge list of `{ from: starId, to: starId }` — and derives everything else from it.
This replaced an implicit "sequence" that lived in two places at once
(`flatStarsArray` push order and the connector-line chain) and drifted apart after
any split, which is what caused split stars to overlap and to lose their place in
the sequence.

- **Positions come from a 3D force-directed layout, not a layered/spine model.**
  An earlier version ranked stars by longest path and laid them out along a single
  monotonically-increasing axis with a curve on top; a hand-authored reference
  shape (the old fixed per-constellation `offsets`, scattered freely with no
  dominant axis and much larger spacing) reliably looked more like a real
  constellation than anything that model produced, however much curve was added
  — because privileging one axis at all is what made it read as "a line," not the
  amount of wiggle layered onto it. `computeLayout()` now runs real spring physics
  in 3D instead: every pair of stars repels, each edge is a spring pulling toward
  `edgeLength` (~50 units, matching that reference shape), and only a very weak
  radial bias keeps later-sequence stars trending outward without pinning any
  axis or angle. Forking structure spreads apart on its own — two children of one
  star both want to sit `edgeLength` from their parent but repel each other, so
  they splay into a real "V" rather than a fixed sibling offset. A final pass
  (`declutterPositions()`) guarantees no two stars come within `minSeparation`,
  so overlap is structurally impossible rather than merely unlikely.
- **Structural edits preserve whatever arrangement already exists — manual or
  procedural — rather than reshaping the whole constellation.** The full layout
  above only runs once, when a constellation has no existing arrangement to
  preserve (`confirmLoopItem`, a brand-new constellation). Every edit after that —
  creating a star, splitting one, dragging to reorder, linking, deleting — goes
  through `applyGraphChange()`, which positions ONLY the stars that need it
  (`placeNewStars()`, extending outward from the attachment point) and otherwise
  only moves a star if `declutterConstellation()` finds it's actually too close to
  something. Locking in edit mode declutters, it does not re-run the full layout.
  This replaced an earlier version that recomputed everyone's position on every
  edit, which fought with manual dragging and produced a visible jarring snap
  merely from creating one new star.
- **Connector lines are a render artifact** rebuilt from the edge list wholesale.
  The old incremental path used `.find()` (one incoming/one outgoing only) and
  disposed exactly two `Line` objects, orphaning the rest in the scene.
- **Edit mode** (`EDIT` beside the astrolabe button, constellation focus only):
  drag a star to reorder it — dropping on a link inserts into it, dropping on a
  star branches from it. A star that *forks* carries its exclusively-owned subtree;
  a plain link in a chain moves alone (or reordering would be impossible). A branch
  that rejoins the trunk correctly stays put. Merges are authored explicitly by
  dragging a star's link handle — a standalone element positioned next to the star
  itself (not embedded in its title label, which used to make it easy to miss and
  easy to confuse with dragging the title) — onto the star it should feed into.
  Undo/redo, inline rename (a modal, not `prompt()`), delete-with-heal, sequence
  badges, and cycle rejection are all in `StarMapView.js`.
- **Star picking in edit mode is a screen-space "invisible circle," not a 3D
  raycast.** A star's title label is anchored at the star's own screen position
  (lifted above it, but still close), so a precise raycast against the gem
  geometry mostly hit the label's DOM element instead — which had no drag
  handler — before the click ever reached the canvas. `pickStarAt()` instead
  checks screen-space distance from the pointer to each star's projected
  position (`STAR_GRAB_RADIUS_PX`), independent of the label entirely.
- **`js/starGraph.js` is deliberately THREE-free** — `frontend-web` has no bundler
  and no `node_modules`, so a module importing `three` can only be syntax-checked.
  Keeping the graph and layout maths dependency-free means it is genuinely
  unit-testable:

  ```
  cd frontend-web/js && node starGraph.test.mjs     # 103 assertions
  ```

  The suite covers the reported overlap bugs directly (repeated splits, deleting a
  parent with multiple offshoots, minimum separation across five topologies), the
  force-directed layout's shape (no dominant axis, branches actually diverge, not
  collinear even unbranched), the flattest-view-axis camera framing, and
  `declutterPositions()`'s "untouched unless actually overlapping" guarantee.
- **`backend/apps/starmap/graph.py` is a server-side port of the pure edge-graph
  helpers** (`edges_without`, `normalize_edges`, `splice_out_node`, etc.), kept
  deliberately line-for-line equivalent to `js/starGraph.js` so the client
  (which computes edge lists interactively during a drag/mitosis preview) and
  the server (final authority on what actually gets persisted) can never
  disagree about the rewiring rules. The write path is real now — see Step 8
  above — so this parity is load-bearing, not aspirational.
