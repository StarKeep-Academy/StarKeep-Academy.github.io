# How the Login Page Works
**Files:** `index.html`, `style.css`, `script.js`

---

## What It Does
A login form that checks hardcoded credentials. On success, it hides the login box and shows a profile page. The profile page has a "Manage Subscription" button that opens a modal for switching between Free, Pro, and Premium plans.

> **Note:** This is a front-end prototype only. There is no real backend — credentials are checked in JS and no data is actually saved.

**Test credentials:** Username: `admin` / Password: `1234`

---

## Layout

The page has two sections inside `.hero`, only one visible at a time:

- `#loginArea` — the login form (visible by default)
- `#profileArea` — the profile page (hidden by default via `.hidden`)

Inside `#profileArea`, there is a hidden modal (`#subscriptionPopup`) that overlays the screen when "Manage Subscription" is clicked.

---

## CSS (`style.css`)

### `.hidden`
`display: none !important` — toggled by JS to switch between the login form and profile view, and to show/hide the subscription modal.

### `#loginArea` / `#profileArea`
Both are gold-bordered boxes on a transparent background (using `border: 1px solid var(--gold)`). The profile area uses more padding to give breathing room to the profile picture and form fields.

### `.profile-container`
`display: flex` with a fixed 220px column for the profile picture (`flex: 0 0 220px`) and a flexible column for the form fields (`flex: 1`).

### `.modal-background`
`position: fixed; inset: 0` — covers the entire screen with a semi-transparent black overlay. Inside it, `.modal-content` is a centred box with the three plan options.

### `.three-columns`
`display: flex` with three equal `flex: 1` children, each with a gold border. The selected plan gets a brighter border applied by JS.

---

## JS (`script.js`)

### Login check (`checkLogin`)
Runs when "Sign In" is clicked. Compares the username and password inputs against hardcoded values (`"admin"` / `"1234"`). Shows specific error messages for wrong username, wrong password, or both wrong. On success:
- Hides `#loginArea` by adding `.hidden`
- Shows `#profileArea` by removing `.hidden`

### Subscription modal
- **"Manage Subscription"** button → removes `.hidden` from `#subscriptionPopup` to show the modal
- **"Cancel / Close"** button → adds `.hidden` back to hide it

### Plan switching (`whenClicked`)
All three plan buttons (Free, Pro, Premium) share the same `whenClicked` function. When one is clicked:
1. `resetPlanStates()` resets all button labels and column borders back to default
2. The clicked button's column gets a green highlight border
3. Its label changes to "Current Plan" and it becomes disabled
4. The "Current Plan" text on the profile page updates (e.g. "Pro Tier")
5. A "Subscription Updated!" confirmation message appears for 3 seconds then disappears
