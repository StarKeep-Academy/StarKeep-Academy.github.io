// Milestones page script
/* ================================================================
   Milestones — script.js
   Handles tab + dot switching for the three milestone panels.
   The HTML content is already in index.html — this just wires
   up the interactivity.
   ================================================================ */

(function () {

    function switchTo(id) {
        document.querySelectorAll('.ms-tab')
            .forEach(t => {
                const active = t.dataset.tab === id;
                t.classList.toggle('active', active);
                t.setAttribute('aria-selected', active);
            });

        document.querySelectorAll('.ms-panel')
            .forEach(p => p.classList.toggle('active', p.dataset.panel === id));

        document.querySelectorAll('.ms-dot')
            .forEach(d => d.classList.toggle('active', d.dataset.dot === id));
    }

    function init() {
        const main = document.querySelector('main.page-content');
        if (!main) return;

        main.addEventListener('click', e => {
            const tab = e.target.closest('[data-tab]');
            if (tab) { switchTo(tab.dataset.tab); return; }

            const dot = e.target.closest('[data-dot]');
            if (dot) switchTo(dot.dataset.dot);
        });
    }

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init)
        : init();

})();