# How the Campus Map Works
**Files:** `index.html`, `style.css`, `script.js`

---

## What It Does
A placeholder map (grey box) of the virtual campus. Users click a **legend button** to reveal location nodes of that type on the map. Clicking a node opens a **schedule panel** on the right showing that location's classes and an Enroll button for each one.

---

## Layout

```
map-section
├── map-layout (flexbox)
│   ├── .legend         ← filter buttons on the left
│   └── .map-wrapper
│       └── #map-canvas ← the grey box; nodes injected here by JS
└── #schedule-panel     ← fixed panel on the right, hidden by default
```

---

## CSS (`style.css`)

### `.map-canvas`
The grey box itself. Uses `aspect-ratio: 16/9` so it stays proportional at any width. `position: relative` lets nodes be placed inside it using percentage coordinates.

### `.map-node`
Small gold circles (`14px`, `border-radius: 50%`). They start invisible (`opacity: 0; pointer-events: none`). The `.visible` class turns them on. The `.selected` class (applied when a node is clicked) makes it white with a gold glow ring.

Hovering a node also shows a `.node-tooltip` — a small label that appears above it.

### `.schedule-panel`
`position: fixed; right: 1.5rem; top: 50%` — sticks to the right side of the screen vertically centred, on top of everything else. Hidden by default via the `hidden` HTML attribute (toggled by JS). `[hidden] { display: none }` in CSS handles the actual hiding.

### `.enroll-btn`
Starts as a gold outline button. The `.enrolled` class fills it solid gold and removes the click interaction (handled via `{ once: true }` in JS).

---

## JS (`script.js`)

### Locations data
An array of location objects at the top of the file. Each has:
- `id` — unique identifier
- `type` — one of: `lecture-hall`, `workshop`, `guild-house`, `social-area`
- `name` — display name
- `x`, `y` — position on the map as a percentage (0–100)
- `classes` — array of `{ name, time, enrolled }` objects

### How nodes are created
On load, JS loops through the `locations` array and for each one:
1. Creates a `<div class="map-node">`
2. Sets its `left` and `top` as percentage values matching `loc.x` and `loc.y`
3. Appends a tooltip `<span>` inside it with the location name
4. Attaches a click listener that opens the schedule panel

### Legend filtering
Each legend button has a `data-type` attribute matching the location types. Clicking a button:
1. Toggles the `.active` class on the button (gold fill = active)
2. Clicking the same button again deselects it (all nodes hide)
3. Calls `filterNodes(type)` which loops all nodes and adds/removes `.visible` based on whether their `data-type` matches

Only one type can be active at a time.

### Schedule panel
When a node is clicked, `openSchedule(loc, node)`:
1. Deselects the previously selected node (removes `.selected`)
2. Marks the new node as `.selected`
3. Sets the panel title to the location name
4. Clears the schedule list and rebuilds it from `loc.classes`

Each class row has a name, time, and Enroll button. Clicking Enroll sets `cls.enrolled = true` and changes the button to "Enrolled" (filled gold, no further clicks via `{ once: true }`).

### To add a new location
Add a new object to the `locations` array in `script.js` with the correct `type`, `x`/`y` percentages, and `classes` list.
