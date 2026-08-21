import * as THREE from 'three';

// NOTE: This is mock/local seed data. Once wired up, real data comes from
// GET /star-maps/{avatar_id} — see docs/FRONTEND_API_INTEGRATION.md Section 2.

/**
 * Physical scale of the sky. Constellation `radius` is normalized 0–1 (per
 * STARMAP_SPEC.md §11 and the API contract), so this scalar converts it to
 * world units — letting the sky be resized without touching the data.
 */
export const SKY_RADIUS = 72;

/**
 * Polar (angle_deg, radius) → Cartesian Vector3, with the North Star at the
 * origin. Spec §3/§11 and the backend model store constellation position as
 * (angle_deg, radius); this is the single place that mapping happens, so real
 * API data drops in with no conversion layer.
 *
 * The spec's model is 2D-polar, but this sky is genuinely 3D. Rather than
 * flattening everything onto a disc (which would lose the depth the scene
 * relies on), `tilt_deg` lifts each constellation out of the disc plane —
 * an additive, web-only presentation detail that leaves angle_deg/radius
 * meaning exactly what the contract says they mean.
 */
export function polarToVector3(angleDeg, radius, tiltDeg = 0) {
    const theta = THREE.MathUtils.degToRad(angleDeg);
    const phi = THREE.MathUtils.degToRad(tiltDeg);
    const r = radius * SKY_RADIUS;
    const horizontal = Math.cos(phi) * r;
    return new THREE.Vector3(
        Math.cos(theta) * horizontal,
        Math.sin(phi) * r,
        Math.sin(theta) * horizontal
    );
}

// Each star declares its OWN `constellationId`. Previously stars were handed
// out purely by creation order (a running globalStarSeedIndex), which meant
// skipping a constellation during the confirmation loop silently shifted every
// later constellation's star records onto the wrong constellation.
// `description` is rendered in the detail panel per STARMAP_SPEC.md §5.
export const STAR_DATA = [
  // DIGITAL FOUNDATION
  { id:'s1', constellationId:0, title:'LEARN REACT NATIVE', description:'Get fluent enough in React Native to ship a real screen without reaching for a tutorial.', status:'approved', lux:14, completedDate:'Mar 12, 2026', planets:[{label:'Set up Expo environment', done:true, order:1},{label:'Complete components module', done:true, order:2},{label:'Build nav prototype', done:true, order:3}], evidence:[{label:'Course certificate.pdf'}] },
  { id:'s2', constellationId:0, title:'DEFINE CORE USER FLOW', description:'Pin down the single path a new user takes from signup to first meaningful action.', status:'submitted', planets:[{label:'Draft user journey map', done:true, order:1},{label:'Conduct 5 interviews', done:true, order:2},{label:'Synthesize into spec', done:false, order:3}], evidence:[{label:'User research notes.md'}] },
  { id:'s3', constellationId:0, title:'BUILD MVP PROTOTYPE', description:'A clickable prototype real enough to put in front of testers.', status:'active', planets:[{label:'Wireframe 5 screens', done:true, order:1},{label:'Design system tokens', done:false, order:2},{label:'Build prototype', done:false, order:3},{label:'Run 3 usability tests', done:false, order:4}], evidence:[] },
  { id:'s4', constellationId:0, title:'FIRST PILOT COHORT', description:'Recruit and onboard a small group willing to use the thing weekly.', status:'pending', planets:[{label:'Identify 10 potential users', done:false, order:1},{label:'Draft cohort welcome sequence', done:false, order:2}], evidence:[] },
  { id:'s5', constellationId:0, title:'IMPACT METRICS', description:'Decide what "this is working" actually looks like in numbers.', status:'pending', planets:[{label:'Research existing frameworks', done:false, order:1},{label:'Design LVM scoring rubric', done:false, order:2}], evidence:[] },
  // COMMUNITY LAUNCH
  { id:'s6', constellationId:1, title:'IDENTIFY LAUNCH COMMUNITY', description:'Find the one community that would genuinely miss this if it disappeared.', status:'pending', planets:[{label:'Map candidate communities', done:false, order:1},{label:'Assess community fit', done:false, order:2}], evidence:[] },
  { id:'s7', constellationId:1, title:'DRAFT OUTREACH PLAN', description:'Work out how to reach people without sounding like marketing.', status:'pending', planets:[{label:'Write outreach messaging', done:false, order:1},{label:'Select outreach channels', done:false, order:2}], evidence:[] },
  { id:'s8', constellationId:1, title:'RUN PILOT ONBOARDING', description:'Walk the first real members in personally and watch where they stumble.', status:'pending', planets:[{label:'Prepare onboarding materials', done:false, order:1},{label:'Onboard first 10 members', done:false, order:2}], evidence:[] },
  { id:'s9', constellationId:1, title:'COLLECT LAUNCH FEEDBACK', description:'Gather honest first impressions while they are still fresh.', status:'pending', planets:[{label:'Send feedback survey', done:false, order:1},{label:'Synthesize responses', done:false, order:2}], evidence:[] },
  // IMPACT SYSTEMS
  { id:'s10', constellationId:2, title:'DESIGN IMPACT DASHBOARD', description:'One screen that answers "is this making a difference?" at a glance.', status:'pending', planets:[{label:'Sketch dashboard layout', done:false, order:1},{label:'Pick key metrics to surface', done:false, order:2}], evidence:[] },
  { id:'s11', constellationId:2, title:'DEFINE SUCCESS METRICS', description:'Choose the few measures worth steering by, and drop the vanity ones.', status:'pending', planets:[{label:'Draft north-star metric', done:false, order:1},{label:'Draft supporting metrics', done:false, order:2}], evidence:[] },
  { id:'s12', constellationId:2, title:'BUILD REPORTING PIPELINE', description:'Automate the reporting so it happens whether or not anyone remembers.', status:'pending', planets:[{label:'Wire up data collection', done:false, order:1},{label:'Automate weekly report', done:false, order:2}], evidence:[] },
  { id:'s13', constellationId:2, title:'AUDIT DATA INTEGRITY', description:'Confirm the numbers can actually be trusted before anyone acts on them.', status:'pending', planets:[{label:'Spot-check data sources', done:false, order:1},{label:'Document known gaps', done:false, order:2}], evidence:[] },
  { id:'s14', constellationId:2, title:'PUBLISH IMPACT REPORT', description:'Put the results in public, including the parts that did not work.', status:'pending', planets:[{label:'Draft report narrative', done:false, order:1},{label:'Share with stakeholders', done:false, order:2}], evidence:[] },
  // FINANCIAL ORBIT
  { id:'s15', constellationId:3, title:'DRAFT BUDGET MODEL', description:'Map what this costs to run and how long the runway really is.', status:'pending', planets:[{label:'List projected costs', done:false, order:1},{label:'Model 12-month runway', done:false, order:2}], evidence:[] },
  { id:'s16', constellationId:3, title:'SECURE SEED FUNDING', description:'Find funding that does not compromise the mission to get it.', status:'pending', planets:[{label:'Prepare funding pitch', done:false, order:1},{label:'Reach out to 5 funders', done:false, order:2}], evidence:[] },
  { id:'s17', constellationId:3, title:'ESTABLISH TREASURY CONTROLS', description:'Put controls in place so money decisions are never one person alone.', status:'pending', planets:[{label:'Set up expense approvals', done:false, order:1},{label:'Document treasury policy', done:false, order:2}], evidence:[] }
];

