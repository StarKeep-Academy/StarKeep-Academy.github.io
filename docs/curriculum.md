# How the Curriculum Page Works
**Files:** `index.html`, `style.css`, `script.js`

---

## What It Does
The Curriculum page lets users pick a **Heroic Path** (who you want to become) and a **Learning Path** (how you learn). Selecting one from each group reveals a description panel. When both are chosen, a "Generate" button activates. Clicking it shows a constellation path — a combined curriculum name, description, and image — if the combination is one of the predefined pairings.

---

## Layout

The page is split into three zones below the intro text:

1. **Path selection** — two 2×3 grids of icon buttons separated by a vertical divider
2. **Details panels** — two side-by-side panels that fill in when a button is selected
3. **Generate button + result** — activates when both sides have a selection; shows the constellation path below

---

## CSS (`style.css`)

### `.path-selection-container`
Uses `display: flex` to put the two button grids side by side with the divider between them.

### `.button-group`
Each group of 6 buttons uses `display: grid; grid-template-columns: repeat(3, 1fr)` — a 3-column, 2-row grid. Buttons are fixed at 115×115px.

### `.path-btn`
Default: dark grey background. Hover: slightly lighter. When selected (`.is-active`): gold border + darker background. The icon inside also turns gold when active.

### `.divider`
Just a 5px wide, 230px tall grey bar (`background-color: #ccc`) that acts as a visual separator between the two groups.

### `.generate-btn`
Starts grey with `opacity: 0.5; cursor: not-allowed`. When JS removes the `disabled` attribute, the CSS `:enabled` rule makes it gold and clickable.

### `.hidden`
`display: none !important` — used to hide the result image, title, and description until Generate is clicked.

---

## JS (`script.js`)

### Data (`pathDetailsData`)
An object keyed by path ID (1–12). Each entry has:
- `title` — the path name
- `text` — the description
- `image` — path to the image (not loaded yet, images need to be added to `assets/images/`)

IDs 1–6 are Heroic Paths. IDs 7–12 are Learning Paths.

### Button clicks (`handlePathButtonClick`)
When a button is clicked:
1. All buttons in the same group have `.is-active` removed
2. The clicked button gets `.is-active`
3. The matching details panel (title + description) is populated and shown
4. The state variable (`chosenHeroicPath` or `chosenLearningPath`) is updated
5. `updateGenerateButton()` checks if both sides are chosen — if so, it removes `disabled` from the Generate button

### Generate button click
Checks the combination of `chosenHeroicPath` and `chosenLearningPath`. There are 6 valid pairings hardcoded:

| Heroic | Learning | Result |
|---|---|---|
| Earthwatcher (1) | Wayfinder (10) | The Crisis Responder |
| Innovator (4) | Specialist (8) | The Deep-Tech Inventor |
| Peacebringer (2) | Generalist (9) | The Holistic Haven Builder |
| Storyteller (3) | Divergent (11) | The Empathy Architect |
| Dreamwalker (5) | Mystic (12) | The Noetic Healer |
| Truthseeker (6) | Scholar (7) | The Eco-Systems Architect |

Any other combination shows an "incompatible" message. The result image, title, and description use the `.hidden` class to hide/show.

### To add a new pairing
Add an `else if` block in the `generateBtn` click handler with the new hero/learning path IDs and fill in the image src, title, and description text.
