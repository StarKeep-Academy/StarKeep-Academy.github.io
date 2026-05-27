# Star Map — IA & Interaction Spec
# Companion to Figma design. Claude Code reads this before implementing any Star Map feature.
#
# Status: LOCKED for v1 implementation
# Last updated: 2026-05-20
# Source: Product design session — full grilling transcript
#
# HOW TO USE THIS FILE
# Each section maps directly to a component or screen in the frontend.
# Implementation notes are marked: IMPL:
# Decisions that must not be changed are marked: LOCKED
# Deferred features are marked: DEFER

---

## 1. Hierarchy Overview

The Star Map has one canvas with four conceptual zoom levels.
It is not four separate screens — it is one continuous spatial canvas
that reveals different levels of detail based on zoom state.

```
ZOOM 0    North Star         → ultimate goal, momentum, next action
ZOOM 1    Full Sky           → all constellations radiating from North Star
ZOOM 2    Constellation      → individual stars in constellation shape
ZOOM 2+   Star (expanded)    → inline planet orbit + side panel detail
```

### Celestial Body Hierarchy

```
North Star    → singular ultimate goal (one per avatar, always present)
Constellation → a major chapter of the journey
Star          → a meaningful milestone (earns LUX on completion)
Planet        → a sub-task of a star (no LUX, checklist only)
```

### Semantic Rules (LOCKED)

- Every celestial body type means something specific. Do not reuse visual types.
- A Star always earns LUX. A Planet never does.
- A Star always requires evidence to complete. A Planet never does.
- Planets are cognitive scaffolding — they are a glorified checklist,
  not a gating mechanism (unless all planets done triggers evidence prompt).
- The constellation shape is always derived from its star structure.
  It is never decorative. Shape = structural data.

---

## 2. Zoom 0 — North Star Screen

### Layout

```
┌─────────────────────────────────┐
│                                 │
│      PURPOSE STATEMENT          │  ← dominant, emotional, user's own words
│      (large, centered)          │     font: Orbitron, color: fg.primary
│                                 │
│  ─────────────────────────────  │  ← subtle divider
│                                 │
│  Last star: 3 days ago          │  ← momentum signal, muted text
│  Most active: [constellation]   │  ← most active constellation name, accent.cyan
│                                 │
│  ┌─────────────────────────┐    │
│  │  YOUR NEXT STEP         │    │  ← one next action prompt
│  │  [planet or star title] │    │     pulled from most proximate incomplete item
│  │  → [constellation name] │    │     tapping navigates to that item on canvas
│  └─────────────────────────┘    │
│                                 │
│                    [★]          │  ← North Star icon, bottom corner
│                                 │     collapsed minimap trigger
└─────────────────────────────────┘
```

### Content Rules

- Purpose statement is the user's confirmed North Star goal text verbatim.
- "Last star" date is computed from most recent approved Milestone.
- "Most active constellation" is computed from most recent milestone activity
  across all constellations — not completion percentage.
- "Your next step" surfaces the single most proximate actionable item:
  priority order → incomplete planet (innermost orbit first)
  → incomplete star with no planets → incomplete star with unchecked planets.
- Tapping "your next step" navigates directly to that item:
  zooms to Zoom 1 → snaps to constellation → expands star inline.

### IMPL Notes

```
API calls needed:
  GET /star-maps/{avatar_id}              → full tree for next-step computation
  GET /avatars/{avatar_id}                → purpose statement
  GET /lux/transactions?type=issuance     → last star date (most recent issuance)

Computed client-side:
  most_active_constellation   → constellation with most recent milestone.updated_at
  next_step                   → traverse tree: find first incomplete planet
                                ordered by proximity, else first incomplete star

North Star icon position: bottom-right corner, always visible on this screen
```

---

## 3. Zoom 1 — Full Sky

### Layout

```
                    [North Star]
                        ★
             constellation  constellation
        constellation          constellation
    constellation                  constellation
                        ★ (North Star center)

                [+ button]      [★ minimap icon]
```

### Behavior

- Canvas is pannable in all directions.
- North Star is always at the true center of the canvas coordinate space.
- Constellations radiate outward from North Star.
  Position is set at creation time by AI and stored as (angle, radius) on the model.