/**
 * Stars belonging to a constellation, in declared order. Replaces the old
 * STAR_COUNTS parallel array, which could (and did) drift out of sync with
 * both STAR_DATA's length and the per-constellation `offsets` arrays.
 */
export function starsForConstellation(constellationId) {
    return STAR_DATA.filter(s => s.constellationId === constellationId);
}

// Position is stored as polar (angle_deg 0–360, radius 0–1 normalized) per
// STARMAP_SPEC.md §11 and the API contract, NOT as a Cartesian Vector3 —
// so real backend data drops straight in. `tilt_deg` is a web-only 3D
// presentation extra (see polarToVector3 above); it is not an API field.
//
// No per-star `offsets` field: a constellation's internal shape is computed
// by StarMapView's layoutConstellation() (force-directed, DEC-013), not
// authored per constellation.
export const CONSTELLATION_CONFIG = [
    { id: 0, name: "DIGITAL FOUNDATION", angle_deg: 160.9, radius: 0.789, tilt_deg: 14.3, hint: "Establish core technology layers, environment tooling, and early application prototypes." },
    { id: 1, name: "COMMUNITY LAUNCH", angle_deg: 294.4, radius: 0.854, tilt_deg: -38.2, hint: "Coordinate user acquisition strategies, initial feedback loops, and pilot operations." },
    { id: 2, name: "IMPACT SYSTEMS", angle_deg: 329.7, radius: 0.830, tilt_deg: 21.6, hint: "Formulate metrics tracking matrices, long-term scaling engines, and sustainability scoring." },
    { id: 3, name: "FINANCIAL ORBIT", angle_deg: 115.3, radius: 0.806, tilt_deg: -43.6, hint: "Design tokenomics, treasury architecture, and sustainable transactional models." }
];

// `outer` drives all 3D coloring (gem gradient, rings, glow); `tailwindBg`
// styles the DOM status badge. Previous `core`/`op`/`hex` keys were dropped —
// nothing read them.
export const COLOUR_MAP = {
    approved:   { outer: 0xffffff, tailwindBg: 'bg-white text-slate-900' },
    submitted:  { outer: 0xffd060, tailwindBg: 'bg-amber-500 text-white' },
    active:     { outer: 0x70d8ff, tailwindBg: 'bg-cyan-400 text-slate-900' },
    // Was 0x1a3060 — a near-black navy that, once run through the star gem's
    // color derivation, rendered as essentially invisible. Lightened to a
    // clearly-visible slate blue while still reading as the dimmest/most
    // muted of the four statuses.
    pending:    { outer: 0x3d5a85, tailwindBg: 'bg-slate-700 text-slate-300' }
};
