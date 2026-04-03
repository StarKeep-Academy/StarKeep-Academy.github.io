# StarKeep Academy

GitHub Pages site for StarKeep Academy

## Structuree
   
```
├── index.html               # Homepage
├── assets/
│   ├── main.css             # Shared styles (all pages link here)
│   └── js/
│       ├── index.js         # Entry point - registers custom elements
│       └── components/   
│           └── customElements.js   # <starkeep-header> and <starkeep-footer>   
├── components/   
│   ├── header.html          # Nav component fetched at runtime
│   └── footer.html          # Footer component fetched at runtime
└── pages/
    ├── curriculum/          # Choose Your Path
    ├── campus-map/          # World Campus map
    ├── login/               # Login & subscription
    └── milestones/          # Milestone slideshow
```

## How Components Work

Header and footer are loaded via Custom Elements. Each page includes:

```html
<starkeep-header></starkeep-header>
<starkeep-footer></starkeep-footer>
<script type="module" src="/assets/js/index.js" defer></script>
```

The JS fetches `components/header.html` and `components/footer.html` and injects them at runtime.

## Adding a New Page

1. Create a folder under `pages/`
2. Add `index.html`, `script.js`, `style.css`
3. In `index.html`, link `/assets/main.css`, load `/assets/js/index.js` as a module, and include the two component tags