- Tapping a constellation triggers the Zoom 1 → Zoom 2 transition (see Section 6).
- Non-tapped constellations soft-fade to ~20% opacity during focus.
- + button persists at all zoom levels. Smaller once North Star exists.
- Minimap icon (North Star glyph) persists bottom corner, collapsible.

### Constellation Appearance at Zoom 1

```
Confirmed, incomplete   → dim outline of shape, name label below, muted glow
Confirmed, in progress  → brighter outline, name label, cyan accent glow
Confirmed, complete     → fully glowing shape, name label, white glow
Ghost (pending confirm) → dashed outline, name label, very low opacity, centered
```

### IMPL Notes

```
Canvas: react-native-skia or react-native-svg
  Coordinate system: normalized (0,0) = North Star center
  Constellation position: stored as { angle_deg, radius } on Constellation model
  Pan: react-native-gesture-handler PanGestureHandler
  Zoom: PinchGestureHandler (pinch out = zoom in to constellation)

Constellation completion state computed from:
  complete    → all stars status === 'approved'
  in_progress → at least one star status === 'approved'
  incomplete  → no stars approved

Soft fade: Animated opacity on non-focused constellation groups
  focused:     opacity 1.0
  non-focused: opacity 0.2
  transition:  duration 250ms, easing ease-out
```

---

## 4. Zoom 2 — Constellation Focus

### Layout

```
        ★ (dim, non-focused constellation)

    ●━━━●━━━●         ← constellation shape
        |               stars connected by dim lines
    ●━━━●               matching the constellation's visual form
        |
        ●

        ★ (dim, non-focused constellation)

[← back]                           [★ minimap]
```

### Star Appearance at Zoom 2

```
approved (Star/complete)
  → fully glowing white circle, strong glow effect
  → connecting lines between stars lit up

active / submitted (in progress)
  → medium brightness, cyan tint, pulsing glow animation
  → connecting lines partially lit

pending (not started)
  → dim outline circle, very low opacity
  → connecting lines unlit

star with planets (any status)
  → small orbital ring visible around the star at rest
  → ring expands to show planets on tap
```

### Constellation Shape Rules (LOCKED)

- Shape is determined by the AI star structure at constellation creation time.
- Shape is stored as a set of (x, y) coordinates per star, relative to
  constellation center. These are the star placement hints from the Star model.
- Shape must not be changed after confirmation — it is the permanent visual identity
  of that chapter of the user's journey.
- As stars are added via mitosis, the shape rearranges to accommodate new nodes.
  Existing star positions shift; the constellation redraws with an animation.
- Shape rearrangement animation: stars slide to new positions over 400ms.

### IMPL Notes

```
Star positions: stored as { x: float, y: float } on Milestone model (normalized)
  range: -1.0 to 1.0 relative to constellation center
  VR NOTE: z coordinate added later as optional field (DEC-006)

Connecting lines: drawn between stars in sequence order
  color: rgba(255,255,255,0.15) incomplete
         rgba(168,230,255,0.6)  complete (cyan)

Pulsing animation (in-progress stars):
  Animated scale: 1.0 → 1.08 → 1.0, loop, duration 2000ms

Back navigation: tap outside constellation or back button → reverse transition
```

---

## 5. Star Expansion (Zoom 2+)

### Trigger

Tap any star at Zoom 2.

### Canvas Behavior

```
Star tapped
  → star pulses once (scale 1.0 → 1.15 → 1.0, duration 200ms)
  → star expands slightly (scale settles at 1.1)
  → planets extend into orbit simultaneously
    → each planet animates from star center outward to orbit position
    → staggered: inner planets first, duration 300ms each, 50ms stagger
  → canvas shifts left ~30% to make room for side panel
```

### Planet Orbit Layout

```
Proximity = order of completion (LOCKED)
  innermost orbit ring → first planet to complete
  next ring out        → second planet
  outermost ring       → last planet

Multiple planets at same priority:
  → same orbital ring, distributed evenly by angle

Visual states:
  incomplete → dim circle, dashed orbit ring
  completed  → solid circle, locked glow, solid orbit ring
```

### Side Panel (slides in from right)

