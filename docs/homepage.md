# How the Homepage Works
**Files:** `index.html`, `style.css`, `script.js`

---

## What It Does
The homepage opens with a scroll-driven animation. The user scrolls down through a series of text panels while a large planet rotates at the top of the screen. Once they scroll far enough, the planet exits upward and the main page (hero section + header) slides up from the bottom. After that, everything is a normal webpage.

---

## The Scroll Animation

### How scrolling is tracked (`script.js`)
All animation progress is a single number called `progress` — it goes from `0.0` (not scrolled at all) to `1.0` (fully scrolled, animation complete).

```
progress = how far the user has scrolled ÷ total scroll distance
```

The "total scroll distance" is set by an invisible div called `#scroll-stage`. It has no content — its only job is to be tall enough to give the user something to scroll through. Its height is set by JS:

```
stage height = SCROLL_VH × (number of text blocks + 2)
```

Raising `SCROLL_VH` makes everything slower. Lowering it makes it faster.

There is also a `#scroll-pad` div below the stage (100vh tall). This exists purely so the user can scroll far enough to hit `progress = 1.0` and trigger the lock.

### How the lock works
When `progress` hits `1.0`, the animation "locks":
- The planet, text container, scroll indicator, stage, and pad are all hidden (`display: none`)
- The class `anim-done` is added to `<body>`, which removes all animation-phase CSS overrides
- The hero's inline transform is cleared so it sits in normal page flow
- The page scrolls back to the top

---

## The Planet (`#planet`)

### CSS (`style.css`)
The planet is a fixed circle (`position: fixed`) at the top-center of the screen. It's 110vmax in diameter — much bigger than the screen — so only the bottom arc peeks into view. It starts with `transform: translateY(-92%)`, meaning 92% of it is hidden above the top edge.

### JS (`script.js`)
Every scroll event recalculates the planet's position and rotation:
- **Rotation:** `progress × 360°` — one full rotation across the whole scroll
- **Exit:** As the hero slides in (the last portion of the scroll), the planet moves further up until it's fully off-screen

---

## The Scroll Texts (`#scroll-texts`, `.scroll-text`)

### CSS (`style.css`)
The text container is `position: fixed; inset: 0` — it covers the whole screen but doesn't block interaction. Each `.scroll-text` block starts `opacity: 0` and is positioned at `top: 55%` (slightly below centre).

### JS (`script.js`)
The texts are divided into equal time slots across the first portion of the scroll (`TEXT_END`). For each slot:
- The text **fades in** during the first 25% of its slot
- It stays **fully visible** in the middle
- It **fades out** during the last 25% of its slot
- While visible, it **drifts upward** — entering from +60px below centre and exiting to -60px above centre

To add or remove text blocks: just edit the `.scroll-text` divs in `index.html`. The timing recalculates automatically.

---

## The Hero Section (`#hero`, `starkeep-header`)

### CSS (`style.css`) — during animation
While `anim-done` is not on the body:
- `#hero` is `position: fixed; inset: 0; z-index: 110` — a full-screen overlay sitting above everything including the header (z-index 100)
- `starkeep-header` is `opacity: 0` — invisible but loaded

This means the hero covers the header's position as it slides in, making them look like one attached piece.

### JS (`script.js`)
The hero starts at `translateY(100vh)` (fully below the screen). During the final portion of the scroll (`HERO_START → 1.0`), it slides up to `translateY(0)`.

### CSS (`style.css`) — after animation (`anim-done`)
- `#hero` loses its fixed positioning and returns to normal page flow
- `starkeep-header` becomes visible (opacity snaps to 1)
- `.page-content` gets `padding-top: var(--nav-h)` (80px) so content isn't hidden behind the fixed header

---

## Scroll Indicator (`#scroll-indicator`)
A small bouncing arrow at the bottom of the screen. It fades out immediately as scrolling begins (handled in JS). The bounce animation is a CSS `@keyframes nudge` that nudges the icon 5px down and back every 2 seconds.
