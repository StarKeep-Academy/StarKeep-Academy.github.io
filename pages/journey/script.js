// Journey page script
/* ================================================================
   Journey — script.js
   Handles tab + dot switching for the three panels.
   The HTML content is already in index.html — this just wires
   up the interactivity.
   ================================================================ */

(function () { // wraps everything in a self-contained function so no variables leak into the global scope

    function switchTo(id) { // makes the tab, panel, and dot matching the given id active, and deactivates all others
        document.querySelectorAll('.ms-tab') // gets all tab buttons
            .forEach(t => {
                const active = t.dataset.tab === id; // true if this tab matches the target id
                t.classList.toggle('active', active); // adds 'active' if it matches, removes it if not
                t.setAttribute('aria-selected', active); // updates accessibility attribute so screen readers know which tab is selected
            });

        document.querySelectorAll('.ms-panel') // gets all content panels
            .forEach(p => p.classList.toggle('active', p.dataset.panel === id)); // shows the matching panel, hides the rest

        document.querySelectorAll('.ms-dot') // gets all dot navigation buttons
            .forEach(d => d.classList.toggle('active', d.dataset.dot === id)); // highlights the matching dot, unhighlights the rest
    }

    const STEPS = ['milestones', 'stars', 'constellations']; // the three panel ids in order — used for arrow key navigation

    function currentIndex() { // returns the position (0, 1, or 2) of whichever tab is currently active
        const active = document.querySelector('.ms-tab.active'); // finds the currently active tab
        return active ? STEPS.indexOf(active.dataset.tab) : 0; // returns its index in STEPS, or 0 if nothing is active
    }

    function init() { // sets up all event listeners — called once when the page is ready
        const main = document.querySelector('main.page-content'); // grabs the main content area
        if (!main) return; // stops if the main element doesn't exist on the page

        main.addEventListener('click', e => { // listens for any click anywhere inside main
            const tab = e.target.closest('[data-tab]'); // checks if the click was on a tab button (or inside one)
            if (tab) { switchTo(tab.dataset.tab); return; } // if it was a tab, switch to it and stop

            const dot = e.target.closest('[data-dot]'); // checks if the click was on a dot button (or inside one)
            if (dot) switchTo(dot.dataset.dot); // if it was a dot, switch to its matching panel
        });

        document.addEventListener('keydown', e => { // listens for keyboard presses anywhere on the page
            if (e.key === 'ArrowRight') { // right arrow key — go to the next step
                const next = STEPS[currentIndex() + 1]; // gets the id of the next step in the list
                if (next) switchTo(next); // switches to it only if there is a next step (stops at the end)
            } else if (e.key === 'ArrowLeft') { // left arrow key — go to the previous step
                const prev = STEPS[currentIndex() - 1]; // gets the id of the previous step in the list
                if (prev) switchTo(prev); // switches to it only if there is a previous step (stops at the start)
            }
        });
    }

    document.readyState === 'loading' // checks if the HTML is still being parsed
        ? document.addEventListener('DOMContentLoaded', init) // if so, wait until it's fully loaded before running init
        : init(); // if the HTML is already ready, run init immediately

})(); // immediately calls the wrapper function so the code runs straight away