**Incomplete star, no planets:**
```
┌──────────────────────────┐
│ [Star title]             │
│ [Description]            │
│ ─────────────────────    │
│ EVIDENCE                 │
│ [upload zone]            │
│ [+ add link]             │
│ [+ add text note]        │
│ ─────────────────────    │
│ [SUBMIT FOR VALIDATION]  │  ← disabled until evidence attached
│                          │
│ [✦ AI: split this star]  │  ← mitosis trigger, subtle
└──────────────────────────┘
```

**Incomplete star, with planets:**
```
┌──────────────────────────┐
│ [Star title]             │
│ [Description]            │
│ ─────────────────────    │
│ PLANETS                  │
│ ○ [planet 1 title]       │  ← innermost first
│ ○ [planet 2 title]       │
│ ● [planet 3 title]       │  ← ● = completed
│ ─────────────────────    │
│ EVIDENCE                 │
│ [upload zone]            │
│ ─────────────────────    │
│ [SUBMIT FOR VALIDATION]  │  ← enabled when evidence attached
│                          │
│ [✦ AI: split this star]  │
└──────────────────────────┘
```

**All planets complete — evidence prompt:**
```
┌──────────────────────────┐
│ [Star title]             │
│                          │
│  ✦ All planets complete  │  ← highlighted prompt, gold accent
│  Ready to submit?        │
│                          │
│ EVIDENCE                 │
│ [upload zone]            │
│ ─────────────────────    │
│ [SUBMIT FOR VALIDATION]  │
└──────────────────────────┘
```

**Completed star:**
```
┌──────────────────────────┐
│ ★ [Star title]           │  ← star glyph indicates completion
│ [Description]            │
│ ─────────────────────    │
│ Completed [date]         │
│ +[N] LUX earned          │  ← gold text
│ ─────────────────────    │
│ EVIDENCE SUBMITTED       │
│ [evidence items, r/o]    │
│ ─────────────────────    │
│ PLANETS (archived)       │
│ ● [planet 1] ✓           │  ← all shown as complete/locked
│ ● [planet 2] ✓           │
└──────────────────────────┘
```

### Star Completion Paths (LOCKED)

```
PATH A — Bottom up
  all planets checked off
    → all-planets-complete prompt appears in side panel
    → user attaches evidence
    → taps SUBMIT FOR VALIDATION
    → star status → submitted
    → admin validates → star status → approved
    → star lights up fully, LUX issued via signal

PATH B — Direct
  user attaches evidence without completing planets
    → taps SUBMIT FOR VALIDATION
    → star status → submitted
    → on approval: planets archived (visible in completed panel, locked)
    → star lights up, LUX issued
```

### IMPL Notes

```
Side panel: bottom sheet on mobile, right panel on tablet/web
  react-native: BottomSheetModal (gorhom/bottom-sheet)
  web: absolute positioned panel, right: 0, width: 380px

Evidence upload (v1):
  text note  → stored as Evidence { type: 'text', payload: text }
  link       → stored as Evidence { type: 'link', payload: url }
  photo      → base64 in v1, GCS URL in phase 4+ (no schema change)

Submit button state:
  disabled   → no evidence attached
  enabled    → at least one evidence item present
  loading    → POST /milestones/{id}/submit in flight
  success    → status pill updates to 'submitted', panel shows pending state

API calls:
  POST /milestones/{id}/evidence        → add evidence item
  POST /milestones/{id}/submit          → submit for validation
  PATCH /milestones/{id}               → update planet checked state
```

---

## 6. Transitions

### Zoom 1 → Zoom 2 (Enter Constellation)

```
Trigger: tap constellation at Zoom 1

Step 1 (0ms):      canvas begins scaling up (fly toward)
Step 2 (100ms):    non-focused constellations begin fading to 0.2 opacity
Step 3 (150ms):    tapped constellation stars begin expanding outward (unfold)
                   stars animate from constellation center to their (x,y) positions
Step 4 (400ms):    zoom settles, stars locked in position
Step 5 (450ms):    planets appear on stars that have them (small orbital rings)

Total duration: ~500ms
Easing: ease-in-out for scale, ease-out for star unfold
```

### Zoom 2 → Zoom 1 (Exit Constellation)

```
Trigger: tap back button or tap outside constellation bounds

Reverse of entry:
  stars fold inward to constellation center
  canvas scales back down
  other constellations fade back to full opacity
  
Duration: 350ms (slightly faster than entry)
```

### Star Tap (Zoom 2 → Expanded)

