// Homepage scroll animation

history.scrollRestoration = 'manual'; 
window.scrollTo(0, 0); 


const SCROLL_VH     = 90;  
const FADE_FRACTION = 0.25; 

const container = document.getElementById('scroll-texts'); 
const textEls   = container.querySelectorAll('.scroll-text'); 
const stage     = document.getElementById('scroll-stage'); 
const planet    = document.getElementById('planet'); 
const indicator = document.getElementById('scroll-indicator'); 

const clamp01 = v => Math.max(0, Math.min(1, v)); 

const totalBlocks  = textEls.length; 
stage.style.height = `${SCROLL_VH * (totalBlocks + 2)}vh`; 

const TEXT_END = totalBlocks / (totalBlocks + 0.5); 
const slotW    = TEXT_END / totalBlocks; 
const fadeSpan = slotW * FADE_FRACTION; 

let size = Math.max(window.innerWidth, window.innerHeight) * 1.1; 

function update() {
    const scrolled = -stage.getBoundingClientRect().top; 
    const progress = clamp01(scrolled / stage.offsetHeight); 

    document.body.classList.toggle('anim-done', progress >= 1); 

    const header = document.querySelector('header'); 
    if (header) header.classList.toggle('header-visible', progress >= 0.07); 

    if (progress >= 1) return; 

    if (indicator) indicator.style.opacity = Math.max(0, 1 - progress * 12); 

    const exitProgress = clamp01((progress - TEXT_END) / (1 - TEXT_END)); 
    const planetY = -(size * 0.92) - exitProgress * (size * 0.15); 
    planet.style.transform = `translateX(-50%) translateY(${planetY}px) rotate(${progress * 360}deg)`; 

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
