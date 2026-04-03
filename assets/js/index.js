import { registerCustomElements } from './components/customElements.js';

registerCustomElements();

// Highlight active nav link
document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (href !== '/' && path.startsWith(href.replace('/index.html', ''))) {
            link.classList.add('active');
        }
    });
});