```
Trigger: tap star at Zoom 2

Step 1 (0ms):      star pulses (scale 1.0 → 1.15 → 1.0, 200ms)
Step 2 (100ms):    star settles at scale 1.1
                   canvas shifts left 30% simultaneously
Step 3 (150ms):    planets begin extending from star center outward
                   staggered by 50ms per planet, inner first
Step 4 (200ms):    side panel begins sliding in from right
Step 5 (400ms):    all planets in position, panel fully visible

Total duration: ~450ms
```

### Collapse Star (Expanded → Zoom 2)

```
Trigger: tap elsewhere on canvas or X on side panel

Planets retract to star center simultaneously (200ms)
Side panel slides out right (200ms)
Canvas shifts back to center (200ms)
Star returns to scale 1.0 (200ms)
All run in parallel.
```

---

## 7. Mitosis Flow

### Star Mitosis (star → more stars in constellation)

```
Trigger: user taps "✦ AI: split this star" in side panel
         OR AI recommendation banner appears on stalled star

Step 1: side panel shows AI suggestion list
        each suggestion is a proposed new star title + description
        user can edit any suggestion inline

Step 2: user confirms suggestions one by one
        confirmed stars appear as ghost nodes on constellation canvas
        dismissed suggestions disappear from list

Step 3: once all confirmed
        constellation shape rearranges to accommodate new stars
        existing stars slide to new positions (400ms)
        new stars fade in at their positions
        original star remains — it is now the "parent" visually
        but structurally all stars are peers in the constellation

LOCKED: original star is not deleted on mitosis.
        it becomes one star among the expanded set.
        its completion is now independent of the new stars.
```

### Planet Mitosis (planet → more planets in orbit)

```
Same trigger pattern: user initiates or AI recommends on a planet

Step 1: side panel shows AI suggestion list for sub-tasks
Step 2: user confirms each
Step 3: new planets added to orbit
        orbit rearranges to accommodate (same ring or new outer ring)
        proximity order preserved — new planets default to outermost

LOCKED: planets can multiply indefinitely.
        there is no maximum planet count enforced in UI.
        layout must handle gracefully up to ~8 planets.
```

### AI Suggestion UI (both mitosis types)

```
┌──────────────────────────┐
│ ✦ Split suggestion       │
│ ─────────────────────    │
│ [editable title 1]    ✓  │
│ [editable title 2]    ✓  │
│ [editable title 3]    ✗  │  ← user dismissed this one
│ [+ add your own]         │
│ ─────────────────────    │
│ [CONFIRM SPLITS]         │
└──────────────────────────┘
```

---

## 8. Creation Flow

### Empty State

```
Canvas: blank dark sky, no constellations
Dome arc: present (consistent with rest of app)

Single element on canvas:
  gold-glowing + button, centered lower third
  label below: "create new constellation"
  glow: colors.accent.gold, pulsing softly
```

### North Star Creation

```
Step 1: user taps + button
        "What is your goal?" prompt appears
        North Star gold orb appears on canvas immediately
        (goal not yet confirmed but star is becoming real)

Step 2: goal input UI
        top item pre-filled from avatar.archetype.purpose_seed
        remaining items: AI suggestions based on heroic path
        user selects or types custom goal
        confirms

Step 3: North Star confirmed
        orb pulses, grows slightly, settles as the permanent North Star
        AI generates constellation suggestions (4–6 typical)

Step 4: constellation confirmation loop
        first ghost constellation appears CENTERED near North Star
        shows: name + shape silhouette only (no stars visible)
        shape silhouette derived from AI star structure (backend-computed)
        confirmation prompt: "Is this a chapter of your journey?"

Step 5: user confirms
        constellation animates from center outward to radial position
        solidifies slightly (ghost → dim outline)
        next ghost constellation appears centered
        repeat

Step 6: user dismisses a suggestion
        it fades in place, no spatial animation
        next suggestion appears

Step 7: all suggestions processed
        all confirmed constellations pulse once into final form
        sky is populated
        + button shrinks, repositions to corner area
```

### New Constellation Creation (North Star exists)

```
Same + button (smaller, persistent at all zoom levels)
Same goal input menu
  top item: blank or user-typed
  AI suggestions: based on North Star goal + existing constellation names
Same one-by-one confirmation loop
Same radiate-outward animation on confirm
```

### Goal Input Component

