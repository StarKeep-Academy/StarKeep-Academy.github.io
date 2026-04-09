import { registerCustomElements } from './components/customElements.js';

registerCustomElements();

(function spawnStars() {
    const COUNT = 200;
    const stars = [];
    for (let i = 0; i < COUNT; i++) {
        const x = Math.round(Math.random() * window.innerWidth);
        const y = Math.round(Math.random() * window.innerHeight);
        const opacity = (0.25 + Math.random() * 0.5).toFixed(2);
        stars.push(`${x}px ${y}px 0 0 rgba(255,255,255,${opacity})`);
    }
    const el = document.createElement('div');
    el.id = 'starfield';
    el.style.boxShadow = stars.join(', ');
    document.body.prepend(el);
}());

document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (href !== '/' && path.startsWith(href.replace('/index.html', ''))) {
            link.classList.add('active');
        }
    });
});
