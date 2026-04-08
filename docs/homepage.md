# How the Homepage Works
**Files:** `index.html`, `style.css`, `script.js`

---

## What It Does
The homepage opens with a scroll-driven animation. The user scrolls through a series of text panels while a large planet rotates at the top of the screen. Once they scroll far enough, the planet exits upward, the header slides in, and the animation ends. After that, everything behaves like a normal webpage.

---

## The Scroll Animation

### How scrolling is tracked (`script.js`)
All animation progress is a single number called `progress` — it goes from `0.0` (not scrolled at all) to `1.0` (fully scrolled, animation complete).

```
progress = how far the user has scrolled ÷ total scroll distance
```

The "total scroll distance" is set by an invisible empty div called `#scroll-stage`. Its only job is to be tall enough to give the user something to scroll through. Its height is set by JS on load:

```
stage height = SCROLL_VH × (number of text blocks + 2)
```

The `+ 2` adds a buffer after the last text fades out — without it the animation would end the moment the last text disappears, which feels abrupt. Raise `SCROLL_VH` to slow everything down, lower it to speed up.

**Why a separate div?** All the animated elements (`#planet`, `#scroll-texts`) are `position: fixed` — they don't contribute to page height. The stage is the only thing making the page scrollable.


### How the animation ends
When `progress` hits `1.0`:
- `anim-done` is added to `<body>` — CSS uses this to `display: none` the scroll texts and indicator
- `header-visible` is added to the header — CSS uses this to slide the header down into view
- `update()` returns early on every subsequent scroll event, so the planet stops moving

---

## The Planet (`#planet`)

### CSS (`style.css`)
The planet is a fixed circle (`position: fixed`) at the top-center of the screen. It's `125vmax` in diameter — much bigger than the screen — so only the bottom arc peeks into view. It starts with `transform: translateY(-92%)`, meaning 92% of it is hidden above the top edge. `vmax` is used (not `px` or `vw`) so it always overflows the screen on every device regardless of orientation.

### JS (`script.js`)
Every scroll event recalculates the planet's position and rotation:
- **Rotation:** `progress × 360°` — one full rotation across the whole scroll
- **Exit:** During the final portion of the scroll (`TEXT_END → 1.0`), `exitProgress` drives the planet further up until it's fully off-screen. The planet then stays at that off-screen position when the animation ends.

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

To add or remove text blocks: just edit the `.scroll-text` divs in `index.html`. The slot widths recalculate automatically from `textEls.length` — no JS changes needed.

---

## The Hero Section (`#hero`, `starkeep-header`)

The hero section is the normal page content (title, tagline, CTA button) that sits below the scroll animation. It's always in the page — the animation just runs in front of it as a fixed overlay.

When `anim-done` is added to `<body>`, the scroll overlay (`#scroll-texts`, `#scroll-indicator`) disappears and the header slides in, revealing the hero underneath.

### What makes the header slide down

The header starts hidden above the screen. In `style.css`:

```css
header { transform: translateY(-100%); }            /* pushed fully above the viewport */
header.header-visible { transform: translateY(0); } /* back to normal position */
```

When `progress >= 1`, JS adds `header-visible` to the header element. The CSS `transition: transform 0.3s ease` (defined in `main.css`) animates the movement — without that transition it would just snap into place instantly. The class is added by JS, but the actual slide is pure CSS.

---

## Scroll Indicator (`#scroll-indicator`)
A small bouncing arrow at the bottom of the screen. It fades out immediately as scrolling begins (handled in JS). The bounce animation is a CSS `@keyframes nudge` that nudges the icon 5px down and back every 2 seconds.
