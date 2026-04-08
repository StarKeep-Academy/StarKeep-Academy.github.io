# How the Journey Page Works
**Files:** `index.html`, `style.css`, `script.js`

---

## What It Does
Explains the three-step progression system students move through at StarKeep Academy:

1. **Milestones** — pending tasks (like assignments)
2. **Stars** — completed achievements earned from milestones
3. **Constellations** — full modules completed (a cluster of stars)

The page shows one step at a time using a tab strip and dot navigation. Switching tabs swaps the visible panel with a fade-in animation.

---

## Layout

```
page-content
├── .ms-intro         ← title and intro paragraph
└── .ms-section
    ├── .ms-tabs      ← three tab buttons (Milestones / Stars / Constellations)
    ├── .ms-panel × 3 ← one panel per step, only the active one is visible
    └── .ms-step-dots ← three dot buttons below the panels
```

Each `.ms-panel` has a two-column grid inside (`.ms-panel-inner`):
- Left: eyebrow label, heading, description paragraphs, callout quote
- Right: an image

---

## CSS (`style.css`)

### Tabs (`.ms-tab`)
Tabs sit on a gold underline border. The active tab gets `border-bottom-color: var(--gold)` and `color: var(--gold)`. Inactive tabs are muted grey.

### Panels (`.ms-panel`)
Default: `display: none`. The `.active` class switches it to `display: block` and triggers the `ms-in` keyframe animation — a subtle fade-in + 10px upward drift over 0.3s.

### Images (`.ms-visual img`)
Images are fixed at `height: 320px` with `object-fit: cover` to stay consistent regardless of aspect ratio. A `radial-gradient` mask is applied to softly fade the edges into transparency (vignette effect). They brighten slightly on hover.

### Dots (`.ms-dot`)
Small 6px circles. The active dot turns gold and scales up to 1.5× size.

---

## JS (`script.js`)

One function does everything: `switchTo(id)`.

It takes an ID string (`"milestones"`, `"stars"`, or `"constellations"`) and:
1. Loops all `.ms-tab` elements — adds/removes `.active` and sets `aria-selected` based on whether the tab's `data-tab` matches the ID
2. Loops all `.ms-panel` elements — adds/removes `.active` based on `data-panel`
3. Loops all `.ms-dot` elements — adds/removes `.active` based on `data-dot`

The event listener is on the whole `<main>` element (event delegation). It checks if the clicked element is a tab (`[data-tab]`) or a dot (`[data-dot]`) and calls `switchTo` with the right ID. This means adding a new tab/panel pair only requires matching HTML — no JS changes needed.

### Keyboard navigation
`ArrowRight` advances to the next step; `ArrowLeft` goes back. A `STEPS` array defines the order (`milestones → stars → constellations`). `currentIndex()` reads whichever tab has `.active` to know the current position. Navigation stops at either end (no wrapping).

### To add a new panel
1. Add a `<button class="ms-tab" data-tab="newid">` in `.ms-tabs`
2. Add a `<div class="ms-panel" data-panel="newid">` with content
3. Add a `<button class="ms-dot" data-dot="newid">` in `.ms-step-dots`