```
┌──────────────────────────┐
│  What is your goal?:     │
│ ┌────────────────────┐   │
│ │ [top: pre-filled]  │   │  ← purpose_seed or previously selected
│ │ [suggestion 2]     │   │
│ │ [suggestion 3]     │   │
│ │ [suggestion 4]     │   │
│ │ [suggestion 5]     │   │
│ │ [+ write your own] │   │
│ └────────────────────┘   │
└──────────────────────────┘

Selecting an item highlights it (bg: colors.bg.surface, border: accent.cyan)
"Write your own" opens inline text input within the same component
Confirm button appears once a selection is made or text is entered
```

---

## 9. Minimap

### Collapsed State

```
Element: North Star glyph icon
Position: bottom-right corner, all zoom levels
Size: 32×32px
Appearance: gold glyph, subtle glow
Tap: expands minimap
```

### Expanded State

```
Size: ~200×200px overlay, bottom-right
Content: thumbnail of full sky
  North Star at center
  All constellation positions as small dots
  Current viewport indicated by a subtle highlight region
  User's position relative to whole map always visible

Interaction:
  tap any constellation dot → jump directly to that constellation (Zoom 2)
  tap North Star dot → navigate to Zoom 0
  tap X or tap outside → collapse back to icon
```

### Behavior Rules

```
Default state: collapsed
Persists across zoom levels: always visible (collapsed or expanded)
During active star work (side panel open): stays collapsed unless user expands
Auto-collapses: when user begins panning the canvas
```

---

## 10. Component Map (Frontend)

Each component maps to a file in `frontend/features/starmap/components/`.

```
StarMapCanvas           → main canvas, handles zoom state, pan, gesture routing
NorthStarScreen         → Zoom 0 layout (purpose, momentum, next action)
FullSkyView             → Zoom 1 (constellation positions, pan, North Star center)
ConstellationView       → Zoom 2 (star positions, connecting lines, soft fade)
StarNode                → individual star on canvas (all visual states)
PlanetOrbit             → orbit ring + planet nodes around an expanded star
StarDetailPanel         → side panel (all four content states)
PlanetChecklist         → planet list within side panel
EvidenceUploader        → evidence section within side panel
MitosisPanel            → AI split suggestion UI within side panel
GoalInputMenu           → goal selection dropdown (creation flow)
ConstellationGhost      → ghost outline during confirmation loop
Minimap                 → collapsible minimap overlay
MinimapIcon             → collapsed North Star glyph trigger
CreationPlusButton      → + button (two sizes: empty state, active state)
```

---

## 11. Data Model Notes

Key fields needed on existing models to support this IA.
Cross-reference with `backend/apps/starmap/models.py`.

```python
# Constellation — add these fields
angle_deg   = FloatField()          # position in sky (0–360)
radius      = FloatField()          # distance from North Star (normalized)
is_north_star = BooleanField()      # True for the one North Star constellation

# Milestone (Star) — already has x, y
# Ensure x, y are set by AI at constellation generation time
# Add:
orbit_order = IntegerField(null=True)  # for planets: 1 = innermost

# Avatar — add:
north_star_goal = TextField()       # the confirmed North Star goal text
                                    # source: GoalInputMenu confirmation
```

---

## 12. States Reference (for Figma frames)

Figma should have frames for each of these distinct states:

```
Star Map — Empty (no North Star)
Star Map — Goal Input open
Star Map — North Star set, constellation confirmation loop (ghost centered)
Star Map — Ghost constellation confirming (radiating to position)
Star Map — Zoom 1, all constellations placed, none in progress
Star Map — Zoom 1, one constellation in progress (glow active)
Star Map — Zoom 1, one constellation complete
Star Map — Zoom 2, all stars incomplete
Star Map — Zoom 2, constellation partially complete
Star Map — Zoom 2, constellation fully complete
Star Map — Zoom 2, star expanded (no planets, incomplete)
Star Map — Zoom 2, star expanded (with planets, some complete)
Star Map — Zoom 2, star expanded (all planets complete, evidence prompt)
Star Map — Zoom 2, star expanded (completed star, read only)
Star Map — Mitosis panel open
Star Map — Minimap expanded
Star Map — Zoom 0 (North Star screen)
Star Map — Zoom 0, empty purpose statement (first visit)
```
