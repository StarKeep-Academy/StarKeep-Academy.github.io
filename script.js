// Homepage scroll animation
// Edit .scroll-text blocks in index.html to change content.
// SCROLL_VH is the only number you need to tune — everything scales from it.

const SCROLL_VH     = 120;  // vh of scroll per text block (higher = slower)
const FADE_FRACTION = 0.25; // fraction of each slot used for fade in / out

const container = document.getElementById('scroll-texts');
const textEls   = container.querySelectorAll('.scroll-text');
const stage     = document.getElementById('scroll-stage');
const planet    = document.getElementById('planet');
const indicator = document.getElementById('scroll-indicator');
const hero      = document.getElementById('hero');

const clamp01 = v => Math.max(0, Math.min(1, v));

const totalBlocks  = textEls.length;
stage.style.height = `${SCROLL_VH * (totalBlocks + 2)}vh`;

const TEXT_END   = totalBlocks / (totalBlocks + 2);
const HERO_START = (totalBlocks + 1) / (totalBlocks + 2);
const slotW      = TEXT_END / totalBlocks;
const fadeSpan   = slotW * FADE_FRACTION;

let size = Math.max(window.innerWidth, window.innerHeight) * 1.1;

if (hero) hero.style.transform = 'translateY(100vh)';

function update() {
    const scrolled = -stage.getBoundingClientRect().top;
    const progress = clamp01(scrolled / stage.offsetHeight);

    const done = progress >= 1;
    document.body.classList.toggle('anim-done', done);

    if (done) {
        if (hero) hero.style.transform = '';
        return;
    }

    if (indicator) indicator.style.opacity = Math.max(0, 1 - progress * 12);

    const heroProgress = clamp01((progress - HERO_START) / (1 - HERO_START));
    const planetY = -(size * 0.92) + heroProgress * -(size * 0.13); // exits upward as hero arrives
    planet.style.transform  = `translateX(-50%) translateY(${planetY}px) rotate(${progress * 360}deg)`;
    planet.style.visibility = heroProgress >= 1 ? 'hidden' : 'visible';

    if (hero) hero.style.transform = `translateY(${(1 - heroProgress) * 100}vh)`;

    textEls.forEach((el, i) => {
        const start = i * slotW;
        const end   = start + slotW;
        const local = clamp01((progress - start) / slotW);

        let opacity = 0;
        if (progress > start && progress < end) {
            if      (progress < start + fadeSpan) opacity = (progress - start) / fadeSpan;
            else if (progress > end   - fadeSpan) opacity = (end - progress)   / fadeSpan;
            else                                  opacity = 1;
        }

        el.style.opacity       = opacity;
        el.style.pointerEvents = opacity > 0 ? 'auto' : 'none';
        el.style.transform     = `translateX(-50%) translateY(calc(-50% + ${60 - local * 120}px))`;
    });
}

window.addEventListener('scroll', update, { passive: true });
window.addEventListener('resize', () => {
    size = Math.max(window.innerWidth, window.innerHeight) * 1.1;
    update();
});
update();
