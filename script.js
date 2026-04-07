// Homepage scroll animation
// Edit .scroll-text blocks in index.html to change content.
// SCROLL_VH is the only number you need to tune — everything scales from it.

const SCROLL_VH     = 120;  // vh of scroll per text block (higher = slower)
const FADE_FRACTION = 0.25; // fraction of each slot used for fade in / out

const container = document.getElementById('scroll-texts');
const textEls   = container.querySelectorAll('.scroll-text');
const stage     = document.getElementById('scroll-stage');
const pad       = document.getElementById('scroll-pad');
const planet    = document.getElementById('planet');
const indicator = document.getElementById('scroll-indicator');
const hero      = document.getElementById('hero');

// Stage height: one slot per text block + 2 extra for hero entrance and lock room
const totalBlocks  = textEls.length;
stage.style.height = SCROLL_VH * (totalBlocks + 2) + 'vh';

// Progress fractions derived from slot count
const TEXT_END   = totalBlocks / (totalBlocks + 2); // texts done here
const HERO_START = (totalBlocks + 1) / (totalBlocks + 2); // hero starts here

let locked = false;
if (hero) hero.style.transform = 'translateY(100vh)';

function update() {
    if (locked) return;

    const scrolled = -stage.getBoundingClientRect().top;
    const progress = Math.max(0, Math.min(1, scrolled / stage.offsetHeight));

    // Lock: collapse animation elements and hand off to normal page flow
    if (progress >= 1) {
        locked = true;
        [planet, container, indicator, stage, pad].forEach(el => {
            if (el) el.style.display = 'none';
        });
        document.body.classList.add('anim-done');
        if (hero) hero.style.transform = '';
        window.scrollTo({ top: 0 });
        return;
    }

    // Scroll indicator fades out immediately as scroll begins
    if (indicator) indicator.style.opacity = Math.max(0, 1 - progress * 12);

    // Hero slides up from below; planet exits upward as hero arrives
    const heroProgress = Math.max(0, Math.min(1, (progress - HERO_START) / (1 - HERO_START)));

    const size    = Math.max(window.innerWidth, window.innerHeight) * 1.1;
    const planetY = -(size * 0.92) + heroProgress * -(size * 0.13); // 8% arc → fully hidden
    planet.style.transform  = `translateX(-50%) translateY(${planetY}px) rotate(${progress * 360}deg)`;
    planet.style.visibility = heroProgress >= 1 ? 'hidden' : 'visible';

    if (hero) hero.style.transform = `translateY(${(1 - heroProgress) * 100}vh)`;

    // Scroll texts — each gets an equal slot within TEXT_END
    const slotW = TEXT_END / totalBlocks;
    textEls.forEach((el, i) => {
        const start    = i * slotW;
        const end      = start + slotW;
        const fadeSpan = slotW * FADE_FRACTION;
        const local    = Math.max(0, Math.min(1, (progress - start) / slotW));

        let opacity = 0;
        if (progress > start && progress < end) {
            if      (progress < start + fadeSpan) opacity = (progress - start) / fadeSpan;
            else if (progress > end   - fadeSpan) opacity = (end - progress)   / fadeSpan;
            else                                  opacity = 1;
        }

        el.style.opacity       = opacity;
        el.style.pointerEvents = opacity > 0 ? 'auto' : 'none';
        el.style.transform = `translateX(-50%) translateY(calc(-50% + ${60 - local * 120}px))`;
    });
}

window.addEventListener('scroll', update, { passive: true });
window.addEventListener('resize', update);
update();
