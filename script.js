// Homepage scroll animation

history.scrollRestoration = 'manual'; // stops the browser from remembering scroll position on reload — page always starts at top
window.scrollTo(0, 0); // forces the page to the very top when the script runs, just in case

// Edit .scroll-text blocks in index.html to change content.
// SCROLL_VH is the only number you need to tune — everything scales from it.

const SCROLL_VH     = 120;  // how many vh of scrolling each text block gets — raise to slow down, lower to speed up
const FADE_FRACTION = 0.25; // how much of each text block's time is spent fading in or out (0.25 = first and last 25%)

const container = document.getElementById('scroll-texts'); // the div that holds all the scroll text blocks
const textEls   = container.querySelectorAll('.scroll-text'); // all the individual text blocks inside that container
const stage     = document.getElementById('scroll-stage'); // invisible tall div whose only job is to give the page scroll height
const planet    = document.getElementById('planet'); // the big planet div at the top of the screen
const indicator = document.getElementById('scroll-indicator'); // the bouncing arrow at the bottom that says "scroll down"

const clamp01 = v => Math.max(0, Math.min(1, v)); // keeps any number between 0 and 1 — prevents values from going out of bounds

const totalBlocks  = textEls.length; // how many text blocks there are — used to divide up the scroll timing
stage.style.height = `${SCROLL_VH * (totalBlocks + 2)}vh`; // sets the stage height — the +2 adds buffer time after the last text fades out

const TEXT_END = totalBlocks / (totalBlocks + 2); // the point in the scroll (0–1) where all texts have finished — planet exit starts here
const slotW    = TEXT_END / totalBlocks; // how wide each text block's time slot is as a fraction of the full scroll
const fadeSpan = slotW * FADE_FRACTION; // how much of each slot is used for fading in or out

let size = Math.max(window.innerWidth, window.innerHeight) * 1.1; // the larger screen dimension — used to position the planet so it always fits off-screen

function update() {
    const scrolled = -stage.getBoundingClientRect().top; // how many px the stage has scrolled past the top of the viewport
    const progress = clamp01(scrolled / stage.offsetHeight); // 0 = not scrolled, 1 = fully scrolled — the master value driving everything

    document.body.classList.toggle('anim-done', progress >= 1); // adds 'anim-done' to body when finished — CSS uses this to hide the scroll texts and indicator

    const header = document.querySelector('header'); // grabs the header element injected by the custom element
    if (header) header.classList.toggle('header-visible', progress >= 1); // slides the header down into view when the animation is done

    if (progress >= 1) return; // animation is complete — stop here, nothing below needs to run

    if (indicator) indicator.style.opacity = Math.max(0, 1 - progress * 12); // fades the bounce arrow out very quickly at the start of scrolling

    const exitProgress = clamp01((progress - TEXT_END) / (1 - TEXT_END)); // 0–1 sub-progress for the planet's exit phase — only starts after all texts are done
    const planetY = -(size * 0.92) - exitProgress * (size * 0.15); // vertical position of the planet — starts mostly off-screen above, moves further up as exit progresses
    planet.style.transform = `translateX(-50%) translateY(${planetY}px) rotate(${progress * 360}deg)`; // centres the planet horizontally, sets its height, and spins it one full rotation over the whole scroll

    textEls.forEach((el, i) => {
        const start = i * slotW; // where this text block's time slot begins (0–1)
        const end   = start + slotW; // where this text block's time slot ends (0–1)
        const local = clamp01((progress - start) / slotW); // 0–1 progress within just this text block's slot

        let opacity = 0; // default to invisible
        if (progress > start && progress < end) { // only calculate opacity if we're inside this block's time slot
            if      (progress < start + fadeSpan) opacity = (progress - start) / fadeSpan; // fade in — opacity rises from 0 to 1
            else if (progress > end   - fadeSpan) opacity = (end - progress)   / fadeSpan; // fade out — opacity drops from 1 to 0
            else                                  opacity = 1; // fully visible in the middle
        }

        el.style.opacity       = opacity; // applies the calculated opacity to the text block
        el.style.pointerEvents = opacity > 0 ? 'auto' : 'none'; // invisible blocks can't be clicked or selected
        el.style.transform     = `translateX(-50%) translateY(calc(-50% + ${60 - local * 120}px))`; // drifts the text upward as it plays — enters from below centre, exits above centre
    });
}

window.addEventListener('scroll', update, { passive: true }); // runs update on every scroll event — passive means the browser doesn't wait for JS before scrolling, keeping it smooth
window.addEventListener('resize', () => {
    size = Math.max(window.innerWidth, window.innerHeight) * 1.1; // recalculates screen size so planet positioning stays correct after resize
    update(); // immediately re-renders with the new size
});
update(); // runs once on load to set the initial state before the user has scrolled at all
