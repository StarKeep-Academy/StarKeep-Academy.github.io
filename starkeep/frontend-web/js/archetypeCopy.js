/**
 * Display copy for archetype vocabulary.
 *
 * The backend stores slugs only (`apps/avatar/metadata.py` holds the canonical
 * value sets); the prose that renders them lives here, client-side, because it
 * is presentation and changes far more often than the contract does.
 *
 * Replaces AvatarView's former PLACEHOLDER_COPY, which said the same generic
 * sentence for every sign and told the user personalized copy was "coming
 * soon". Keys must match the backend's accepted values exactly.
 */

// ─── Zodiac ──────────────────────────────────────────────────────────────────

export const ZODIAC = {
    aries:       { element: 'Fire',  quality: 'Cardinal', trait: 'Initiative',   line: 'Moves first and asks later. Starts what others are still deliberating over.' },
    taurus:      { element: 'Earth', quality: 'Fixed',    trait: 'Persistence',  line: 'Builds slowly and does not let go. Values what lasts over what dazzles.' },
    gemini:      { element: 'Air',   quality: 'Mutable',  trait: 'Curiosity',    line: 'Collects ideas the way others collect objects, and connects the unrelated.' },
    cancer:      { element: 'Water', quality: 'Cardinal', trait: 'Protection',   line: 'Reads the emotional weather of a room and shelters whoever is caught in it.' },
    leo:         { element: 'Fire',  quality: 'Fixed',    trait: 'Radiance',     line: 'Generous with attention and warmth. Makes other people braver by being present.' },
    virgo:       { element: 'Earth', quality: 'Mutable',  trait: 'Refinement',   line: 'Sees the flaw everyone else stopped noticing, and quietly fixes it.' },
    libra:       { element: 'Air',   quality: 'Cardinal', trait: 'Balance',      line: 'Holds two opposing truths at once and finds the proportion between them.' },
    scorpio:     { element: 'Water', quality: 'Fixed',    trait: 'Depth',        line: 'Uninterested in the surface. Goes to the real thing or does not go at all.' },
    sagittarius: { element: 'Fire',  quality: 'Mutable',  trait: 'Expansion',    line: 'Chases the larger meaning, and will cross a great deal of ground to find it.' },
    capricorn:   { element: 'Earth', quality: 'Cardinal', trait: 'Structure',    line: 'Plays the long game deliberately. Builds the staircase before the climb.' },
    aquarius:    { element: 'Air',   quality: 'Fixed',    trait: 'Divergence',   line: 'Thinks past the current arrangement to the one that should replace it.' },
    pisces:      { element: 'Water', quality: 'Mutable',  trait: 'Attunement',   line: 'Porous to what others feel. Translates between worlds that do not share a language.' }
};

/**
 * How each placement frames whatever sign occupies it.
 *
 * Keys match `chart[].key` from the API (backend `metadata.CHART_PLACEMENTS`),
 * which is the authority on order and glyphs — this map only supplies prose.
 * Twelve placements: ten planetary bodies plus the Ascendant and Midheaven.
 */
export const PLACEMENTS = {
    sun:        { label: 'SUN',        frame: 'Your core identity — the self you are becoming.' },
    moon:       { label: 'MOON',       frame: 'Your inner world — how you process what happens to you.' },
    rising:     { label: 'ASCENDANT',  frame: 'Your outward mask — what people meet before they meet you.' },
    mercury:    { label: 'MERCURY',    frame: 'How you think and make yourself understood.' },
    venus:      { label: 'VENUS',      frame: 'What you are drawn to, and how you show affection.' },
    mars:       { label: 'MARS',       frame: 'How you assert yourself and spend your energy.' },
    jupiter:    { label: 'JUPITER',    frame: 'Where you expand, and what you are lucky in.' },
    saturn:     { label: 'SATURN',     frame: 'Where the work is — your discipline and your limits.' },
    uranus:     { label: 'URANUS',     frame: 'Where you break the pattern your generation inherited.' },
    neptune:    { label: 'NEPTUNE',    frame: 'Where the boundary blurs — imagination, and illusion.' },
    pluto:      { label: 'PLUTO',      frame: 'Where you are remade, repeatedly and not gently.' },
    midheaven:  { label: 'MIDHEAVEN',  frame: 'Your public vocation — what you are seen to be for.' }
};

// ─── Jung ────────────────────────────────────────────────────────────────────

