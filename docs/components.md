# How the Components Work
**Files:** `header.html`, `footer.html`

These are not full HTML pages — they are HTML fragments that get injected into every page by the custom element system in `assets/js/components/customElements.js`.

---

## `header.html`

Contains a `<header>` with a `<nav>` inside. Structure:

```
<header>
  <nav>
    <div class="nav-container">
      <div class="nav-left">   ← desktop left links
      <a class="logo">         ← centred logo image
      <div class="nav-right">  ← login button
      <div class="hamburger">  ← mobile menu toggle (3 bars)
    </div>
    <div class="mobile-menu">  ← dropdown shown on mobile
  </nav>
</header>
```

### Hide/show on scroll
The header has a small JS block at the bottom of `header.html` that watches scroll direction. When you scroll **down**, the header slides off the top of the screen (`transform: translateY(-100%)`). When you scroll **back up** or move your mouse to the top 80px of the screen, it slides back in. This uses the CSS transition on `header { transition: transform 0.3s ease }` from `main.css`.

### Hamburger menu (mobile)
Clicking the `.hamburger` div toggles the `.active` class on both the hamburger icon and the `.mobile-menu`. The `.active` class is what shows the mobile dropdown (it switches `display: none → flex`). The three bars animate into an X shape via CSS transforms when `.active` is applied.

### To add a nav link
Add an `<a class="nav-link">` inside both `.nav-left` (desktop) and `.mobile-menu` (mobile) with the same `href`.

---

## `footer.html`

Simple centred layout with:
- Site name (text logo)
- Tagline
- Repeated nav links (same destinations as the header)
- Copyright line

No JS. All styling comes from `.footer-*` classes in `main.css`.
