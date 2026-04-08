# How the Shared Assets Work
**Files:** `main.css`, `js/index.js`, `js/components/customElements.js`

These files are loaded by **every page** on the site. They handle the global look, the star field, the header/footer injection, and the active nav link.

---

## Design Tokens (`main.css` — `:root`)
All colours and sizes used across the site are defined as CSS variables here. Change one and it updates everywhere.

| Variable | Value | What it's used for |
|---|---|---|
| `--bg` | `#0b0f1e` | Page background (deep navy) |
| `--surface` | `#131929` | Cards, header, footer |
| `--surface-2` | `#1c2340` | Elevated elements (modals, hovers) |
| `--gold` | `#c9a84c` | Brand accent — borders, active states, highlights |
| `--muted` | `#8892b0` | Secondary text, inactive nav links |
| `--nav-h` | `80px` | Fixed navbar height — used for `padding-top` on page content |

---

## Page Layout (`main.css`)

### `body`
Uses `display: flex; flex-direction: column; min-height: 100vh`. This is what keeps the footer pinned to the bottom even on short pages — the `<main>` element has `flex: 1` so it grows to fill the gap.

### `.page-content`
Every page wraps its content in `<main class="page-content">`. It has `padding-top: var(--nav-h)` (80px) to push content below the fixed header.

### `.hero`
A full-height centred section used as the default layout on most pages. It's `min-height: calc(100vh - var(--nav-h))` so it fills the screen below the header.

---

## The Header (`main.css`)

The `<header>` element (inside the `<starkeep-header>` component) is `position: fixed; top: 0; z-index: 100`. It stays at the top of the screen at all times. It has a semi-transparent dark background with a blur effect so content can be seen scrolling beneath it.

The header hides/shows as you scroll (slides up via `transform: translateY`) — this behaviour is handled by JS inside `header.html`.

### Nav structure
```
nav-container
├── nav-left      ← Curriculum, Campus Map, Milestones links
├── .logo         ← Logo image, absolutely centred in the container
└── nav-right     ← Login button
```

On mobile (under 768px), `nav-left` and `nav-right` are hidden, and a hamburger button appears instead. Clicking it toggles `.mobile-menu` via JS in `header.html`.

---

## The Footer (`main.css`)
The `<footer>` has `margin-top: auto` which, combined with the flexbox body, pushes it to the very bottom. Content is centred inside a max-width container. It's always in normal page flow (not fixed).

---

## Star Field (`js/index.js`)
On every page load, JS creates a single 1×1px `<div id="starfield">` and gives it a `box-shadow` with 200 entries — one per star. Each shadow is positioned at a random `x, y` within the viewport with a random opacity between 0.25 and 0.75. Because the element is fixed and tiny (1px), the shadows appear as dots scattered across the background.

This is more efficient than creating 200 separate DOM elements.

---

## Header & Footer Injection (`js/components/customElements.js`)

The header and footer aren't hardcoded into every page — they're loaded once from shared HTML files. This means if you update `components/header.html`, it updates everywhere automatically.

### How it works
`customElements.js` registers two custom HTML elements:
- `<starkeep-header>` → fetches `/components/header.html` and injects its content
- `<starkeep-footer>` → fetches `/components/footer.html` and injects its content

When the browser sees one of these tags, it runs `connectedCallback()` which does a `fetch()` to get the HTML file and pastes it inside the element. This happens asynchronously (after the page first loads).

### Important: fixed header inside a block element
`starkeep-header` is `display: block` (from main.css) but has no height of its own — the `<header>` inside it is `position: fixed` so it's taken out of normal flow. The custom element is just a container.

---

## Active Nav Link (`js/index.js`)
After the page loads, JS checks `window.location.pathname` against each nav link's `href`. If the current URL starts with a link's path, that link gets the `.active` class, which turns it white in the CSS.