export const JUNG = {
    innocent:  'Trusts that things can be good, and acts as though they already are. Optimism as a discipline, not a naivety.',
    everyman:  'Belongs anywhere. Draws power from being genuinely one of the people rather than above them.',
    hero:      'Runs toward the difficult thing. Defines itself by what it is willing to take on.',
    caregiver: 'Strength expressed as protection. Measures a life by who was carried through it.',
    explorer:  'Cannot stay. Finds the self by leaving the map and reporting back from past its edge.',
    rebel:     'Sees the rule and asks who it serves. Breaks what deserves breaking.',
    lover:     'Moves through devotion — to people, to craft, to beauty. Intensity is the point.',
    creator:   'Compelled to make. Would rather build something imperfect than consume something finished.',
    jester:    'Tells the truth sideways, where a straight line would not be heard.',
    // "hermit", not the more usual Jungian "sage": the Truthseeker path was
    // once called Sage, so that word is a retired path name here and reusing it
    // for an archetype would blur the two taxonomies. The backend folds an
    // inbound "sage" to "hermit" before storing, so only this key is needed.
    hermit:    'Wants to understand more than to be right. Collects the truth patiently.',
    magician:  'Works at the level of transformation — changes the conditions rather than fighting the symptoms.',
    ruler:     'Takes responsibility for the whole. Builds order others can live inside.'
};

// ─── MBTI ────────────────────────────────────────────────────────────────────

export const MBTI = {
    INFP: 'Guided by an inner compass few others can see. Idealistic, deeply private, quietly stubborn about what matters.',
    INFJ: 'Reads patterns in people and acts on long-range conviction. Rare combination of vision and follow-through.',
    INTP: 'Takes ideas apart to see the mechanism. Precise, sceptical, happiest at the edge of a hard problem.',
    INTJ: 'Builds the system and then the plan to reach it. Strategic, independent, allergic to inefficiency.',
    ISFP: 'Expresses through making and doing rather than explaining. Gentle on the surface, immovable underneath.',
    ISFJ: 'Remembers what others need and provides it before being asked. Loyalty expressed as reliability.',
    ISTP: 'Learns by hand. Calm under pressure, drawn to whatever can be understood by taking it apart.',
    ISTJ: 'Does what was promised, to standard, every time. The reason things hold together.',
    ENFP: 'Ignites easily and brings others with them. Possibility-driven, allergic to a closed door.',
    ENFJ: 'Sees potential in people and organizes the world so they can reach it.',
    ENTP: 'Argues to find out. Generates more ideas than can be built and enjoys the surplus.',
    ENTJ: 'Sets the objective and mobilizes toward it. Decisive, direct, comfortable with command.',
    ESFP: 'Fully in the present. Brings energy into a room and makes the moment worth having been in.',
    ESFJ: 'Builds the social fabric and maintains it. Attentive to who is being left out.',
    ESTP: 'Acts now, adjusts mid-flight. Reads a live situation faster than most can describe it.',
    ESTJ: 'Organizes chaos into working order. Practical, direct, and accountable for the outcome.'
};

// ─── Paths (for the selection UI) ────────────────────────────────────────────

export const HEROIC_PATHS = {
    earthwatcher: 'Ecology, permaculture, bio-architecture, sustainability.',
    peacebringer: 'Medicine, mental health, animal care, conflict mediation.',
    storyteller:  'Visual art, game design, animation, music, UX.',
    innovator:    'Engineering, robotics, computer science, clean energy, XR.',
    dreamwalker:  'Consciousness, philosophy, esoterics, applied metaphysics.',
    truthseeker:  'Humanities, law, history, interdisciplinary scholarship.'
};

export const LEARNING_PATHS = {
    scholar:    'A wide liberal-arts base, narrowing into specialization.',
    wayfinder:  'Rapid competency aimed at urgent humanitarian need.',
    specialist: 'Deep mastery of a single domain.',
    divergent:  'Interdisciplinary experimentation and iteration.',
    generalist: 'Breadth first, joy-driven, deliberately flexible.',
    mystic:     'Intuition, meditation, flow states, altered states.'
};

// ─── Lookups ─────────────────────────────────────────────────────────────────

const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/**
 * Copy for one natal-chart placement.
 * @param {string} placement key from the API's `chart[].key`
 * @param {string} sign lowercase slug, may be empty
 */
export function placementCopy(placement, sign) {
    const frame = PLACEMENTS[placement];
    const data = ZODIAC[sign];
    if (!data) {
        return {
            title: `${frame?.label ?? ''} — NOT SET`,
            body: 'This placement was not included in your quiz results.',
            note: ''
        };
    }
    return {
        title: `${frame.label} IN ${sign.toUpperCase()}`,
        body: data.line,
        note: `${data.element} · ${data.quality} · ${data.trait} — ${frame.frame}`
    };
}

// Legacy spellings that may still sit in rows written before the backend
// started folding them. Keyed lookups fail silently otherwise.
const JUNG_ALIASES = { sage: 'hermit', outlaw: 'rebel' };

export const jungCopy = (slug) => JUNG[slug] || JUNG[JUNG_ALIASES[slug]] || '';
export const mbtiCopy = (type) => MBTI[(type || '').toUpperCase()] || '';
export const heroicPathCopy = (slug) => HEROIC_PATHS[slug] || '';
export const learningPathCopy = (slug) => LEARNING_PATHS[slug] || '';
export { titleCase };
