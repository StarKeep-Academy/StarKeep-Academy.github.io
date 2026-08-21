import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { deriveRadialColors } from '../materials/RadialGradientMaterial.js';
import { createSigilCoreMaterial, createSigilGeometry } from '../materials/StarSigilMaterial.js';
import { STAR_DATA, CONSTELLATION_CONFIG, COLOUR_MAP, polarToVector3 } from '../constants.js';
import {
    computeLayout, declutterPositions, LAYOUT_DEFAULTS, mulberry32, hashStringToInt,
    dragMoveSet, wouldCreateCycle, graphTails, topoRank,
    sequenceBadges, normalizeEdges, bestViewAxis, chainEdges,
    spliceOutNode, insertIntoEdge, replaceNodeWithChain, insertChainBefore,
} from '../starGraph.js';
import { store } from '../store.js';
import { starmapApi, mapStarMapResponse } from '../starmapApi.js';
import { avatarApi } from '../avatarApi.js';

/**
 * Deterministic per-star hue, 0..1. Hashed from the star's own id so a given
 * star always looks the same across renders/reloads, while different stars
 * spread across the hue wheel — "randomized," but stable, not re-rolled every
 * frame or every mount (which would just look broken/flickery).
 */
function hashHueFromId(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    return (hash % 360) / 360;
}

/**
 * A star's effective base color: a user-chosen custom color if set, otherwise
 * a per-star hue at high saturation/lightness so the DEFAULT is never a dark
 * or muddy tone. Status layers a brightness/saturation modifier on top of the
 * hue rather than replacing it, so pending vs. active vs. approved stays
 * legible without status alone being what makes a star look near-black.
 */
function computeStarBaseColor(starData) {
    if (starData.customColor) return new THREE.Color(starData.customColor).getHex();

    const hue = hashHueFromId(starData.id);
    const color = new THREE.Color();
    if (starData.status === 'approved') {
        // Fully lit — spec calls for "fully glowing white"; keep a hint of
        // the star's own hue rather than going pure white.
        color.setHSL(hue, 0.25, 0.88);
    } else if (starData.status === 'pending') {
        // Dimmest/most muted status, but nowhere near black.
        color.setHSL(hue, 0.55, 0.42);
    } else {
        // active / submitted — full personality color, bright and saturated.
        color.setHSL(hue, 0.75, 0.6);
    }
    return color.getHex();
}

/**
 * Two tetrahedra, one the point-inversion of the other through the origin
 * ("upside down") — the standard stella octangula / "star tetrahedron"
 * construction. Point inversion (negating every vertex) flips triangle
 * winding, so each triangle's last two vertices are swapped to compensate —
 * otherwise the inverted half would render inside-out (backface-culled from
 * the outside).
 */
function createStarTetrahedronGeometries(radius = 4) {
    let geoUp = new THREE.TetrahedronGeometry(radius, 0);
    geoUp = geoUp.toNonIndexed();
    geoUp.computeVertexNormals();

    const src = geoUp.getAttribute('position');
    const inverted = new Float32Array(src.array.length);
    for (let tri = 0; tri < src.count; tri += 3) {
        [0, 2, 1].forEach((srcOffset, j) => {
            const s = tri + srcOffset;
            const d = (tri + j) * 3;
            inverted[d] = -src.getX(s);
            inverted[d + 1] = -src.getY(s);
            inverted[d + 2] = -src.getZ(s);
        });
    }
    const geoDown = new THREE.BufferGeometry();
    geoDown.setAttribute('position', new THREE.BufferAttribute(inverted, 3));
    geoDown.computeVertexNormals();

    return { geoUp, geoDown };
}

/**
 * Shared soft radial-gradient sprite texture used for every glow halo (stars
 * and the North Star). A THREE.Sprite always faces the camera automatically,
 * so — unlike the previous BackSide Fresnel-sphere approach, whose falloff
 * math only produces a real gradient when the camera sits INSIDE the shell —
 * this can't ever degrade into a flat, gradient-less blob: it's a pre-baked
 * bright-center-to-transparent-edge texture, no per-vertex angle math at all.
 */
let glowSpriteTexture = null;
function getGlowSpriteTexture() {
    if (glowSpriteTexture) return glowSpriteTexture;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    glowSpriteTexture = new THREE.CanvasTexture(canvas);
    return glowSpriteTexture;
}

/**
 * Builds a camera-facing glow sprite. `size` controls its on-screen footprint
 * (roughly the halo's visual diameter), `opacity` its resting intensity.
 */
function createGlowSprite(color, size, opacity) {
    const mat = new THREE.SpriteMaterial({
        map: getGlowSpriteTexture(),
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, 1);
    return sprite;
}

/**
 * Shared dashed "calibration ring" alpha texture for the astrolabe rings
 * around each star — one texture, reused (not cloned) across every ring
 * material, since the repeat/wrap settings are identical for all of them.
 */
let tickRingTexture = null;
function getTickRingTexture() {
    if (tickRingTexture) return tickRingTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 8);
    ctx.fillStyle = '#ffffff';
    const tickCount = 32;
    const tickWidth = (canvas.width / tickCount) * 0.4;
    for (let i = 0; i < tickCount; i++) {
        ctx.fillRect((i / tickCount) * canvas.width, 0, tickWidth, canvas.height);
    }

    tickRingTexture = new THREE.CanvasTexture(canvas);
    tickRingTexture.wrapS = THREE.RepeatWrapping;
    tickRingTexture.wrapT = THREE.RepeatWrapping;
    tickRingTexture.repeat.set(28, 1);
    return tickRingTexture;
}

/**
 * Builds one tilted "astrolabe measuring ring" mesh around a star's sigil core.
 */
function createAstrolabeRing(radius, tubeRadius, color, opacity) {
    const geo = new THREE.TorusGeometry(radius, tubeRadius, 8, 64);
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        alphaMap: getTickRingTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.baseOpacity = opacity;
    return mesh;
}

/**
 * World position of a constellation, derived from its polar (angle_deg,
 * radius) per STARMAP_SPEC.md §11. Constellation configs no longer carry a
 * Cartesian `pos` — this is the single conversion point.
 */
function constellationPos(config) {
    return polarToVector3(config.angle_deg, config.radius, config.tilt_deg ?? 0);
}

/**
 * Zoom levels, per STARMAP_SPEC.md §1. Named constants rather than bare
 * integers so inserting a level doesn't require renumbering every call site
 * (which is exactly what adding NORTH_STAR here required).
 */
const PHASE = {
    CREATION: 0,    // pathway selection — no North Star confirmed yet
    NORTH_STAR: 1,  // spec Zoom 0 — purpose, momentum, next action
    FULL_SKY: 2,    // spec Zoom 1 — all constellations
    CONST_FOCUS: 3  // spec Zoom 2 / 2+ — one constellation, optionally one star
};

/** Spec §3: non-focused constellations soft-fade to ~20% during focus. */
const NON_FOCUSED_OPACITY = 0.2;

/**
 * Star gem "core" color darkening factor. Much gentler than
 * RadialGradientMaterial's own default (0.45) — the core dominates most of a
 * star's visible facet surface (low-Fresnel angles), so the aggressive
 * default crushed even a bright base color toward near-black.
 */
const STAR_CORE_EDGE_SCALE = 0.72;

/**
 * Radius (screen pixels) of the invisible circle around a star's projected
 * position that counts as "grabbable" in edit mode. Deliberately generous —
 * see pickStarAt()'s comment for why this replaced 3D raycasting.
 */
const STAR_GRAB_RADIUS_PX = 34;

/** How far above a star's screen position its label floats, in pixels. */
const STAR_LABEL_LIFT_PX = 26;

/**
 * Custom smooth-zoom tuning (see the wheel listener in bindEvents() and the
 * per-frame ease in tick()). Zoom is expressed as a fraction of the current
 * camera distance per frame, not an absolute step, so it feels proportional
 * whether you're close to a single star or looking at the whole sky.
 */
const ZOOM_IMPULSE = 0.038;      // velocity added per full-strength wheel tick
const ZOOM_MAX_VELOCITY = 0.17;  // hard cap so a wild fling can't launch the camera
const ZOOM_VELOCITY_DECAY = 0.87; // per-frame multiplier — the "ease out" after scrolling stops

/**
 * Star Map view. Renders constellation/star overlays onto the persistent
 * shell scene and camera — it never creates its own renderer, scene, camera,
 * or render loop (see docs/WEB_FRONTEND_ARCHITECTURE.md). All 3D objects it
 * creates live under `this.localGroup`, registered via sceneEngine.addOverlayMesh
 * and fully disposed in destroy(). sceneEngine itself is reached via the Router
 * instance stashed in the constructor (`this.router.sceneEngine`), since Router
 * only passes {scene, camera} into mount().
 *
 * TODO(API integration): star/constellation data below is mock/local seed data
 * (STAR_DATA / CONSTELLATION_CONFIG). Per docs/FRONTEND_API_INTEGRATION.md this
 * should be replaced with GET /star-maps/{avatar_id}, with mutations going
 * through /milestones/{id}/evidence and /milestones/{id}/submit instead of
 * mutating localStarData directly.
 */
export class StarMapView {
    constructor(router) {
        this.router = router;
        this.sceneEngine = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.localGroup = null;
        this.particleSystem = null;
        this.northStarMesh = null;
        this.northStarGlow = null;
        this.constellationsGroup = null;

        this.constellationNodesArray = [];
        this.flatStarsArray = [];
        this.localStarData = [];
        this.localConstellationConfig = [];

        this.currentPhase = PHASE.CREATION;
        this.chosenGoal = "";
        this.confirmationLoopIndex = 0;
        // What executeConfirmationLoopStep() does once the loop it's driving
        // finishes: 'north-star' for the initial full-sky population (right
        // after choosing a pathway), or { focusConstellationId } for a single
        // ad-hoc constellation added later via "CREATE NEW CONSTELLATION" —
        // see confirmGoal() / confirmCreateConstellation().
        this.confirmationLoopOnComplete = null;
        this.globalStarSeedIndex = 0;
        this.selectedConstellation = null;
        this.selectedStarData = null;
        // Tracks the most recently interacted-with constellation for the
        // North Star screen's "most active" stat.
        // TODO(API): replace with real milestone.updated_at from the backend.
        this.lastActiveConstellationId = null;

        // Planet orbit rings around the currently-expanded star (spec §5).
        // Null whenever no star is expanded.
        this.planetOrbit = null;
        this.mitosisSuggestions = [];

        // ── Constellation edit mode ──
        this.isEditMode = false;
        this.editSnapshot = null;       // restored wholesale by CANCEL
        this.editUndoStack = [];
        this.editRedoStack = [];
        this.drag = null;               // in-flight drag, see beginStarDrag()
        this.linkDrag = null;           // in-flight link-handle drag
        this.layoutTween = null;        // in-flight 400ms layout slide
        this.pendingNewStarIds = [];    // pulsed after create/split
        this.hoveredStarId = null;      // Delete key target
        this.quickInputCallback = null; // pending confirm handler for #quick-input-modal
        this.toastTimer = null;
        this.pendingCommitPromise = null; // in-flight edit-session save, see flushEditSession()

        this.tempProjectionVector = new THREE.Vector3();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.dragPlane = new THREE.Plane();
        this.dragPoint = new THREE.Vector3();

        this.tickFn = null;
        this.pointerClickHandler = null;
        this.mouseDownHandler = null;
        this.mouseUpHandler = null;
        this.dragDownHandler = null;
        this.dragMoveHandler = null;
        this.dragUpHandler = null;
        this.editKeyHandler = null;
        this.wheelHandler = null;
        this.zoomVelocity = 0; // eased + decayed each frame in tick(); see ZOOM_* constants
    }

    render() {
        return `
            <div class="vignette"></div>

            <div id="labels-container"></div>

            <!-- Left HUD Panel -->
            <aside class="holo-panel w-80 h-full flex flex-col z-10 relative pointer-events-auto">
                <div class="p-6 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <span class="text-xs tracking-[0.25em] text-cyan-400 font-display block">COMPANION LINK</span>
                        <h1 class="text-lg font-bold font-display tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">STAR MAP</h1>
                    </div>
                    <div class="w-8 h-8 rounded-full border border-cyan-500/30 flex items-center justify-center bg-cyan-950/20">
                        <div class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                    </div>
                </div>

                <div class="p-6 space-y-4 flex-1 overflow-y-auto">
                    <div id="lux-wallet" class="bg-white/[0.02] border border-white/5 p-4 rounded-xl hidden">
                        <span class="text-xs text-slate-400 block mb-1">Total Impact Currency</span>
                        <div class="flex items-baseline gap-2">
                            <span id="lux-balance-text" class="text-2xl font-display font-bold text-emerald-400">0</span>
                            <span class="text-xs tracking-wider text-emerald-500/70 font-display">LUX</span>
                        </div>
                    </div>

                    <div class="bg-black/30 border border-white/5 p-4 rounded-xl">
                        <div id="hud-text" class="font-hud text-xs text-cyan-300/80 leading-relaxed">
                            STAR MAP UNINITIALIZED<br>Awaiting pathway selection...
                        </div>
                    </div>

                    <div id="directory-panel" class="space-y-2 hidden pt-2">
                        <span class="text-xs tracking-wider text-slate-400 font-display uppercase block">Constellations</span>
                        <div id="directory-summary" class="text-[11px] font-hud text-cyan-300/70 mb-1"></div>
                        <div id="directory-list" class="space-y-1.5 font-hud text-xs"></div>
                    </div>
                </div>

                <div class="p-6 border-t border-white/5 bg-black/20 flex flex-col gap-2">
                    <button id="north-star-btn" class="btn-nebula w-full py-2.5 px-4 rounded-lg text-xs font-display tracking-wider text-amber-300 hidden">
                        &#9733; NORTH STAR
                    </button>
                    <button id="back-btn" class="btn-nebula w-full py-2.5 px-4 rounded-lg text-xs font-display tracking-wider hidden">
                        &#8592; RETURN TO SKYVIEW
                    </button>
                    <button id="nav-home-btn" class="btn-nebula w-full py-2.5 px-4 rounded-lg text-xs font-display tracking-wider text-slate-400">
                        &#9776; MAIN MENU
                    </button>
                </div>
            </aside>

            <!--
                Star Detail Panel — four content states per STARMAP_SPEC.md §5.
                Sections are shown/hidden by openStarDetailPanel() rather than
                being separate panels, so the slide-in animation is shared.
            -->
            <div id="star-detail-panel" class="p-8 flex flex-col gap-6 pointer-events-auto">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 id="star-title" class="font-display text-base font-semibold tracking-wide text-cyan-400">STAR OBJECTIVE</h3>
                        <div id="star-status" class="inline-block px-2 py-0.5 mt-2 rounded text-[10px] font-hud uppercase tracking-wider font-bold">ACTIVE</div>
                    </div>
                    <button id="close-star-panel-btn" class="font-hud text-xs text-slate-500 hover:text-slate-300 transition-colors">[CLOSE]</button>
                </div>

                <div id="star-description" class="text-xs text-slate-300 leading-relaxed"></div>

                <!-- Completed-star summary (spec §5, completed state) -->
                <div id="star-completed-block" class="hidden border-t border-white/10 pt-4 font-hud text-xs">
                    <div class="text-slate-400">Completed <span id="star-completed-date" class="text-slate-200">—</span></div>
                    <div id="star-lux-earned" class="text-amber-400 mt-1 font-bold">+0 LUX earned</div>
                </div>

                <div id="planets-section" class="border-t border-white/10 pt-4 flex flex-col flex-1 min-h-0">
                    <span id="planets-heading" class="text-[11px] font-hud tracking-wider text-slate-400 block mb-3">Required Steps</span>
                    <div id="planets-checklist" class="checklist-container font-hud"></div>
                    <button id="add-planet-btn" class="btn-nebula py-1.5 px-3 rounded text-[11px] font-hud w-full mt-2">+ ADD STEP</button>
                </div>

                <!-- All-planets-complete prompt (spec §5, gold accent) -->
                <div id="planets-complete-msg" class="hidden ready-prompt">
                    <div class="ready-prompt-title font-display">&#10022; All planets complete</div>
                    <div class="ready-prompt-sub font-hud">Ready to submit?</div>
                </div>

                <div id="sigil-color-section" class="border-t border-white/10 pt-4">
                    <span class="text-[11px] font-hud tracking-wider text-slate-400 block mb-2">Sigil Color</span>
                    <div class="flex items-center gap-3">
                        <input type="color" id="star-color-picker" class="w-9 h-9 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0" />
                        <button id="star-color-reset-btn" class="btn-nebula py-1.5 px-3 rounded text-[11px] font-hud flex-1">RESET TO STATUS COLOR</button>
                    </div>
                </div>

                <div class="border-t border-white/10 pt-4">
                    <span id="evidence-heading" class="text-[11px] font-hud tracking-wider text-slate-400 block mb-2">Evidence</span>
                    <div id="evidence-files" class="text-xs font-hud mb-3 text-slate-300">No files attached.</div>
                    <button id="add-evidence-btn" class="btn-nebula py-1.5 px-3 rounded text-[11px] font-hud w-full">+ ATTACH EVIDENCE FILE</button>
                </div>

                <button id="submit-validation-btn" class="btn-nebula w-full py-3 rounded-xl text-xs font-display tracking-widest text-center uppercase" disabled>
                    SUBMIT FOR REVIEW
                </button>

                <!-- Mitosis trigger (spec §7) -->
                <button id="ai-split-btn" class="btn-nebula w-full py-2.5 rounded-lg text-[11px] font-hud tracking-wider text-cyan-300">
                    &#10022; AI: SPLIT A STEP INTO ITS OWN STAR
                </button>

                <!-- Mitosis: pick which of this star's OWN steps becomes its own
                     star, each with an AI-generated breakdown of sub-steps
                     (Goblin Tools "Magic ToDo"-style chunking, spec §7) -->
                <div id="mitosis-panel" class="hidden border-t border-white/10 pt-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[11px] font-hud tracking-wider text-cyan-300 uppercase">&#10022; Split a step into its own star</span>
                        <button id="mitosis-cancel-btn" class="font-hud text-[10px] text-slate-500 hover:text-slate-300">[CANCEL]</button>
                    </div>
                    <p class="text-[11px] text-slate-400 mb-3">Select steps to promote — each becomes a new star with its own breakdown, sequenced ahead of this one.</p>
                    <div id="mitosis-list" class="flex flex-col gap-2 mb-3"></div>
                    <p id="mitosis-outcome" class="mitosis-outcome">Select the steps to promote into their own stars.</p>
                    <button id="mitosis-confirm-btn" class="btn-nebula w-full py-2.5 rounded-lg text-[11px] font-display tracking-widest uppercase text-amber-300 border-amber-500/40">
                        CONFIRM SPLITS
                    </button>
                </div>
            </div>

            <!-- Astrolabe Bottom Action Button -->
            <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[640px] h-24 flex items-center justify-center gap-3 z-30 px-8 pointer-events-none">
                <button id="create-btn" class="astrolabe-anchor flex-1 h-14 rounded-full px-8 flex items-center justify-between relative group text-sm tracking-[0.15em] font-display text-slate-300 pointer-events-auto">
                    <div class="absolute left-6 w-14 h-14 pointer-events-none flex items-center justify-center">
                        <div class="orbital-ring ring-1"></div>
                        <div class="orbital-ring ring-2"></div>
                        <div class="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
                    </div>
                    <span id="create-btn-label" class="pl-14 transition-colors group-hover:text-white">CHOOSE PATHWAY</span>
                    <span id="create-btn-icon" class="text-cyan-400 font-light text-lg tracking-normal transition-transform group-hover:translate-x-1">&#8594;</span>
                </button>
                <!-- Constellation edit mode. Hidden outside constellation focus. -->
                <button id="edit-mode-btn" class="astrolabe-anchor h-14 rounded-full px-6 hidden items-center justify-center text-xs tracking-[0.15em] font-display text-slate-300 pointer-events-auto whitespace-nowrap">
                    <span id="edit-mode-label">&#9998; EDIT</span>
                </button>
                <button id="edit-lockin-btn" class="astrolabe-anchor h-14 rounded-full px-6 hidden items-center justify-center text-xs tracking-[0.15em] font-display text-emerald-300 pointer-events-auto whitespace-nowrap">
                    &#10003; LOCK IN
                </button>
                <button id="edit-cancel-btn" class="astrolabe-anchor h-14 rounded-full px-6 hidden items-center justify-center text-xs tracking-[0.15em] font-display text-slate-400 pointer-events-auto whitespace-nowrap">
                    &#10005; CANCEL
                </button>
            </div>

            <!-- Edit-mode hint strip + transient toast -->
            <div id="edit-hint" class="edit-hint hidden">
                Drag a star to reorder &middot; drag from its ring to link &middot; click a line to unlink &middot; double-click to rename &middot; Del to remove
            </div>
            <div id="edit-toast" class="edit-toast"></div>

            <!-- Pathway Selection Modal -->
            <div id="goal-modal" class="modal-overlay hidden">
                <div class="modal-content rounded-2xl">
                    <div class="font-display text-sm font-bold tracking-wider text-cyan-400 mb-5 text-center">SELECT YOUR INITIAL SKY PATHWAY</div>
                    <div class="goal-option rounded-xl" data-path="BUILD AN AMBITIOUS WEB APP OR INDIE GAME">
                        <strong class="font-display text-xs text-amber-400 tracking-wide block mb-1">CREATIVE ORBIT</strong>
                        Build a web application or production-ready indie game ecosystem.
                    </div>
                    <div class="goal-option rounded-xl" data-path="LAUNCH A LOCAL COMMUNITY PROJECT">
                        <strong class="font-display text-xs text-cyan-400 tracking-wide block mb-1">SOCIAL REALM</strong>
                        Organize and scale local community initiatives or networks.
                    </div>
                    <div class="goal-option rounded-xl" data-path="ARCHITECT INFRASTRUCTURE & AUTOMATIONS">
                        <strong class="font-display text-xs text-purple-400 tracking-wide block mb-1">TECHNICAL SYSTEMS</strong>
                        Develop open source tools, frameworks, or system automation rules.
                    </div>

                    <!-- Quick-pass free-text option (see docs/decisions/north-star-goal-input.md
                         for the full intended feature this stands in for — typed-then-suggested
                         goals, plus Avatar/Academy/quiz entry points, none of which exist yet). -->
                    <div class="mt-4 mb-1 text-[11px] font-hud text-slate-500 uppercase tracking-wider">Or describe your own pathway</div>
                    <input type="text" id="custom-goal-input" placeholder="e.g. Master analog synthesis and build my own modular rig"
                        class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-hud text-slate-200 tracking-wide focus:outline-none focus:border-cyan-400/60" />

                    <div class="mt-6 flex justify-end gap-3 font-hud text-xs">
                        <button id="cancel-goal-btn" class="btn-nebula py-2 px-4 rounded-lg">CANCEL</button>
                        <button id="confirm-goal-btn" class="btn-nebula py-2 px-4 rounded-lg text-cyan-300" disabled>SELECT PATH</button>
                    </div>
                </div>
            </div>

            <!-- Constellation Confirmation Loop Modal -->
            <div id="confirm-modal" class="modal-overlay hidden">
                <div class="modal-content rounded-2xl text-left">
                    <div id="confirm-const-name" class="font-display text-sm text-amber-400 tracking-wider mb-2">CONSTELLATION</div>
                    <div id="confirm-const-hint" class="text-xs text-slate-300 leading-relaxed mb-6">Description.</div>
                    <div class="flex justify-end gap-3 font-hud text-xs">
                        <button id="dismiss-loop-btn" class="btn-nebula py-2 px-4 rounded-lg text-slate-400">SKIP CONSTELLATION</button>
                        <button id="confirm-loop-btn" class="btn-nebula py-2 px-4 rounded-lg border-amber-500/40 text-amber-300">REVEAL ON MAP</button>
                    </div>
                </div>
            </div>

            <!--
                Generic single-field quick input card — replaces
                window.prompt() for every small text entry in the star map
                (rename star, create star, add step, evidence file name).
                Deliberately LIGHTER than .modal-overlay (no dark scrim /
                blur behind it): these are quick, low-stakes prompts, not
                decisions that warrant dimming the whole 3D scene to black.
            -->
            <div id="quick-input-modal" class="input-card-overlay hidden">
                <div class="input-card rounded-2xl">
                    <div id="quick-input-title" class="font-display text-sm font-bold tracking-wider text-cyan-400 mb-5 text-center">TITLE</div>
                    <input id="quick-input-field" type="text" maxlength="120" autocomplete="off"
                        class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-hud text-slate-200 tracking-wide focus:outline-none focus:border-cyan-400/60" />
                    <div class="mt-6 flex justify-end gap-3 font-hud text-xs">
                        <button id="quick-input-cancel-btn" class="btn-nebula py-2 px-4 rounded-lg text-slate-400">CANCEL</button>
                        <button id="quick-input-save-btn" class="btn-nebula py-2 px-4 rounded-lg border-amber-500/40 text-amber-300">SAVE</button>
                    </div>
                </div>
            </div>

            <!-- Create constellation: two fields (name + description), so it
                 gets its own card rather than the generic single-field one. -->
            <div id="create-constellation-modal" class="input-card-overlay hidden">
                <div class="input-card rounded-2xl">
                    <div class="font-display text-sm font-bold tracking-wider text-cyan-400 mb-5 text-center">NEW CONSTELLATION</div>
                    <label class="block text-[10px] font-hud text-slate-500 uppercase tracking-wider mb-1">Name</label>
                    <input id="create-const-name" type="text" maxlength="60" autocomplete="off"
                        class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-hud text-slate-200 tracking-wide focus:outline-none focus:border-cyan-400/60 mb-4" />
                    <label class="block text-[10px] font-hud text-slate-500 uppercase tracking-wider mb-1">Description</label>
                    <textarea id="create-const-hint" rows="3" maxlength="300"
                        class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-hud text-slate-200 tracking-wide focus:outline-none focus:border-cyan-400/60 resize-none"></textarea>
                    <div class="mt-6 flex justify-end gap-3 font-hud text-xs">
                        <button id="create-const-cancel-btn" class="btn-nebula py-2 px-4 rounded-lg text-slate-400">CANCEL</button>
                        <button id="create-const-save-btn" class="btn-nebula py-2 px-4 rounded-lg border-amber-500/40 text-amber-300">CREATE</button>
                    </div>
                </div>
            </div>

            <!--
                Zoom 0 — North Star screen (STARMAP_SPEC.md §2).
                Not a modal overlay: the 3D sky stays visible behind it (the
                camera flies to the North Star and the sky de-emphasizes), so
                this is a transparent HUD rather than a blocking scrim.
            -->
            <div id="north-star-screen" class="ns-screen hidden">
                <div class="ns-inner">
                    <div class="ns-purpose-label font-hud">YOUR NORTH STAR</div>
                    <div id="ns-purpose" class="ns-purpose font-display">—</div>

                    <!-- Shown only when no goal is set yet — createNorthStar()
                         wires this to the same quick-input card pattern used
                         elsewhere. Quick-pass only, per the memory note on the
                         real intended North Star feature (free text + live
                         suggestions + Avatar/Academy/quiz entry points) — this
                         is just "let the user actually set one at all" for now,
                         not that full feature, and doesn't persist server-side. -->
                    <button id="create-north-star-btn" class="btn-nebula py-2 px-5 rounded-lg text-xs font-hud mt-3 hidden">CREATE NORTH STAR</button>

                    <div id="ns-defined-content">
                        <div class="ns-divider"></div>

                        <div class="ns-momentum font-hud">
                            <div>Last star: <span id="ns-last-star" class="text-slate-300">—</span></div>
                            <div>Most active: <span id="ns-most-active" class="text-cyan-300">—</span></div>
                        </div>

                        <button id="ns-next-step" class="ns-next-card">
                            <div class="ns-next-label font-hud">YOUR NEXT STEP</div>
                            <div id="ns-next-title" class="ns-next-title font-display">—</div>
                            <div id="ns-next-from" class="ns-next-from font-hud">—</div>
                        </button>
                    </div>

                    <button id="dismiss-ns-btn" class="btn-nebula py-2 px-5 rounded-lg text-xs font-hud mt-2">RETURN TO SKY</button>
                </div>
            </div>
        `;
    }

    async mount({ scene, camera }) {
        // Router only hands views {scene, camera}; sceneEngine itself is reached
        // via the Router instance stashed in the constructor.
        this.sceneEngine = this.router.sceneEngine;
        this.scene = scene;
        this.camera = camera;
        this.renderer = this.sceneEngine.renderer;

        // The persistent Earth defaults to whatever the previous view left
        // it as (e.g. visible/centered from HomeView, or locked in
        // AvatarView's corner) — Star Map has never shown it, so hide it
        // explicitly rather than relying on incoming state.
        this.sceneEngine.hideEarth();

        this.localGroup = new THREE.Group();
        this.sceneEngine.addOverlayMesh(this.localGroup);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 15;
        this.controls.maxDistance = 600;
        // OrbitControls' own wheel zoom is NOT covered by enableDamping in
        // this three.js version — confirmed straight from its source:
        // enableDamping only decays sphericalDelta (rotate) and panOffset
        // each frame; the zoom `scale` has no equivalent and is applied
        // instantly, in full, the moment a wheel event fires. There's no
        // flag to turn on smooth zoom — it has to be built. Replaced with a
        // custom velocity-based zoom below (zoomVelocity; wheel listener in
        // bindEvents(); eased + decayed every frame in tick()), so scrolling
        // actually glides while it's happening and settles afterward
        // instead of jumping in fixed steps.
        this.controls.enableZoom = false;
        this.controls.target.set(0, 0, 0);
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.4;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
        const centerLight = new THREE.PointLight(0xffffff, 1.8, 500);
        centerLight.position.set(0, 30, 0);
        this.localGroup.add(ambientLight, centerLight);

        this.constellationsGroup = new THREE.Group();
        this.localGroup.add(this.constellationsGroup);

        this.initParticles();
        // Before resetState(): a returning user with an already-defined
        // North Star needs this.northStarMesh to actually exist so
        // renderExistingStarMap() below can make it visible. It used to run
        // after resetState(), so that visibility toggle had nothing to act
        // on yet — the mesh was created a few lines too late.
        this.initNorthStarSystem();

        // Needs constellationsGroup AND northStarMesh to already exist (a
        // returning user with real data gets its meshes spawned straight
        // into constellationsGroup, and its North Star mesh shown, here).
        await this.resetState();
        // Every subsequent refresh of this label is interaction-triggered
        // (confirmGoal, edit mode, phase transitions) — nothing ever ran it
        // on the very first render, so a returning user landed on the
        // static "CHOOSE PATHWAY" HTML default regardless of their actual
        // phase/goal state. resetState() has finished setting currentPhase
        // and chosenGoal (for every branch: real FULL_SKY, real CREATION
        // fallback, or dev-bypass) by this point, so one call here covers
        // them all.
        this.updateCreateButtonLabel();

        this.fetchWalletBalanceMock();

        this.animateCameraTo(new THREE.Vector3(0, 20, 140), new THREE.Vector3(0, 0, 0), 1400, true);

        this.initDynamicGlintTracking();
        this.bindEvents();

        this.tickFn = this.tick.bind(this);
        this.sceneEngine.registerTick(this.tickFn);
    }

    /**
     * Loads this constellation's/star's data source, then (for a real,
     * already-authenticated session with existing data) renders it straight
     * to PHASE.FULL_SKY — skipping the "confirm your goal" onboarding
     * walkthrough entirely, since that's a first-time-only experience.
     *
     * Branches on the store's dev-bypass flag (store.devSeed()'s fake user
     * has no real avatar row to fetch — see store.js) rather than on
     * IS_LOCAL_DEV, which is broader (true for any localhost session,
     * including a real logged-in one).
     */
    async resetState() {
        this.currentPhase = PHASE.CREATION;
        this.chosenGoal = "";
        this.confirmationLoopIndex = 0;
        this.confirmationLoopOnComplete = null;
        this.globalStarSeedIndex = 0;
        this.selectedConstellation = null;
        this.selectedStarData = null;
        this.lastActiveConstellationId = null;
        this.constellationNodesArray = [];
        this.flatStarsArray = [];
        this.localStarData = [];
        this.localConstellationConfig = [];
        this.edgesByConstellationId = new Map();

        this.isEditMode = false;
        this.editSnapshot = null;
        this.editUndoStack = [];
        this.editRedoStack = [];
        this.drag = null;
        this.linkDrag = null;
        this.layoutTween = null;
        this.pendingNewStarIds = [];
        this.hoveredStarId = null;
        this.quickInputCallback = null;
        this.pendingCommitPromise = null;
        this.zoomVelocity = 0;

        const usingDevBypass = !store.getState().isAuthenticated
            || localStorage.getItem('starkeep_web_dev_bypass') === '1';
        this.usingRealBackend = !usingDevBypass;

        if (usingDevBypass) {
            this.localStarData = JSON.parse(JSON.stringify(STAR_DATA));
            this.localConstellationConfig = CONSTELLATION_CONFIG.map((c) => ({ ...c }));
            return; // PHASE.CREATION onboarding walkthrough proceeds exactly as today
        }

        try {
            const avatarId = store.getState().user?.avatar?.id;
            // Fetched alongside the star map, not just when constellations
            // exist — north_star_goal lives on Avatar (a different app/
            // resource than Star Map entirely), and loading it is cheap
            // enough to not gate it behind any particular branch below.
            const [apiData, avatarProfile] = await Promise.all([
                starmapApi.getStarMap(avatarId),
                avatarApi.getAvatar(avatarId).catch(() => null)
            ]);
            this.chosenGoal = avatarProfile?.north_star_goal || '';

            const mapped = mapStarMapResponse(apiData);
            if (mapped.localConstellationConfig.length > 0) {
                this.renderExistingStarMap(mapped);
                return; // sets PHASE.FULL_SKY itself
            }
            // Real account, genuinely empty (never onboarded yet). Falls
            // through to the same mock-seeded PHASE.CREATION walkthrough as
            // the dev-bypass path — there's no real AI roadmap-generation
            // endpoint to call yet, so the bulk "confirm your goal" flow
            // stays mock-only by design (see the approved plan). Only the
            // ad-hoc "add one more constellation" flow and per-star writes
            // are real once the user is past this first-time walkthrough.
            this.localStarData = JSON.parse(JSON.stringify(STAR_DATA));
            this.localConstellationConfig = CONSTELLATION_CONFIG.map((c) => ({ ...c }));
        } catch (err) {
            console.error('[StarMapView] Failed to load star map from the server:', err);
            // A real, logged-in session whose fetch failed stays empty
            // rather than silently substituting fake mock stars — mixing a
            // real account with mock data would be confusing, not helpful.
            this.localStarData = [];
            this.localConstellationConfig = [];
        }
    }

    /**
     * Renders every already-persisted constellation straight to the sky,
     * skipping the interactive "confirm your goal" modal walkthrough
     * (confirmLoopItem/executeConfirmationLoopStep) entirely — that's a
     * first-time-only onboarding experience; a returning user should just
     * see their star map.
     */
    renderExistingStarMap(mapped) {
        this.localStarData = mapped.localStarData;
        this.localConstellationConfig = mapped.localConstellationConfig;
        this.edgesByConstellationId = mapped.edgesByConstellationId;

        this.localConstellationConfig.forEach((config) => {
            const ownStars = this.localStarData.filter(s => s.constellationId === config.id);
            const persistedEdges = this.edgesByConstellationId.get(config.id) || [];
            this.spawnConstellationMeshes(config, ownStars, persistedEdges);
        });

        this.currentPhase = PHASE.FULL_SKY;

        const hud = document.getElementById('hud-text');
        if (hud) {
            hud.innerHTML = this.chosenGoal
                ? `MAP TRACKING ACTIVE<br>CURRENT PATHWAY:<br>${this.chosenGoal}<br><br>[DRAG TO ROTATE &#8226; SCROLL TO ZOOM]`
                : `MAP TRACKING ACTIVE<br><br>[DRAG TO ROTATE &#8226; SCROLL TO ZOOM]`;
        }
        const wallet = document.getElementById('lux-wallet');
        if (wallet) wallet.style.display = 'block';
        const nsBtn = document.getElementById('north-star-btn');
        if (nsBtn) nsBtn.style.display = 'block';

        // The North Star goal text loads fine on its own (Avatar.north_star_goal,
        // fetched in resetState() just before this runs) — but the 3D star
        // tetrahedron mesh's visibility was never restored to match it. Only
        // confirmGoal() (the onboarding walkthrough) ever turned it on;
        // nothing did so for a returning user, so it stayed invisible even
        // with a real goal loaded.
        if (this.northStarMesh) this.northStarMesh.visible = !!this.chosenGoal;

        this.updateDirectoryPanel();
    }

    initParticles() {
        const particleCount = 14000;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const r = 600 * Math.cbrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            const color = new THREE.Color();
            const randType = Math.random();
            if (randType < 0.50) {
                color.setHSL(0.6, 1.0, Math.random() * 0.3 + 0.1);
            } else if (randType < 0.75) {
                color.setHSL(0.13, 1.0, Math.random() * 0.25 + 0.1);
            } else {
                color.setHSL(0.55, 0.8, Math.random() * 0.3 + 0.2);
            }

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 16);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.PointsMaterial({
            size: 2.0,
            vertexColors: true,
            map: tex,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });

        this.particleSystem = new THREE.Points(geo, mat);
        this.localGroup.add(this.particleSystem);
    }

    initNorthStarSystem() {
        // "Star tetrahedron" — two overlapping tetrahedra, one point-inverted
        // ("upside down"). Lit (MeshStandardMaterial), not the flat unlit
        // fill used before, so it actually responds to the scene's ambient +
        // point light (added in mount()) and reads as a faceted gold gem
        // rather than a flat cutout. A modest emissive keeps it from going
        // fully dark on faces angled away from the light.
        const { geoUp, geoDown } = createStarTetrahedronGeometries(4);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xE8B14A,
            emissive: 0x3a2408,
            emissiveIntensity: 1.0,
            metalness: 0.55,
            roughness: 0.3,
            flatShading: true,
            transparent: true,
            opacity: 0.0
        });
        this.northStarMesh = new THREE.Group();
        this.northStarMesh.add(new THREE.Mesh(geoUp, mat));
        this.northStarMesh.add(new THREE.Mesh(geoDown, mat));
        // Kept as `.material` (singular) since tick() and raycasting code
        // reference it directly — both tetrahedra share this one material.
        this.northStarMesh.material = mat;
        this.northStarMesh.position.set(0, 0, 0);
        this.northStarMesh.visible = false;

        this.northStarGlow = createGlowSprite(0xe8b14a, 18, 0.6);
        this.northStarMesh.add(this.northStarGlow);

        this.localGroup.add(this.northStarMesh);
    }

    initDynamicGlintTracking() {
        document.querySelectorAll('.btn-nebula').forEach(button => {
            let glint = button.querySelector('.glint');
            if (!glint) {
                glint = document.createElement('div');
                glint.className = 'glint';
                button.appendChild(glint);
            }
            button.addEventListener('mousemove', (e) => {
                const rect = button.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                glint.style.left = `${x}px`;
                glint.style.top = `${y}px`;
            });
        });
    }

    bindEvents() {
        this.pointerClickHandler = this.onPointerClick.bind(this);
        window.addEventListener('click', this.pointerClickHandler);

        this.mouseDownHandler = () => { this.controls.autoRotate = false; };
        this.mouseUpHandler = () => { if (this.currentPhase === PHASE.FULL_SKY) this.controls.autoRotate = true; };
        this.renderer.domElement.addEventListener('mousedown', this.mouseDownHandler);
        this.renderer.domElement.addEventListener('mouseup', this.mouseUpHandler);

        // Custom smooth zoom — OrbitControls.enableZoom is off (see mount());
        // this only accumulates a velocity, the actual easing happens once
        // per frame in tick(). { passive: false } is required to call
        // preventDefault() and stop the page itself from scrolling/the
        // browser's own pinch-zoom from fighting this.
        this.wheelHandler = (event) => {
            if (!this.controls.enabled) return;
            event.preventDefault();
            const sign = Math.sign(event.deltaY);
            if (sign === 0) return;
            // Normalizes across input devices — a mouse wheel typically
            // reports ~100-120 per click, trackpads report many small
            // continuous deltas. Without this a trackpad flick would feel
            // far twitchier than a wheel click for the same gesture.
            const magnitude = Math.min(Math.abs(event.deltaY), 100) / 100;
            this.zoomVelocity = THREE.MathUtils.clamp(
                this.zoomVelocity + sign * magnitude * ZOOM_IMPULSE,
                -ZOOM_MAX_VELOCITY,
                ZOOM_MAX_VELOCITY
            );
        };
        this.renderer.domElement.addEventListener('wheel', this.wheelHandler, { passive: false });

        document.getElementById('create-btn')?.addEventListener('click', () => {
            // Deliberately NOT branching on isEditMode anymore — locking in
            // is now edit-lockin-btn's job (see below), so this button keeps
            // meaning "create another star" the whole time edit mode is
            // open, letting a user add a whole batch in one session.
            //
            // Gated on !this.chosenGoal, not just phase — a returning user
            // who already has a North Star but zero constellations yet
            // (set it via the Avatar page/quiz, never onboarded the sky)
            // should go straight to creating a constellation, not back
            // through the pathway-choosing modal. Mirrors
            // updateCreateButtonLabel()'s showChoosePathway condition.
            if (this.currentPhase === PHASE.CREATION && !this.chosenGoal) {
                this.openGoalModal();
            } else if (this.currentPhase === PHASE.CONST_FOCUS && this.selectedConstellation) {
                this.promptCustomStarCreation();
            } else {
                this.promptCustomConstellationCreation();
            }
        });

        document.getElementById('edit-mode-btn')?.addEventListener('click', () => this.enterEditMode());
        document.getElementById('edit-lockin-btn')?.addEventListener('click', () => this.exitEditMode({ commit: true }));
        document.getElementById('edit-cancel-btn')?.addEventListener('click', () => this.exitEditMode({ commit: false }));

        this.bindEditPointerEvents();

        document.querySelectorAll('.goal-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.goal-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                // A preset and typed text are mutually exclusive — picking
                // one clears the other so it's unambiguous which is chosen.
                const customInput = document.getElementById('custom-goal-input');
                if (customInput) customInput.value = '';
                this.chosenGoal = opt.dataset.path;
                const btn = document.getElementById('confirm-goal-btn');
                if (btn) btn.disabled = false;
            });
        });

        // Quick-pass free-text option (docs/decisions/north-star-goal-input.md
        // has the full intended feature — this input is a stopgap, not that).
        document.getElementById('custom-goal-input')?.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            const btn = document.getElementById('confirm-goal-btn');
            if (value) {
                document.querySelectorAll('.goal-option').forEach(o => o.classList.remove('selected'));
                this.chosenGoal = value.toUpperCase();
                if (btn) btn.disabled = false;
            } else if (!document.querySelector('.goal-option.selected')) {
                this.chosenGoal = '';
                if (btn) btn.disabled = true;
            }
        });

        document.getElementById('cancel-goal-btn')?.addEventListener('click', () => this.closeModal('goal-modal'));
        document.getElementById('confirm-goal-btn')?.addEventListener('click', () => this.confirmGoal());

        document.getElementById('dismiss-loop-btn')?.addEventListener('click', () => this.dismissLoopItem());
        document.getElementById('confirm-loop-btn')?.addEventListener('click', () => this.confirmLoopItem());

        document.getElementById('quick-input-cancel-btn')?.addEventListener('click', () => this.closeQuickInput());
        document.getElementById('quick-input-save-btn')?.addEventListener('click', () => this.confirmQuickInput());
        document.getElementById('quick-input-field')?.addEventListener('keydown', (e) => {
            // Stopped from bubbling so typing "z"/Delete/etc. while renaming
            // can never be misread by onEditKeyDown as an undo or a delete of
            // whatever star happened to be hovered before the modal opened.
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); this.confirmQuickInput(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.closeQuickInput(); }
        });

        document.getElementById('create-const-cancel-btn')?.addEventListener('click', () => this.closeCreateConstellationModal());
        document.getElementById('create-const-save-btn')?.addEventListener('click', () => this.confirmCreateConstellation());
        [['create-const-name', false], ['create-const-hint', true]].forEach(([id, allowEnter]) => {
            document.getElementById(id)?.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Escape') { e.preventDefault(); this.closeCreateConstellationModal(); }
                // Enter submits from the description field, not the name
                // field — a two-field form shouldn't submit on the first
                // field's Enter before the second is even filled in.
                else if (e.key === 'Enter' && !e.shiftKey && allowEnter) {
                    e.preventDefault();
                    this.confirmCreateConstellation();
                }
            });
        });

        document.getElementById('back-btn')?.addEventListener('click', () => this.handleBackAction());
        document.getElementById('north-star-btn')?.addEventListener('click', () => this.openNorthStarScreen());
        document.getElementById('nav-home-btn')?.addEventListener('click', () => this.router.navigate('home'));

        document.getElementById('close-star-panel-btn')?.addEventListener('click', () => this.closeStarDetailPanel());
        document.getElementById('add-evidence-btn')?.addEventListener('click', () => this.addEvidence());
        document.getElementById('add-planet-btn')?.addEventListener('click', () => this.addPlanetStep());
        document.getElementById('submit-validation-btn')?.addEventListener('click', () => this.submitForValidation());
        document.getElementById('star-color-picker')?.addEventListener('input', (e) => {
            if (!this.selectedStarData) return;
            this.selectedStarData.customColor = e.target.value;
            this.refreshStarVisuals(this.selectedStarData);
        });
        document.getElementById('ai-split-btn')?.addEventListener('click', () => this.openMitosisPanel());
        document.getElementById('mitosis-cancel-btn')?.addEventListener('click', () => this.closeMitosisPanel());
        document.getElementById('mitosis-confirm-btn')?.addEventListener('click', () => this.confirmMitosisSplits());
        document.getElementById('star-color-reset-btn')?.addEventListener('click', () => {
            if (!this.selectedStarData) return;
            delete this.selectedStarData.customColor;
            this.refreshStarVisuals(this.selectedStarData);
            this.syncColorPicker(this.selectedStarData);
        });

        document.getElementById('dismiss-ns-btn')?.addEventListener('click', () => this.closeNorthStarScreen());
        document.getElementById('ns-next-step')?.addEventListener('click', () => this.jumpToNextStepNode());
        document.getElementById('create-north-star-btn')?.addEventListener('click', () => this.createNorthStar());
    }

    /**
     * UI is still a quick-pass stopgap (see the "project-north-star-goal-input"
     * memory for the real intended feature — free text driving live
     * suggestions, plus Avatar-page/Academy/quiz entry points, none of which
     * exist yet). Persistence itself is real: saveNorthStarGoal() below
     * PATCHes Avatar.north_star_goal, which did already exist server-side.
     */
    createNorthStar() {
        this.openQuickInput({
            title: 'DEFINE YOUR NORTH STAR',
            placeholder: 'e.g. Build technology that serves human consciousness',
            onConfirm: (value) => {
                this.chosenGoal = value.toUpperCase();
                this.renderNorthStarScreen();
                const hud = document.getElementById('hud-text');
                if (hud) {
                    hud.innerHTML = `MAP TRACKING ACTIVE<br>CURRENT PATHWAY:<br>${this.chosenGoal}<br><br>[DRAG TO ROTATE &#8226; SCROLL TO ZOOM]`;
                }
                // Same gap fixed in renderExistingStarMap(): only
                // confirmGoal() (onboarding) ever turned this mesh on.
                if (this.northStarMesh) this.northStarMesh.visible = true;
                this.saveNorthStarGoal(this.chosenGoal);
            }
        });
    }

    /**
     * Persists chosenGoal to Avatar.north_star_goal (PATCH /avatars/{id} —
     * already existed and already had this field writable; it just wasn't
     * being called from anywhere). Fire-and-forget: the UI already reflects
     * the goal locally regardless of save outcome, and this is low-stakes
     * enough not to block on. No-op under the dev bypass.
     */
    saveNorthStarGoal(goal) {
        if (!this.usingRealBackend) return;
        const avatarId = store.getState().user?.avatar?.id;
        if (!avatarId) return;
        avatarApi.updateAvatar(avatarId, { north_star_goal: goal }).catch((err) => {
            console.error('[StarMapView] Failed to save North Star goal:', err);
            this.showEditToast('Failed to save North Star — try again');
        });
    }

    /** Delegates camera moves to the persistent shell engine instead of running an ad-hoc per-frame lerp. */
    async animateCameraTo(pos, lookAt, duration = 1200, resumeAutoRotate = false) {
        this.controls.enabled = false;
        this.controls.autoRotate = false;
        await this.sceneEngine.cameraTo(pos, lookAt, duration);
        this.controls.enabled = true;
        if (resumeAutoRotate) this.controls.autoRotate = true;
    }

    openGoalModal() {
        const modal = document.getElementById('goal-modal');
        if (modal) modal.style.display = 'flex';
    }

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    }

    confirmGoal() {
        this.closeModal('goal-modal');
        this.saveNorthStarGoal(this.chosenGoal);

        const icon = document.getElementById('create-btn-icon');
        if (icon) icon.innerText = "+";
        this.updateCreateButtonLabel();

        if (this.northStarMesh) this.northStarMesh.visible = true;
        this.confirmationLoopIndex = 0;
        // The confirmation loop is shared with confirmCreateConstellation()
        // (a single ad-hoc constellation added later reuses the exact same
        // confirm/skip modal flow) — this is what tells the terminal step in
        // executeConfirmationLoopStep() which of those two situations it's
        // actually finishing, since it can't otherwise distinguish "just
        // finished onboarding the whole sky" from "just finished confirming
        // one constellation someone added afterward."
        this.confirmationLoopOnComplete = 'north-star';
        this.executeConfirmationLoopStep();
    }

    /**
     * The astrolabe "create" button does three different things depending on
     * where you are: choose a pathway (before any constellation exists),
     * create a constellation (sky overview), or create a star (inside a
     * focused constellation) — its label reflects whichever is active.
     */
    updateCreateButtonLabel() {
        const label = document.getElementById('create-btn-label');
        const icon = document.getElementById('create-btn-icon');
        const editBtn = document.getElementById('edit-mode-btn');
        const cancelBtn = document.getElementById('edit-cancel-btn');
        const lockInBtn = document.getElementById('edit-lockin-btn');
        const hint = document.getElementById('edit-hint');

        // In edit mode the primary button keeps meaning "create another
        // star" — LOCK IN is its own dedicated button now — so a whole
        // batch of stars can be added in one edit session without bouncing
        // out (and back in) between each one.
        if (this.isEditMode) {
            if (label) label.innerText = "CREATE NEW STAR";
            if (icon) icon.innerText = "+";
            editBtn?.classList.add('hidden');
            editBtn?.classList.remove('flex');
            cancelBtn?.classList.remove('hidden');
            cancelBtn?.classList.add('flex');
            lockInBtn?.classList.remove('hidden');
            lockInBtn?.classList.add('flex');
            hint?.classList.remove('hidden');
            return;
        }

        // "CHOOSE PATHWAY" only applies pre-North-Star — a returning user
        // who already has a goal but happens to have zero constellations
        // yet (set it via the Avatar page/quiz, never onboarded the sky)
        // should land straight on "CREATE NEW CONSTELLATION" like any other
        // established account, not be sent through onboarding again.
        const showChoosePathway = this.currentPhase === PHASE.CREATION && !this.chosenGoal;
        if (label) {
            if (showChoosePathway) {
                label.innerText = "CHOOSE PATHWAY";
            } else if (this.currentPhase === PHASE.CONST_FOCUS) {
                label.innerText = "CREATE NEW STAR";
            } else {
                label.innerText = "CREATE NEW CONSTELLATION";
            }
        }
        if (icon && !showChoosePathway) icon.innerText = "+";
        cancelBtn?.classList.add('hidden');
        cancelBtn?.classList.remove('flex');
        lockInBtn?.classList.add('hidden');
        lockInBtn?.classList.remove('flex');
        hint?.classList.add('hidden');

        // Reordering only means anything inside a focused constellation.
        const canEdit = this.currentPhase === PHASE.CONST_FOCUS && !!this.selectedConstellation;
        editBtn?.classList.toggle('hidden', !canEdit);
        editBtn?.classList.toggle('flex', canEdit);
    }

    executeConfirmationLoopStep() {
        if (this.confirmationLoopIndex < this.localConstellationConfig.length) {
            const configNode = this.localConstellationConfig[this.confirmationLoopIndex];

            const nameEl = document.getElementById('confirm-const-name');
            const hintEl = document.getElementById('confirm-const-hint');
            const modal = document.getElementById('confirm-modal');

            if (nameEl) nameEl.innerText = configNode.name;
            if (hintEl) hintEl.innerText = configNode.hint;
            if (modal) modal.style.display = 'flex';

            const nodePos = constellationPos(configNode);
            const flyTarget = nodePos.clone().add(new THREE.Vector3(0, 20, 90));
            this.animateCameraTo(flyTarget, nodePos, 1200, false);
        } else {
            this.closeModal('confirm-modal');
            this.currentPhase = PHASE.FULL_SKY;

            const hud = document.getElementById('hud-text');
            if (hud) {
                hud.innerHTML = `MAP TRACKING ACTIVE<br>CURRENT PATHWAY:<br>${this.chosenGoal}<br><br>[DRAG TO ROTATE &#8226; SCROLL TO ZOOM]`;
            }
            const wallet = document.getElementById('lux-wallet');
            if (wallet) wallet.style.display = 'block';

            // North Star (Zoom 0) is reachable once the sky exists — the mesh
            // itself is a small raycast target, so expose an explicit control.
            const nsBtn = document.getElementById('north-star-btn');
            if (nsBtn) nsBtn.style.display = 'block';

            this.updateDirectoryPanel();

            // What happens next depends on WHY this loop was running — it's
            // shared between the initial full-sky population (confirmGoal())
            // and confirming a single ad-hoc constellation added later
            // (confirmCreateConstellation()), and those two situations want
            // opposite outcomes here.
            const onComplete = this.confirmationLoopOnComplete;
            this.confirmationLoopOnComplete = null;

            if (onComplete === 'north-star') {
                // Land on the North Star screen right after the sky is
                // populated for the first time — the natural "here's your
                // goal" moment once a pathway is committed, rather than
                // dropping the user into an empty wide-sky view with no
                // obvious next action. A single camera flight straight there
                // (openNorthStarScreen's own), NOT a wide-sky flight
                // immediately superseded by it — two competing
                // animateCameraTo calls back to back was exactly the bug
                // behind the "Next Step" stuck-modal investigation (the
                // first call's resumeAutoRotate completion handler racing
                // the second's). handleBackAction() already flies to this
                // same wide view, with auto-rotate, whenever the user backs
                // out from the North Star screen.
                this.openNorthStarScreen();
            } else if (onComplete && onComplete.focusConstellationId != null) {
                // A constellation created in isolation, unrelated to the
                // initial North Star definition, should focus on ITSELF —
                // not detour through the North Star screen. Only present if
                // the constellation was actually confirmed (not skipped);
                // confirmLoopItem() is what adds it to
                // constellationNodesArray, so a skipped one simply isn't
                // found here and nothing happens, which is correct.
                const item = this.constellationNodesArray.find(c => c.id === onComplete.focusConstellationId);
                if (item) this.transitionToFocusPhase(item);
            }
        }
    }

    /**
     * "CREATE NEW STAR" — the astrolabe button's action while a constellation
     * is focused. Color isn't prompted for separately: every new star already
     * gets a bright per-star color from computeStarBaseColor(), and the panel
     * (opened automatically afterward) has the color picker if they want to
     * override it.
     */
    promptCustomStarCreation() {
        const constellationItem = this.selectedConstellation;
        if (!constellationItem) return;

        this.openQuickInput({
            title: 'NAME THIS STAR',
            placeholder: 'NEW OBJECTIVE',
            onConfirm: (title) => this.createCustomStar(constellationItem, title)
        });
    }

    createCustomStar(constellationItem, title) {
        const dataObj = {
            id: `custom_star_${constellationItem.id}_${Date.now()}`,
            constellationId: constellationItem.id,
            title: title.toUpperCase(),
            description: '',
            status: 'pending',
            planets: [],
            evidence: []
        };
        this.localStarData.push(dataObj);

        // Position is a throwaway — placeNewStars() below (via
        // applyGraphChange's newStarIds) puts it near its attachment point
        // without disturbing any other star's position.
        this.spawnStarMesh(dataObj, new THREE.Vector3(0, 0, 0), constellationItem);

        // A milestone added by hand belongs at the end of the sequence: it is
        // the new furthest-out thing to work toward. Attach to the deepest
        // tail (a constellation can have several if it branches), which
        // becomes a new endpoint star. Drag it elsewhere in edit mode, which
        // opens automatically below.
        const nodeIds = this.starIdsFor(constellationItem.id);
        const existing = nodeIds.filter(id => id !== dataObj.id);
        const nextEdges = [...constellationItem.edges];
        if (existing.length > 0) {
            const rank = topoRank(constellationItem.edges, existing);
            const tails = graphTails(constellationItem.edges, existing);
            const anchor = (tails.length ? tails : existing)
                .slice()
                .sort((a, b) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0))[0];
            nextEdges.push({ from: anchor, to: dataObj.id });
        }

        this.applyGraphChange(constellationItem, nextEdges, { newStarIds: [dataObj.id] });
        this.enterEditMode({ highlight: [dataObj.id] });
    }

    promptCustomConstellationCreation() {
        const modal = document.getElementById('create-constellation-modal');
        const nameInput = document.getElementById('create-const-name');
        const hintInput = document.getElementById('create-const-hint');
        if (nameInput) nameInput.value = '';
        if (hintInput) hintInput.value = 'A custom group of objective stargates.';
        if (modal) modal.style.display = 'flex';
        requestAnimationFrame(() => { nameInput?.focus(); });
    }

    closeCreateConstellationModal() {
        this.closeModal('create-constellation-modal');
    }

    async confirmCreateConstellation() {
        const nameInput = document.getElementById('create-const-name');
        const hintInput = document.getElementById('create-const-hint');
        const name = nameInput?.value.trim();
        const hint = hintInput?.value.trim();
        this.closeCreateConstellationModal();
        if (!name || !hint) return;

        let customEntry;
        if (this.usingRealBackend) {
            // Needs the server-assigned real id + angle_deg/radius before
            // any star can attach to it — can't invent these locally
            // anymore. `hint` has nowhere to persist (Constellation has no
            // description field server-side); kept as a client-only display
            // string for the confirm-modal step below, same as before.
            try {
                const created = await starmapApi.createConstellation({ name: name.toUpperCase() });
                customEntry = {
                    id: created.id,
                    name: created.name,
                    angle_deg: created.angle_deg,
                    radius: created.radius,
                    tilt_deg: (Math.random() - 0.5) * 90,
                    hint: hint
                };
            } catch (err) {
                console.error('[StarMapView] Failed to create constellation:', err);
                this.showEditToast('Failed to create constellation — try again');
                return;
            }
        } else {
            // Generate polar coordinates directly (spec §11 shape), rather than a
            // Cartesian point that would then have to be converted back. No
            // `offsets` field — per-star shape is now computed by
            // layoutConstellation(), not authored per constellation (DEC-013).
            customEntry = {
                id: this.localConstellationConfig.length,
                name: name.toUpperCase(),
                angle_deg: Math.random() * 360,
                radius: 0.7 + Math.random() * 0.25,
                tilt_deg: (Math.random() - 0.5) * 90,
                hint: hint
            };
        }

        const newIndex = this.localConstellationConfig.length;
        this.localConstellationConfig.push(customEntry);
        this.confirmationLoopIndex = newIndex;
        // Unlike confirmGoal()'s initial population, finishing this one-item
        // loop should land the camera on the constellation just created, not
        // reopen the North Star screen.
        this.confirmationLoopOnComplete = { focusConstellationId: customEntry.id };
        this.executeConfirmationLoopStep();
    }

    /**
     * Builds one star's full 3D representation (astrolabe sigil gem + two
     * decorative rings + glow sprite + DOM label) and registers it in
     * flatStarsArray. Shared by initial constellation creation and by mitosis,
     * so a split-created star is identical to a seeded one.
     *
     * @param {Object} dataObj      the star record
     * @param {THREE.Vector3} localPos  position within the constellation group
     * @param {{id:number, group:THREE.Group}} constellationRef
     * @returns {THREE.Mesh} the gem mesh
     */
    spawnStarMesh(dataObj, localPos, constellationRef) {
        const labelsContainer = document.getElementById('labels-container');
        const isDormant = dataObj.status === 'pending';
        const baseHex = computeStarBaseColor(dataObj);

        // "Astrolabe sigil" node: a faceted gem core (bright Fresnel-lit rim,
        // richer/darker core, slow pulse) orbited by two tilted calibration
        // rings, wrapped in the existing soft glow halo.
        // edgeScale is much gentler than the module default (0.72 vs 0.45) —
        // the "core" color dominates most of the visible facet surface (low
        // Fresnel), so crushing it toward black there made every star read
        // as near-black regardless of how bright its base color was.
        const { center: starRimColor, edge: starCoreColor } = deriveRadialColors(baseHex, 0.55, STAR_CORE_EDGE_SCALE);
        const gemGeo = createSigilGeometry(1.4);
        const gemMat = createSigilCoreMaterial(starCoreColor, starRimColor);
        const outerMesh = new THREE.Mesh(gemGeo, gemMat);
        outerMesh.position.copy(localPos);

        const ringOpacity = isDormant ? 0.18 : 0.5;
        const ring1 = createAstrolabeRing(2.0, 0.025, starRimColor, ringOpacity);
        ring1.rotation.set(1.1, 0.4, 0);
        const ring2 = createAstrolabeRing(2.35, 0.02, starRimColor, ringOpacity * 0.8);
        ring2.rotation.set(-0.7, 0, 0.6);
        outerMesh.add(ring1, ring2);

        // Glow always matches the star's own base color (not a fixed status
        // color), and is brighter overall than before — the old 0.12 dormant
        // floor read as barely-there even once a star was fully approved.
        const baseGlowIntensity = isDormant ? 0.22 : 0.55;
        const nodeGlowMesh = createGlowSprite(baseHex, 13, baseGlowIntensity);
        outerMesh.add(nodeGlowMesh);

        // Direct references instead of children[N] indexing — robust to any
        // future reordering of the child meshes above.
        outerMesh.userData.ring1 = ring1;
        outerMesh.userData.ring2 = ring2;
        outerMesh.userData.glowMesh = nodeGlowMesh;
        outerMesh.userData.baseGlowIntensity = baseGlowIntensity;
        outerMesh.userData.isDormant = isDormant;
        // Back-reference so a raycast hit resolves to its star in O(1). Drag
        // picking walks up from whichever child (ring/glow) was actually hit
        // until it finds this.
        outerMesh.userData.starId = dataObj.id;

        constellationRef.group.add(outerMesh);

        const starLabel = document.createElement('div');
        starLabel.className = 'node-label';
        starLabel.style.display = 'none';
        starLabel.innerText = dataObj.title;
        if (labelsContainer) labelsContainer.appendChild(starLabel);

        starLabel.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openStarDetailPanel(dataObj);
        });
        starLabel.addEventListener('mouseenter', () => { outerMesh.userData.isHovered = true; });
        starLabel.addEventListener('mouseleave', () => { outerMesh.userData.isHovered = false; });

        // Edit-mode link handle: a SEPARATE element from the title label,
        // positioned at the star's own screen position (not the label's
        // lifted one) each frame in tick(). It used to live embedded inside
        // the label, next to the title text — easy to miss and easy to
        // confuse with "drag the title", when the actual target is the star
        // itself. Hidden outside edit mode; toggled in refreshEditBadges().
        const linkHandle = document.createElement('div');
        linkHandle.className = 'star-link-handle-standalone';
        linkHandle.style.display = 'none';
        linkHandle.innerHTML = '&#8637;';
        linkHandle.title = 'Drag onto another star to link them';
        if (labelsContainer) labelsContainer.appendChild(linkHandle);
        linkHandle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.beginLinkDrag(dataObj.id);
        });

        this.flatStarsArray.push({
            mesh: outerMesh,
            label: starLabel,
            linkHandle,
            data: dataObj,
            constellationId: constellationRef.id
        });

        return outerMesh;
    }

    /**
     * Builds one dashed connector line between two star meshes, in `group`'s
     * local space. Its lit/dim state and color are set by the very next
     * refreshConstellationVisuals() call, not here — this only wires up the
     * geometry and the userData refs that call depends on. Shared by initial
     * constellation creation, manual star creation, and mitosis, so every
     * connector behaves identically regardless of how it was added.
     */
    addConnectorLine(group, fromMesh, toMesh, fromStarId, toStarId) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
            fromMesh.position,
            toMesh.position
        ]);
        // Bright, high-value colors and an explicit renderOrder — with
        // depthWrite:false these are in the "transparent" render queue,
        // whose back-to-front sort is by bounding-sphere distance only
        // (not per-pixel), so without a forced renderOrder they could easily
        // end up drawn — and effectively hidden — behind the much larger
        // glow sprites.
        const lineMat = new THREE.LineDashedMaterial({
            transparent: true,
            dashSize: 0.6,
            gapSize: 0.9,
            depthWrite: false
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances(); // required for LineDashedMaterial to render dashes
        line.renderOrder = 15;
        line.userData.fromStarId = fromStarId;
        line.userData.toStarId = toStarId;
        group.add(line);
        return line;
    }

    /* ── Star graph ─────────────────────────────────────────────────────
     *
     * `constellationItem.edges` is the structure; connector lines and star
     * positions are both derived from it. Every mutation goes through
     * applyGraphChange() so nothing can leave the two out of sync — which is
     * exactly how split stars used to end up stacked on each other.
     */

    /** Star ids belonging to a constellation, in flatStarsArray order. */
    starIdsFor(constellationId) {
        return this.flatStarsArray
            .filter(s => s.constellationId === constellationId)
            .map(s => s.data.id);
    }

    /**
     * Which star the golden North Star spoke line connects to: the sink of
     * the constellation's DAG (the star with no outgoing edge) — the "last
     * star in the sequence," so finishing every star in a constellation
     * visibly completes its link to the goal. A branching DAG can have more
     * than one sink; ties break toward whichever was most recently
     * added (last in flatStarsArray order), since that's the star the user
     * most recently extended the sequence with.
     */
    findSpokeTargetStarId(constellationItem) {
        const starIds = this.starIdsFor(constellationItem.id);
        if (starIds.length === 0) return null;
        const hasOutgoing = new Set((constellationItem.edges || []).map(e => e.from));
        for (let i = starIds.length - 1; i >= 0; i--) {
            if (!hasOutgoing.has(starIds[i])) return starIds[i];
        }
        return starIds[starIds.length - 1];
    }

    /**
     * Re-points the spoke line at the constellation's current sink star (see
     * findSpokeTargetStarId), in the same group-local space connector lines
     * already use. Called alongside rebuildConnectorLines/
     * refreshConnectorGeometry so it never drifts out of sync with the graph
     * or a star's live position.
     */
    refreshSpokeLine(constellationItem) {
        if (!constellationItem.spokeLine) return;
        const targetId = this.findSpokeTargetStarId(constellationItem);
        const targetEntry = this.flatStarsArray.find(
            s => s.constellationId === constellationItem.id && s.data.id === targetId
        );
        if (!targetEntry) return;
        constellationItem.spokeLine.geometry.setFromPoints([
            constellationPos(constellationItem.config).negate(), // North Star, in this group's local space
            targetEntry.mesh.position
        ]);
        constellationItem.spokeLine.geometry.attributes.position.needsUpdate = true;
        constellationItem.spokeLine.computeLineDistances();
    }

    /**
     * Re-centers a constellation's sky-label anchor (labelAnchorLocal) on
     * the current average position of its stars, in the same group-local
     * space star meshes already live in. Deliberately only called on LOCK
     * IN (exitEditMode's commit path) — the title tracking every in-progress
     * drag would be distracting; it should settle once, when the session's
     * final arrangement is committed.
     */
    recomputeLabelAnchor(constellationItem) {
        const entries = this.flatStarsArray.filter(s => s.constellationId === constellationItem.id);
        if (entries.length === 0) return;
        const centroid = entries
            .reduce((acc, s) => acc.add(s.mesh.position), new THREE.Vector3());
        constellationItem.labelAnchorLocal = centroid.divideScalar(entries.length);
    }

    /**
     * Throw away every connector line and rebuild one per edge. Wholesale
     * rather than incremental on purpose: the previous incremental path
     * (detachStarFromSequence) used .find() so it only ever handled ONE
     * incoming and ONE outgoing edge, and disposed exactly two Line objects —
     * so any star with a branch left orphaned lines rendering in the scene
     * that nothing could later recolor or remove.
     */
    rebuildConnectorLines(constellationItem) {
        (constellationItem.connectorLines || []).forEach((line) => {
            constellationItem.group.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });

        const meshById = new Map(
            this.flatStarsArray
                .filter(s => s.constellationId === constellationItem.id)
                .map(s => [s.data.id, s.mesh])
        );

        constellationItem.edges = normalizeEdges(constellationItem.edges || [])
            .filter(e => meshById.has(e.from) && meshById.has(e.to));

        constellationItem.connectorLines = constellationItem.edges.map(({ from, to }) =>
            this.addConnectorLine(
                constellationItem.group, meshById.get(from), meshById.get(to), from, to
            )
        );
        this.refreshSpokeLine(constellationItem);
    }

    /**
     * Re-point a connector line's geometry at its endpoints' current
     * positions. Connector geometry is a snapshot taken when the line is
     * built, so moving a star does not move its lines — during a drag this
     * has to run every frame. computeLineDistances() is not optional: without
     * it the dash pattern is computed against stale lengths and visibly
     * corrupts as the line changes length.
     */
    refreshConnectorGeometry(constellationItem) {
        const meshById = new Map(
            this.flatStarsArray
                .filter(s => s.constellationId === constellationItem.id)
                .map(s => [s.data.id, s.mesh])
        );
        (constellationItem.connectorLines || []).forEach((line) => {
            const a = meshById.get(line.userData.fromStarId);
            const b = meshById.get(line.userData.toStarId);
            if (!a || !b) return;
            line.geometry.setFromPoints([a.position, b.position]);
            line.geometry.attributes.position.needsUpdate = true;
            line.computeLineDistances();
        });
        this.refreshSpokeLine(constellationItem);
    }

    /**
     * Runs the full procedural (force-directed) layout for EVERY star in the
     * constellation at once — used only when there's no existing arrangement
     * to preserve: a brand-new constellation (confirmLoopItem) or an
     * explicit full reshape. Structural edits to an existing constellation
     * do NOT call this — see applyGraphChange()/placeNewStars()/
     * declutterConstellation(), which only touch what actually needs to
     * move, so a user's manual arrangement survives adding a star, splitting
     * one, or reordering.
     *
     * Seeded by constellation id, so each one settles into its own
     * distinctive shape and the same structure always yields the same shape.
     */
    layoutConstellation(constellationItem, { animate = true, duration = 400 } = {}) {
        const nodeIds = this.starIdsFor(constellationItem.id);
        if (nodeIds.length === 0) return;

        const positions = computeLayout(constellationItem.edges || [], nodeIds, {
            seedKey: `c${constellationItem.id}:`
        });

        const entries = this.flatStarsArray.filter(s => s.constellationId === constellationItem.id);

        // DEC-013 amendment: a star with a saved placement (x/y/z all
        // non-null — set once it's been through a real lock-in) keeps it.
        // computeLayout()'s procedural placement above is only the fallback
        // for a star that's never been explicitly positioned.
        entries.forEach((s) => {
            const { x, y, z } = s.data;
            if (x != null && y != null && z != null) {
                positions.set(s.data.id, { x, y, z });
            }
        });

        if (!animate) {
            entries.forEach((s) => {
                const p = positions.get(s.data.id);
                if (p) s.mesh.position.set(p.x, p.y, p.z);
            });
            this.rebuildConnectorLines(constellationItem);
            this.refreshConstellationVisuals(constellationItem.id);
            return;
        }

        // Cancel any in-flight layout so two rapid structural edits don't
        // fight over the same meshes.
        if (this.layoutTween) this.layoutTween.cancelled = true;
        const tween = {
            cancelled: false,
            start: performance.now(),
            duration,
            items: entries.map((s) => {
                const p = positions.get(s.data.id);
                return {
                    mesh: s.mesh,
                    from: s.mesh.position.clone(),
                    to: p ? new THREE.Vector3(p.x, p.y, p.z) : s.mesh.position.clone()
                };
            }),
            constellationItem
        };
        this.layoutTween = tween;
        // Lines are rebuilt up front so new edges are visible while the stars
        // slide; tick() re-points their geometry each frame.
        this.rebuildConnectorLines(constellationItem);
        this.refreshConstellationVisuals(constellationItem.id);
    }

    /** Per-frame step of the layout slide. Driven from tick(). */
    updateLayoutTween() {
        const tween = this.layoutTween;
        if (!tween || tween.cancelled) return;
        const t = Math.min((performance.now() - tween.start) / tween.duration, 1);
        // easeInOutCubic — settles rather than snapping
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        tween.items.forEach(({ mesh, from, to }) => mesh.position.lerpVectors(from, to, e));
        this.refreshConnectorGeometry(tween.constellationItem);
        if (t >= 1) this.layoutTween = null;
    }

    /**
     * Positions freshly-created stars WITHOUT moving anything already
     * placed. Manual (or previously procedural) arrangement is the thing
     * being preserved here — only the new stars themselves get a position,
     * each extending outward from its attachment point, turning by a small
     * CONSISTENT angle (same rotation direction and per-constellation
     * magnitude every time) relative to the incoming direction — so a chain
     * of stars gradually curls/spirals outward the longer it gets, rather
     * than zigzagging. (An earlier version picked a fresh random left/right
     * sign per star, which cancelled out into a visually flat/jittery line
     * instead of an actual curl — this replaces that.) Processes
     * `newStarIds` in order, so a later new star anchors off an earlier
     * one's just-computed position when they're chained together, letting
     * the turn compound across the whole batch (e.g. a mitosis chain).
     */
    placeNewStars(constellationItem, newStarIds) {
        const meshOf = (id) => this.flatStarsArray.find(s => s.data.id === id)?.mesh;

        // One curl "character" per constellation — same turn direction and
        // roughly the same magnitude every time stars are added to it, so
        // it reads as one coherent, gradually-unfolding shape rather than a
        // different random wobble each session. Different constellations
        // get different turn angles/axes from their own id.
        const curlRng = mulberry32(hashStringToInt(`curl:${constellationItem.id}`));
        const turnAngle = (0.55 + curlRng() * 0.45) * (curlRng() < 0.5 ? -1 : 1); // ~31-57°, one consistent sign
        const tiltAxis = new THREE.Vector3(curlRng() - 0.5, 1, curlRng() - 0.5).normalize();

        newStarIds.forEach((id) => {
            const mesh = meshOf(id);
            if (!mesh) return;

            const predId = constellationItem.edges.find(e => e.to === id)?.from;
            const predMesh = predId ? meshOf(predId) : null;
            const grandPredId = predId
                ? constellationItem.edges.find(e => e.to === predId)?.from
                : null;
            const grandPredMesh = grandPredId ? meshOf(grandPredId) : null;

            const anchor = predMesh ? predMesh.position.clone() : new THREE.Vector3(0, 0, 0);
            const dir = (predMesh && grandPredMesh)
                ? predMesh.position.clone().sub(grandPredMesh.position)
                : anchor.clone();
            if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
            dir.normalize();
            // Turn further the same way the chain was already turning —
            // this is what accumulates into a spiral/unfold instead of a
            // straight line or a zigzag.
            dir.applyAxisAngle(tiltAxis, turnAngle);

            const rng = mulberry32(hashStringToInt(`place:${constellationItem.id}:${id}`));
            const dist = LAYOUT_DEFAULTS.edgeLength * (0.85 + rng() * 0.3);

            mesh.position.copy(anchor.add(dir.multiplyScalar(dist)));
        });
    }

    /**
     * Resolves ONLY actual overlaps in a constellation — pairs closer than
     * minSeparation get nudged apart the minimum needed. Everything else
     * keeps exactly the position it already has, whether that came from the
     * original procedural layout or from being dragged by hand. This is the
     * "manual placement, auto-clean-up only past a threshold" behaviour:
     * edits used to trigger a full procedural reshape of the whole
     * constellation, which fought with any arrangement the user had built by
     * hand and produced a visibly jarring snap even for something as small
     * as adding one new star near existing ones.
     */
    declutterConstellation(constellationItem, { animate = true, duration = 400 } = {}) {
        const entries = this.flatStarsArray.filter(s => s.constellationId === constellationItem.id);
        if (entries.length < 2) return;

        const current = new Map(entries.map(s => [s.data.id, {
            x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z
        }]));
        const settled = declutterPositions(current, LAYOUT_DEFAULTS.minSeparation);

        const moved = entries.some((s) => {
            const p = settled.get(s.data.id);
            return Math.abs(p.x - s.mesh.position.x) > 1e-3
                || Math.abs(p.y - s.mesh.position.y) > 1e-3
                || Math.abs(p.z - s.mesh.position.z) > 1e-3;
        });
        if (!moved) return;

        if (!animate) {
            entries.forEach((s) => {
                const p = settled.get(s.data.id);
                s.mesh.position.set(p.x, p.y, p.z);
            });
            this.refreshConnectorGeometry(constellationItem);
            return;
        }

        if (this.layoutTween) this.layoutTween.cancelled = true;
        this.layoutTween = {
            cancelled: false,
            start: performance.now(),
            duration,
            constellationItem,
            items: entries.map((s) => {
                const p = settled.get(s.data.id);
                return { mesh: s.mesh, from: s.mesh.position.clone(), to: new THREE.Vector3(p.x, p.y, p.z) };
            })
        };
    }

    /**
     * Apply a structural change, then re-derive rendering from it. Every
     * edit-mode operation and both creation paths funnel through here.
     *
     * Deliberately does NOT recompute the whole constellation's layout —
     * once a star has a position, whether from the initial procedural layout
     * or from being dragged by hand, structural edits preserve it. Freshly
     * created stars get positioned via placeNewStars(); everyone else only
     * moves if declutterConstellation() finds an actual overlap. See
     * exitEditMode() and confirmLoopItem() for the two cases that still use
     * the full procedural layout — locking in, and a brand-new constellation
     * with no existing arrangement to preserve.
     */
    applyGraphChange(constellationItem, nextEdges, { newStarIds = [] } = {}) {
        constellationItem.edges = normalizeEdges(nextEdges);
        if (newStarIds.length > 0) this.placeNewStars(constellationItem, newStarIds);
        this.rebuildConnectorLines(constellationItem);
        this.declutterConstellation(constellationItem);
        this.refreshConstellationVisuals(constellationItem.id);
        this.updateDirectoryPanel();
        if (this.isEditMode) this.refreshEditBadges();
    }

    /* ── Constellation edit mode ────────────────────────────────────────
     *
     * Reordering is authored by dragging: where a star is dropped decides
     * what it MEANS (its place in the sequence, or that it branches), and the
     * layout is then recomputed from the resulting graph. Positions are never
     * hand-placed, so stars cannot be dropped on top of each other.
     */

    /** Deep copy of everything an edit session can change. */
    snapshotGraph(constellationItem) {
        return {
            edges: constellationItem.edges.map(e => ({ ...e })),
            titles: this.flatStarsArray
                .filter(s => s.constellationId === constellationItem.id)
                .map(s => ({ id: s.data.id, title: s.data.title })),
            positions: this.flatStarsArray
                .filter(s => s.constellationId === constellationItem.id)
                .map(s => ({ id: s.data.id, pos: s.mesh.position.clone() })),
        };
    }

    restoreGraph(constellationItem, snap) {
        if (!snap) return;
        constellationItem.edges = snap.edges.map(e => ({ ...e }));
        const byId = new Map(this.flatStarsArray.map(s => [s.data.id, s]));
        snap.titles.forEach(({ id, title }) => {
            const entry = byId.get(id);
            if (entry) entry.data.title = title;
        });
        snap.positions.forEach(({ id, pos }) => {
            const entry = byId.get(id);
            if (entry) entry.mesh.position.copy(pos);
        });
        this.rebuildConnectorLines(constellationItem);
        this.refreshConstellationVisuals(constellationItem.id);
        this.updateDirectoryPanel();
        this.refreshEditBadges();
    }

    /** Called before any structural mutation so Ctrl+Z has something to go back to. */
    pushEditUndo() {
        if (!this.isEditMode || !this.selectedConstellation) return;
        this.editUndoStack.push(this.snapshotGraph(this.selectedConstellation));
        if (this.editUndoStack.length > 50) this.editUndoStack.shift();
        this.editRedoStack = [];
    }

    undoEdit() {
        if (!this.isEditMode || !this.selectedConstellation || this.editUndoStack.length === 0) return;
        this.editRedoStack.push(this.snapshotGraph(this.selectedConstellation));
        this.restoreGraph(this.selectedConstellation, this.editUndoStack.pop());
        this.showEditToast('Undone');
    }

    redoEdit() {
        if (!this.isEditMode || !this.selectedConstellation || this.editRedoStack.length === 0) return;
        this.editUndoStack.push(this.snapshotGraph(this.selectedConstellation));
        this.restoreGraph(this.selectedConstellation, this.editRedoStack.pop());
        this.showEditToast('Redone');
    }

    showEditToast(message) {
        const toast = document.getElementById('edit-toast');
        if (!toast) return;
        toast.innerText = message;
        toast.classList.add('is-visible');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
    }

    enterEditMode({ highlight = [] } = {}) {
        if (this.currentPhase !== PHASE.CONST_FOCUS || !this.selectedConstellation) return;

        // Re-entering (e.g. a second split while already editing) keeps the
        // existing session and snapshot — only the pulsed stars change.
        if (!this.isEditMode) {
            this.isEditMode = true;
            this.editSnapshot = this.snapshotGraph(this.selectedConstellation);
            this.editUndoStack = [];
            this.editRedoStack = [];
            this.closeStarDetailPanel();
            this.teardownPlanetOrbits();
            if (this.controls) this.controls.autoRotate = false;
        }

        this.pendingNewStarIds = [...new Set([...this.pendingNewStarIds, ...highlight])];
        this.updateCreateButtonLabel();
        this.refreshEditBadges();
    }

    async exitEditMode({ commit = true } = {}) {
        if (!this.isEditMode) return;
        const item = this.selectedConstellation;
        // Both captured BEFORE the resets below clear them — commitEditSession
        // needs the actual list of temp-id stars created this session, and
        // the failure-rollback path needs the snapshot. Reading either off
        // `this` after this point would see the already-cleared value: this
        // is exactly what caused "Edge references milestone(s) not in this
        // constellation" — commitEditSession's own `for (const tempId of
        // this.pendingNewStarIds)` loop ran against an array this same
        // function had already emptied a few lines above it, so no
        // milestones ever got created and the stale temp ids went straight
        // into the edge-replace call.
        const snapshotForRollback = this.editSnapshot;
        const pendingNewStarIdsForCommit = [...this.pendingNewStarIds];

        if (!commit && item) {
            this.restoreGraph(item, this.editSnapshot);
        }
        this.closeQuickInput();

        this.isEditMode = false;
        this.editSnapshot = null;
        this.editUndoStack = [];
        this.editRedoStack = [];
        this.pendingNewStarIds = [];
        this.drag = null;
        this.linkDrag = null;
        if (this.renderer) this.renderer.domElement.style.cursor = '';

        this.refreshEditBadges();
        this.updateCreateButtonLabel();

        if (commit && item) {
            if (this.usingRealBackend) {
                try {
                    await this.flushEditSession(item, snapshotForRollback, pendingNewStarIdsForCommit);
                } catch (err) {
                    console.error('[StarMapView] Failed to save edit session:', err);
                    this.showEditToast('Failed to save changes — reverted');
                    this.restoreGraph(item, snapshotForRollback);
                    return;
                }
            }
            // Locking in only resolves genuine overlaps — it does NOT
            // recompute the whole shape. Whatever the user arranged by hand
            // during the session is exactly what's kept; declutter only
            // moves stars that actually ended up too close to something.
            this.warnOnStructuralIssues(item);
            this.recomputeLabelAnchor(item);
            this.declutterConstellation(item, { animate: true, duration: 600 });
            setTimeout(() => {
                if (!this.selectedConstellation || this.selectedConstellation.id !== item.id) return;
                item.framing = this.computeConstellationFraming(item);
                this.animateCameraTo(item.framing.cameraPos, item.framing.centroid, 700, false);
            }, 620);
        }
    }

    /**
     * Single choke point for starting/joining an edit-session save.
     *
     * exitEditMode()'s commit branch is never awaited by ITS OWN callers
     * (handleBackAction(), transitionToFocusPhase() — neither is async), so
     * isEditMode flips back to false the instant exitEditMode starts, well
     * before the actual save finishes. That made destroy() (navigating away
     * entirely, e.g. the Home button) unreliable: it only checked isEditMode
     * to decide whether a commit was needed, so a commit already in flight
     * from an earlier "back" click looked like "nothing to save" and got
     * abandoned mid-request the moment the view tore down. Tracking the
     * in-flight promise directly — not a boolean anyone could have already
     * flipped — means destroy() can always find and await it, and a second
     * caller (e.g. destroy() firing moments after handleBackAction) joins
     * the same promise instead of starting a duplicate save.
     */
    flushEditSession(item, snapshot, pendingNewStarIds = this.pendingNewStarIds) {
        if (this.pendingCommitPromise) return this.pendingCommitPromise;
        this.pendingCommitPromise = this.commitEditSession(item, snapshot, pendingNewStarIds)
            .finally(() => { this.pendingCommitPromise = null; });
        return this.pendingCommitPromise;
    }

    /**
     * Syncs one just-committed edit session to the backend: creates any
     * stars added this session (temp `custom_star_...` ids — mitosis-created
     * ones are already real by commit time, see confirmMitosisSplits()),
     * remaps their temp ids to real ones everywhere, PATCHes changed titles,
     * DELETEs removed stars, then replaces the constellation's edge list.
     * Several separate HTTP calls, not one atomic transaction — see the
     * plan's §9 for why that's an accepted tradeoff for v1.
     *
     * `pendingNewStarIds` is an explicit parameter, NOT read off `this` —
     * exitEditMode() clears this.pendingNewStarIds synchronously before this
     * ever runs, so reading the instance property here would always see an
     * empty list. Callers must capture it before that reset (see
     * exitEditMode()'s pendingNewStarIdsForCommit).
     */
    async commitEditSession(item, snapshotAtSessionStart, pendingNewStarIds = this.pendingNewStarIds) {
        const idRemap = new Map();
        for (const tempId of pendingNewStarIds) {
            if (!tempId.startsWith('custom_star_')) continue;
            const entry = this.flatStarsArray.find(s => s.data.id === tempId);
            if (!entry) continue; // created then deleted within this same session — never hit the network
            const created = await starmapApi.createMilestone({
                title: entry.data.title,
                description: entry.data.description || '',
                constellation_id: item.id
            });
            idRemap.set(tempId, created.id);
        }
        if (idRemap.size > 0) this.applyIdRemap(item, idRemap);

        const entries = this.flatStarsArray.filter(s => s.constellationId === item.id);
        const currentById = new Map(entries.map(s => [s.data.id, s.data]));

        // Settle overlaps NOW (instant, deterministic — same function
        // exitEditMode's subsequent animated declutterConstellation() call
        // uses) so the positions saved below match what the view is about
        // to visually settle to, not raw mid-drag coordinates.
        const rawPositions = new Map(entries.map(s => [s.data.id, {
            x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z
        }]));
        const settled = entries.length >= 2
            ? declutterPositions(rawPositions, LAYOUT_DEFAULTS.minSeparation)
            : rawPositions;

        // Combined title + position PATCH per star, one call each rather
        // than a separate title-diff pass — DEC-013 amendment means
        // position is written every commit regardless of whether it
        // actually changed (idempotent, and simpler than diffing floats).
        const snapshotTitleById = new Map(
            (snapshotAtSessionStart?.titles || []).map(({ id, title }) => [idRemap.get(id) || id, title])
        );
        await Promise.all(entries.map((s) => {
            const pos = settled.get(s.data.id);
            const payload = { x: pos.x, y: pos.y, z: pos.z };
            const oldTitle = snapshotTitleById.get(s.data.id);
            if (oldTitle !== undefined && oldTitle !== s.data.title) payload.title = s.data.title;
            s.data.x = pos.x; s.data.y = pos.y; s.data.z = pos.z;
            return starmapApi.updateMilestone(s.data.id, payload);
        }));

        const snapshotIds = new Set((snapshotAtSessionStart?.titles || []).map(t => t.id));
        const deletedIds = [...snapshotIds].filter(id => !currentById.has(id) && !idRemap.has(id));
        await Promise.all(deletedIds.map(id => starmapApi.deleteMilestone(id)));

        const result = await starmapApi.replaceEdges(item.id, item.edges);
        item.edges = (result.edges || []).map(e => ({ from: e.from, to: e.to }));
    }

    /** Rewrites a temp star id to its real server id everywhere it's referenced. */
    applyIdRemap(constellationItem, idRemap) {
        this.localStarData.forEach((s) => {
            if (idRemap.has(s.id)) s.id = idRemap.get(s.id);
        });
        this.flatStarsArray.forEach((entry) => {
            if (idRemap.has(entry.data.id)) entry.data.id = idRemap.get(entry.data.id);
        });
        constellationItem.edges = constellationItem.edges.map(e => ({
            from: idRemap.get(e.from) || e.from,
            to: idRemap.get(e.to) || e.to
        }));
        this.pendingNewStarIds = this.pendingNewStarIds.map(id => idRemap.get(id) || id);
    }

    /**
     * Warn (never block) about structures that are probably accidental. A
     * disconnected star or a second entry point can be perfectly deliberate,
     * so this is advisory only.
     */
    warnOnStructuralIssues(constellationItem) {
        const nodeIds = this.starIdsFor(constellationItem.id);
        if (nodeIds.length < 2) return;
        const touched = new Set();
        constellationItem.edges.forEach((e) => { touched.add(e.from); touched.add(e.to); });
        const orphans = nodeIds.filter(id => !touched.has(id));
        if (orphans.length > 0) {
            this.showEditToast(`${orphans.length} star${orphans.length === 1 ? '' : 's'} not connected to the sequence`);
        }
    }

    /**
     * Rebuilds every star label for the current mode, and shows/hides each
     * star's standalone link handle to match.
     *
     * Sequence badges (1, 2, 3a, 3b...) are tied to being focused on a
     * constellation AT ALL, not to edit mode specifically — knowing where a
     * star sits in the sequence is useful just from looking at a
     * constellation, not only while actively rearranging it, and they used
     * to vanish the instant you left edit mode (or never appeared if you'd
     * never entered it) even though the star labels themselves stay up the
     * whole time you're focused on a constellation. Only the actual EDITING
     * affordances — drag styling/cursor, rename-on-double-click, the link
     * handle — are still gated on isEditMode; the link handle is a SEPARATE
     * element positioned at the star itself (tick()), not inside the label,
     * since dragging it is how you attach that star to another one and it
     * needs to read as belonging to the star, not the title.
     */
    refreshEditBadges() {
        const item = this.selectedConstellation;
        const entries = item
            ? this.flatStarsArray.filter(s => s.constellationId === item.id)
            : [];

        if (!item) {
            entries.forEach((s) => {
                s.label.classList.remove('has-badge', 'is-editing', 'is-new', 'is-drag-source');
                s.label.innerHTML = '';
                s.label.innerText = s.data.title;
                s.linkHandle.style.display = 'none';
                s.linkHandle.classList.remove('is-link-source', 'is-link-target');
            });
            return;
        }

        const editing = this.isEditMode;
        const badges = sequenceBadges(item.edges, entries.map(s => s.data.id));
        entries.forEach((s) => {
            const id = s.data.id;
            s.label.classList.add('has-badge');
            s.label.classList.toggle('is-editing', editing);
            s.label.classList.toggle('is-new', editing && this.pendingNewStarIds.includes(id));
            s.label.innerHTML = '';

            const badge = document.createElement('span');
            badge.className = 'star-seq-badge';
            badge.innerText = badges.get(id) ?? '·';

            const title = document.createElement('span');
            title.className = 'star-title';
            title.innerText = s.data.title;
            if (editing) {
                title.title = 'Double-click to rename';
                title.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    this.renameStar(id);
                });
            }

            s.label.appendChild(badge);
            s.label.appendChild(title);
            s.linkHandle.style.display = editing ? 'flex' : 'none';
        });
    }

    /** Double-click a star's title in edit mode → opens the rename card. */
    renameStar(starId) {
        const entry = this.flatStarsArray.find(s => s.data.id === starId);
        if (!entry) return;
        this.openQuickInput({
            title: 'RENAME STAR',
            initialValue: entry.data.title,
            onConfirm: (value) => {
                this.pushEditUndo();
                entry.data.title = value.toUpperCase();
                this.refreshEditBadges();
                this.updateDirectoryPanel();
            }
        });
    }

    /**
     * Generic single-field text input card — replaces window.prompt() for
     * every small text entry in the star map (rename, create star, add
     * step, evidence file name). Deliberately lighter than the
     * .modal-overlay pattern used for bigger choices (goal/constellation
     * confirmation): no dark scrim over the 3D scene, since these are
     * quick, low-stakes prompts, not decisions that warrant dimming
     * everything else to black.
     */
    openQuickInput({ title, placeholder = '', initialValue = '', onConfirm }) {
        this.quickInputCallback = onConfirm;
        const modal = document.getElementById('quick-input-modal');
        const titleEl = document.getElementById('quick-input-title');
        const input = document.getElementById('quick-input-field');
        if (titleEl) titleEl.innerText = title;
        if (input) {
            input.value = initialValue;
            input.placeholder = placeholder;
        }
        if (modal) modal.style.display = 'flex';
        // Next frame, so focus lands after the card has actually painted
        // rather than fighting the display:none -> flex transition.
        requestAnimationFrame(() => { input?.focus(); input?.select(); });
    }

    closeQuickInput() {
        this.closeModal('quick-input-modal');
        this.quickInputCallback = null;
    }

    confirmQuickInput() {
        const input = document.getElementById('quick-input-field');
        const value = input?.value.trim();
        const callback = this.quickInputCallback;
        this.closeQuickInput();
        if (!value || !callback) return;
        callback(value);
    }

    /**
     * Removes a star and heals the sequence around it, so deleting from the
     * middle of a chain joins its neighbours rather than severing the graph.
     */
    deleteStarInEdit(starId) {
        const item = this.selectedConstellation;
        if (!item) return;
        const entry = this.flatStarsArray.find(s => s.data.id === starId);
        if (!entry) return;
        if (!confirm(`Delete "${entry.data.title}"? Its steps are removed with it.`)) return;

        this.pushEditUndo();
        const next = spliceOutNode(item.edges, starId);
        this.removeStarMesh(starId);
        this.applyGraphChange(item, next);
        this.showEditToast('Star deleted');
    }

    /* ── Edit-mode pointer handling ─────────────────────────────────── */

    bindEditPointerEvents() {
        this.dragDownHandler = this.onEditPointerDown.bind(this);
        this.dragMoveHandler = this.onEditPointerMove.bind(this);
        this.dragUpHandler = this.onEditPointerUp.bind(this);
        this.editKeyHandler = this.onEditKeyDown.bind(this);

        this.renderer.domElement.addEventListener('pointerdown', this.dragDownHandler);
        window.addEventListener('pointermove', this.dragMoveHandler);
        window.addEventListener('pointerup', this.dragUpHandler);
        window.addEventListener('pointercancel', this.dragUpHandler);
        window.addEventListener('keydown', this.editKeyHandler);
    }

    onEditKeyDown(event) {
        if (!this.isEditMode) return;
        // Defense in depth alongside the rename input's own stopPropagation:
        // never let Delete/Ctrl+Z/etc. reach the graph while any text field
        // has focus, so typing a title can't accidentally delete a star.
        const tag = event.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;

        if (event.key === 'Escape') {
            // Cancels the in-flight drag only — not the whole session.
            if (this.drag || this.linkDrag) {
                event.preventDefault();
                this.cancelActiveDrag();
            }
            return;
        }
        const meta = event.ctrlKey || event.metaKey;
        if (meta && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            if (event.shiftKey) this.redoEdit(); else this.undoEdit();
        } else if (meta && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            this.redoEdit();
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            if (this.hoveredStarId) {
                event.preventDefault();
                this.deleteStarInEdit(this.hoveredStarId);
            }
        }
    }

    /** Screen point → normalized device coords, relative to the canvas. */
    setPointer(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
    }

    /** Star meshes of the focused constellation only. */
    editableStarEntries() {
        if (!this.selectedConstellation) return [];
        return this.flatStarsArray.filter(s => s.constellationId === this.selectedConstellation.id);
    }

    /**
     * Which star is under the pointer? Deliberately NOT a 3D raycast against
     * the gem geometry: the star's label sits almost directly on top of it
     * (labels are anchored at the star's own screen position), so a raycast
     * that only accepts a precise hit on the mesh mostly grabs the label's
     * pointer-events:auto DOM element instead, before the event ever reaches
     * the canvas. The fix is a generous invisible circle around the star's
     * PROJECTED screen position, evaluated in screen space, independent of
     * the label entirely — this is what "grabbable" means in edit mode, not
     * the title text.
     */
    pickStarAt(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const entries = this.editableStarEntries();
        if (entries.length === 0) return null;

        const worldPos = new THREE.Vector3();
        let best = null;
        entries.forEach((s) => {
            s.mesh.getWorldPosition(worldPos);
            const proj = worldPos.clone().project(this.camera);
            if (proj.z > 1 || proj.z < -1) return; // behind the camera or clipped
            const sx = (proj.x * 0.5 + 0.5) * rect.width;
            const sy = (-proj.y * 0.5 + 0.5) * rect.height;
            const dist = Math.hypot(sx - px, sy - py);
            if (dist <= STAR_GRAB_RADIUS_PX && (!best || dist < best.dist)) {
                best = { id: s.data.id, dist };
            }
        });
        return best ? best.id : null;
    }

    /** Which connector line is under the pointer? Used to unlink by clicking. */
    pickConnectorAt(event) {
        if (!this.selectedConstellation) return null;
        this.setPointer(event);
        const prev = this.raycaster.params.Line.threshold;
        // Lines are infinitely thin; without a generous pick threshold they
        // are effectively unclickable.
        this.raycaster.params.Line.threshold = 2.0;
        const hits = this.raycaster.intersectObjects(this.selectedConstellation.connectorLines || [], false);
        this.raycaster.params.Line.threshold = prev;
        return hits.length > 0 ? hits[0].object : null;
    }

    onEditPointerDown(event) {
        if (!this.isEditMode || event.button !== 0 || this.linkDrag) return;

        const starId = this.pickStarAt(event);
        if (starId) {
            this.beginStarDrag(starId, event);
            return;
        }

        // Not on a star — maybe on a connector, which unlinks it.
        const line = this.pickConnectorAt(event);
        if (line) {
            const { fromStarId, toStarId } = line.userData;
            this.pushEditUndo();
            const item = this.selectedConstellation;
            this.applyGraphChange(item,
                item.edges.filter(e => !(e.from === fromStarId && e.to === toStarId)));
            this.showEditToast('Link removed');
        }
        // Otherwise fall through: OrbitControls handles the drag as an orbit.
    }

    beginStarDrag(starId, event) {
        const item = this.selectedConstellation;
        const entry = this.flatStarsArray.find(s => s.data.id === starId);
        if (!item || !entry) return;

        const nodeIds = this.starIdsFor(item.id);
        let moveSet = dragMoveSet(item.edges, starId, nodeIds);
        // If a star dominates the entire constellation (it's the sole root),
        // moving everything gives nothing to reorder against — drag it alone.
        if (moveSet.size >= nodeIds.length) moveSet = new Set([starId]);

        // Drag across the plane facing the camera through the grabbed star:
        // whatever the current orbit, the star tracks the pointer exactly.
        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);
        const starWorld = entry.mesh.getWorldPosition(new THREE.Vector3());
        this.dragPlane.setFromNormalAndCoplanarPoint(camDir, starWorld);

        this.setPointer(event);
        const hitPoint = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this.dragPlane, hitPoint)) return;
        const localHit = item.group.worldToLocal(hitPoint.clone());

        this.drag = {
            starId,
            moveSet,
            grabOffset: localHit.clone().sub(entry.mesh.position),
            origins: new Map(
                [...moveSet].map((id) => {
                    const e = this.flatStarsArray.find(s => s.data.id === id);
                    return [id, e ? e.mesh.position.clone() : new THREE.Vector3()];
                })
            ),
            target: null,
            moved: false,
        };

        // Freeze the orbit only while a star is actually being dragged, so
        // the view can still be rotated freely elsewhere in edit mode.
        if (this.controls) this.controls.enabled = false;
        entry.label.classList.add('is-drag-source');
        this.editableStarEntries().forEach((s) => {
            s.mesh.userData.isHovered = moveSet.has(s.data.id);
        });
        this.renderer.domElement.style.cursor = 'grabbing';
    }

    onEditPointerMove(event) {
        if (!this.isEditMode) return;

        if (this.linkDrag) {
            this.linkDrag.hoverId = this.pickStarAt(event);
            this.highlightLinkTarget();
            return;
        }

        if (!this.drag) {
            // Idle hover: track for Delete, and preview what a drag would take
            // with it, so the move set is visible before committing to it.
            const hoverId = this.pickStarAt(event);
            if (hoverId !== this.hoveredStarId) {
                this.hoveredStarId = hoverId;
                this.previewMoveSet(hoverId);
                // The only visible sign of the invisible grab circle — hover
                // it and the cursor tells you it's grabbable.
                this.renderer.domElement.style.cursor = hoverId ? 'grab' : '';
            }
            return;
        }

        const item = this.selectedConstellation;
        this.setPointer(event);
        const hitPoint = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this.dragPlane, hitPoint)) return;

        const localHit = item.group.worldToLocal(hitPoint.clone());
        const desired = localHit.sub(this.drag.grabOffset);
        const delta = desired.clone().sub(this.drag.origins.get(this.drag.starId));
        // Low bar on purpose: now that an open-space drop just repositions
        // the star (rather than reverting), even a small intentional nudge
        // should register and stick, not require crossing some sizeable
        // distance first.
        if (delta.lengthSq() > 0.04) this.drag.moved = true;

        // The whole dominated set translates rigidly — a branch keeps its
        // shape relative to the star that owns it.
        this.drag.moveSet.forEach((id) => {
            const entry = this.flatStarsArray.find(s => s.data.id === id);
            if (entry) entry.mesh.position.copy(this.drag.origins.get(id)).add(delta);
        });

        this.drag.target = this.evaluateDropTarget(desired);
        this.previewDropTarget();
    }

    onEditPointerUp() {
        if (!this.isEditMode) return;
        if (this.linkDrag) { this.finishLinkDrag(); return; }
        if (!this.drag) return;

        const drag = this.drag;
        const item = this.selectedConstellation;
        this.drag = null;
        if (this.controls) this.controls.enabled = true;
        this.clearDropPreview();
        this.renderer.domElement.style.cursor = '';

        if (!drag.moved) {
            // Barely a click, not a drag — snap back so it doesn't push a
            // no-op undo entry.
            drag.origins.forEach((pos, id) => {
                const entry = this.flatStarsArray.find(s => s.data.id === id);
                if (entry) entry.mesh.position.copy(pos);
            });
            this.refreshConnectorGeometry(item);
            return;
        }

        if (!drag.target) {
            // Dropped in open space: this is a pure reposition, not a
            // structural change — manual placement means the star just
            // stays exactly where it was put, full stop. Landing near an
            // edge/star is what triggers a structural insert/branch instead;
            // missing both is not an error, it's the common case.
            this.pushEditUndo();
            this.declutterConstellation(item);
            if (!this.layoutTween) {
                // Declutter found nothing to move (the usual case) — the
                // dragged star's own new position still needs its connector
                // lines refreshed, since nothing else will. If declutter DID
                // start an animated tween, tick()'s updateLayoutTween()
                // already keeps lines in sync every frame; refreshing here
                // too would make them jump ahead of the animating stars.
                this.refreshConnectorGeometry(item);
            }
            this.showEditToast('Repositioned');
            return;
        }

        this.pushEditUndo();
        const next = this.buildEdgesForDrop(drag);
        if (!next) {
            drag.origins.forEach((pos, id) => {
                const entry = this.flatStarsArray.find(s => s.data.id === id);
                if (entry) entry.mesh.position.copy(pos);
            });
            this.refreshConnectorGeometry(item);
            this.editUndoStack.pop();
            this.showEditToast('That would create a loop');
            return;
        }
        this.applyGraphChange(item, next);
        this.showEditToast(drag.target.kind === 'edge' ? 'Inserted into sequence' : 'Branched');
    }

    cancelActiveDrag() {
        if (this.linkDrag) {
            this.linkDrag = null;
            this.highlightLinkTarget();
            this.showEditToast('Link cancelled');
            return;
        }
        if (!this.drag) return;
        this.drag.origins.forEach((pos, id) => {
            const entry = this.flatStarsArray.find(s => s.data.id === id);
            if (entry) entry.mesh.position.copy(pos);
        });
        const item = this.selectedConstellation;
        this.drag = null;
        if (this.controls) this.controls.enabled = true;
        this.clearDropPreview();
        this.refreshConnectorGeometry(item);
        this.renderer.domElement.style.cursor = '';
        this.showEditToast('Drag cancelled');
    }

    /**
     * What does dropping here mean? Near the middle of a connector → insert
     * into that link. Near a star → branch off it. Anywhere else → nothing,
     * and the drag reverts.
     */
    evaluateDropTarget(pos) {
        const item = this.selectedConstellation;
        if (!item || !this.drag) return null;
        const moveSet = this.drag.moveSet;
        // Proportional to the layout's own spacing, not a fixed literal —
        // these used to be tuned for the old ~18-22 unit spine spacing, and
        // stayed that small even after the layout spread stars much farther
        // apart, so almost every drop landed outside both radii and reported
        // "dropped in open space" even for an intentional, well-aimed drag.
        const EDGE_INSERT_RADIUS = LAYOUT_DEFAULTS.edgeLength * 0.6;
        const NODE_ATTACH_RADIUS = LAYOUT_DEFAULTS.edgeLength * 0.55;

        const posOf = new Map(
            this.editableStarEntries().map(s => [s.data.id, s.mesh.position])
        );

        // Nearest connector, measured against its middle stretch only — near
        // an endpoint the user means the star, not the link.
        let bestEdge = null;
        item.edges.forEach((edge) => {
            if (moveSet.has(edge.from) || moveSet.has(edge.to)) return;
            const a = posOf.get(edge.from);
            const b = posOf.get(edge.to);
            if (!a || !b) return;
            const ab = b.clone().sub(a);
            const lenSq = ab.lengthSq() || 1e-6;
            const t = pos.clone().sub(a).dot(ab) / lenSq;
            if (t < 0.2 || t > 0.8) return;
            const closest = a.clone().add(ab.multiplyScalar(t));
            const dist = closest.distanceTo(pos);
            if (dist < EDGE_INSERT_RADIUS && (!bestEdge || dist < bestEdge.dist)) {
                bestEdge = { kind: 'edge', edge, dist };
            }
        });

        let bestNode = null;
        posOf.forEach((p, id) => {
            if (moveSet.has(id)) return;
            const dist = p.distanceTo(pos);
            if (dist < NODE_ATTACH_RADIUS && (!bestNode || dist < bestNode.dist)) {
                bestNode = { kind: 'node', nodeId: id, dist };
            }
        });

        if (bestEdge && bestNode) return bestEdge.dist <= bestNode.dist ? bestEdge : bestNode;
        return bestEdge || bestNode;
    }

    /**
     * Turn a completed drag into the next edge list. Returns null if the
     * result would contain a cycle, in which case the drop is rejected.
     *
     * The dragged star first leaves its old slot: edges joining it to stars
     * OUTSIDE the move set are dropped, and its former predecessors are
     * bridged to its former successors so pulling a star out of the middle of
     * a chain closes the gap instead of severing it. Edges inside the move
     * set are kept — a branch travels intact with the star that owns it.
     */
    buildEdgesForDrop(drag) {
        const item = this.selectedConstellation;
        const { moveSet, starId, target } = drag;

        // Leave the old slot first, healing the gap behind it.
        const detached = spliceOutNode(item.edges, starId, moveSet);

        if (target.kind === 'edge') {
            // The insertion edge may have been healed away (it can't be — its
            // endpoints are outside the move set — but guard anyway).
            const stillThere = detached.some(
                e => e.from === target.edge.from && e.to === target.edge.to);
            const base = stillThere
                ? detached.filter(e => !(e.from === target.edge.from && e.to === target.edge.to))
                : detached;
            if (wouldCreateCycle(base, target.edge.from, starId)) return null;
            if (wouldCreateCycle([...base, { from: target.edge.from, to: starId }], starId, target.edge.to)) return null;
            return insertIntoEdge(detached, target.edge, starId);
        }

        if (wouldCreateCycle(detached, target.nodeId, starId)) return null;
        return normalizeEdges([...detached, { from: target.nodeId, to: starId }]);
    }

    /* ── Edit-mode visual feedback ──────────────────────────────────── */

    previewMoveSet(hoverId) {
        if (this.drag) return;
        const item = this.selectedConstellation;
        if (!item) return;
        const set = hoverId
            ? dragMoveSet(item.edges, hoverId, this.starIdsFor(item.id))
            : new Set();
        this.editableStarEntries().forEach((s) => {
            s.mesh.userData.isHovered = set.has(s.data.id);
        });
    }

    previewDropTarget() {
        const item = this.selectedConstellation;
        if (!item) return;
        const target = this.drag?.target;
        (item.connectorLines || []).forEach((line) => {
            const isTarget = target?.kind === 'edge'
                && line.userData.fromStarId === target.edge.from
                && line.userData.toStarId === target.edge.to;
            const base = line.userData.baseOpacity ?? line.material.opacity;
            line.material.opacity = isTarget ? 1 : base;
        });
        this.editableStarEntries().forEach((s) => {
            s.label.classList.toggle('is-drop-target',
                target?.kind === 'node' && target.nodeId === s.data.id);
        });
    }

    clearDropPreview() {
        const item = this.selectedConstellation;
        if (!item) return;
        (item.connectorLines || []).forEach((line) => {
            if (line.userData.baseOpacity !== undefined) {
                line.material.opacity = line.userData.baseOpacity;
            }
        });
        this.editableStarEntries().forEach((s) => {
            s.label.classList.remove('is-drop-target', 'is-drag-source');
            s.linkHandle.classList.remove('is-link-source', 'is-link-target');
            s.mesh.userData.isHovered = false;
        });
    }

    /* ── Link handle (explicit merges) ──────────────────────────────── */

    /**
     * Merges are authored, not inferred: proximity can't reliably distinguish
     * "branch here" from "rejoin the trunk here", so rejoining is done by
     * dragging from a star's link handle onto the star it should feed into.
     */
    beginLinkDrag(fromId) {
        if (!this.isEditMode) return;
        this.linkDrag = { fromId, hoverId: null };
        if (this.controls) this.controls.enabled = false;
        this.highlightLinkTarget();
        this.showEditToast('Drop on another star to link');
    }

    highlightLinkTarget() {
        this.editableStarEntries().forEach((s) => {
            const isSource = this.linkDrag?.fromId === s.data.id;
            const isTarget = !!this.linkDrag
                && this.linkDrag.hoverId === s.data.id
                && this.linkDrag.fromId !== s.data.id;
            // Highlighted on the star's own handle (the drag origin/target),
            // not the title — the link is between stars, not labels.
            s.linkHandle.classList.toggle('is-link-source', isSource);
            s.linkHandle.classList.toggle('is-link-target', isTarget);
        });
    }

    finishLinkDrag() {
        const link = this.linkDrag;
        this.linkDrag = null;
        if (this.controls) this.controls.enabled = true;
        this.highlightLinkTarget();
        if (!link || !link.hoverId || link.hoverId === link.fromId) return;

        const item = this.selectedConstellation;
        if (item.edges.some(e => e.from === link.fromId && e.to === link.hoverId)) {
            this.showEditToast('Already linked');
            return;
        }
        if (wouldCreateCycle(item.edges, link.fromId, link.hoverId)) {
            this.showEditToast('That would create a loop');
            return;
        }
        this.pushEditUndo();
        this.applyGraphChange(item, [...item.edges, { from: link.fromId, to: link.hoverId }]);
        this.showEditToast('Linked');
    }

    confirmLoopItem() {
        const config = this.localConstellationConfig[this.confirmationLoopIndex];
        const ownStars = this.localStarData.filter(s => s.constellationId === config.id);
        // Padding only ever matters for a constellation with zero seeded
        // stars — the mock walkthrough's own CONSTELLATION_CONFIG entries
        // always have matching STAR_DATA, so this only actually fires for
        // an ad-hoc constellation just created via confirmCreateConstellation().
        // Real accounts keep that genuinely empty; only the mock/dev-bypass
        // demo path gets 4 fake placeholder stars.
        this.spawnConstellationMeshes(config, ownStars, null, { padPlaceholders: !this.usingRealBackend });

        this.closeModal('confirm-modal');
        this.confirmationLoopIndex++;
        this.executeConfirmationLoopStep();
    }

    /**
     * Builds one constellation's full 3D representation (star meshes, spoke
     * line, label, layout) and registers it — shared by the interactive
     * onboarding walkthrough (confirmLoopItem, above) and by real-data
     * rendering (renderExistingStarMap, confirmCreateConstellation) so a
     * server-persisted constellation looks identical to a freshly-confirmed
     * mock one.
     *
     * @param {Object} config              constellation config (id, name, angle_deg, radius, tilt_deg, hint)
     * @param {Array}  ownStars            this constellation's star data objects (may be empty)
     * @param {Array|null} persistedEdges  edge list to use verbatim if given and non-empty; otherwise a linear chain is seeded
     * @param {{padPlaceholders?: boolean, animateLayout?: boolean}} options
     * @returns {Object} the constellationNodesArray entry just created
     */
    spawnConstellationMeshes(config, ownStars, persistedEdges, options = {}) {
        const { padPlaceholders = false, animateLayout = false } = options;

        const group = new THREE.Group();
        group.position.copy(constellationPos(config));

        const countOfStars = ownStars.length > 0 ? ownStars.length : (padPlaceholders ? 4 : 0);
        const starMeshesList = [];
        const labelsContainer = document.getElementById('labels-container');

        for (let i = 0; i < countOfStars; i++) {
            // Placeholder position — layoutConstellation() below computes the
            // constellation's real shape for every star at once, via the
            // same force-directed layout used everywhere else (DEC-013).
            const localPos = new THREE.Vector3(0, 0, 0);

            let dataObj = ownStars[i];
            if (!dataObj) {
                dataObj = {
                    id: `custom_node_${config.id}_${i}`,
                    constellationId: config.id,
                    title: 'STAR OBJECTIVE ' + (i + 1),
                    description: '',
                    status: 'pending',
                    planets: [{ label: 'Calibrate base requirements', done: false, order: 1 }],
                    evidence: []
                };
                this.localStarData.push(dataObj);
            }

            const outerMesh = this.spawnStarMesh(dataObj, localPos, { id: config.id, group });
            starMeshesList.push(outerMesh);
        }

        // `edges` is the single source of sequence truth from here on
        // (DEC-013); `connectorLines` is only ever rebuilt FROM it, never
        // authored directly. A persisted edge list (a real, already-arranged
        // constellation) is used verbatim; otherwise seed a linear chain.
        const starIds = starMeshesList.map(m => this.flatStarsArray.find(s => s.mesh === m).data.id);
        const edges = (persistedEdges && persistedEdges.length > 0) ? persistedEdges : chainEdges(starIds);

        // Spoke line back to the North Star — gives the sky an at-a-glance
        // hierarchy (which constellations connect to the goal, and how far
        // along each one is) instead of leaving constellations as disconnected
        // clusters floating in space. Brightness tracks this constellation's
        // completion %. Added to `group` (in group-local space, since `group`
        // itself is offset to the constellation's world position) so it
        // dims/restores together with the rest of the constellation.
        const spokeLineGeo = new THREE.BufferGeometry().setFromPoints([
            constellationPos(config).negate(), // North Star, in this group's local space
            new THREE.Vector3(0, 0, 0)         // this constellation's own center
        ]);
        const spokeLineMat = new THREE.LineDashedMaterial({
            color: 0xffcf70,
            transparent: true,
            dashSize: 2,
            gapSize: 3,
            depthWrite: false
        });
        const spokeLine = new THREE.Line(spokeLineGeo, spokeLineMat);
        spokeLine.computeLineDistances();
        spokeLine.renderOrder = 15;
        group.add(spokeLine);

        const itemNode = {
            id: config.id,
            config: config,
            group: group,
            label: null,
            edges,                  // ← the structure; everything else derives from it
            connectorLines: [],     // ← positioned + rebuilt by layoutConstellation() just below
            spokeLine,
            // Sky-label anchor, in this group's local space. Starts at the
            // group's own origin (the polar point it was created at) and is
            // only re-centred on the stars' actual centroid once a real edit
            // session locks in (see recomputeLabelAnchor) — not on every
            // drag, only on LOCK IN, per the user's request.
            labelAnchorLocal: new THREE.Vector3(0, 0, 0)
        };
        // A brand-new/never-before-arranged constellation has no existing
        // arrangement to preserve, so this is the one case that still uses
        // the full procedural layout — everywhere else (edits to an
        // existing constellation) only places new stars and declutters
        // overlaps.
        this.layoutConstellation(itemNode, { animate: animateLayout });
        // Star x/y/z already persist server-side (DEC-013 amendment), so
        // recomputing the anchor here — every time a constellation's meshes
        // are (re)built, e.g. on return from the main menu — reproduces
        // whatever centroid the last LOCK IN left it at, with no separate
        // "label position" field needing to persist on its own.
        this.recomputeLabelAnchor(itemNode);

        const lbl = document.createElement('div');
        lbl.className = 'node-label';
        lbl.style.border = '1px solid rgba(168, 230, 255, 0.3)';
        lbl.style.background = 'rgba(2, 8, 20, 0.9)';
        lbl.style.padding = '4px 10px';
        lbl.style.borderRadius = '4px';
        lbl.style.display = 'none';
        lbl.innerText = config.name;
        if (labelsContainer) labelsContainer.appendChild(lbl);

        lbl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.transitionToFocusPhase(itemNode);
        });
        lbl.addEventListener('mouseenter', () => this.setConstellationHover(config.id, true));
        lbl.addEventListener('mouseleave', () => this.setConstellationHover(config.id, false));

        itemNode.label = lbl;
        this.constellationNodesArray.push(itemNode);
        this.constellationsGroup.add(group);

        // Paints connector/spoke line colors and the label's completion state.
        this.refreshConstellationVisuals(config.id);

        return itemNode;
    }

    /**
     * Hovering a constellation (its sky label or its directory row — either
     * triggers the same response) lights up every star in it, their
     * connecting/spoke lines, and both the label and directory row, so the
     * whole constellation reads as "glowing more" together.
     */
    setConstellationHover(constellationId, isHovering) {
        const item = this.constellationNodesArray.find(c => c.id === constellationId);
        if (!item) return;

        // Reuses the same per-star hover boost (glow intensity + ring spin)
        // that tick() already applies for an individually-hovered star.
        this.flatStarsArray
            .filter(s => s.constellationId === constellationId)
            .forEach((s) => { s.mesh.userData.isHovered = isHovering; });

        // Lines don't animate per-frame, so their hover boost is applied
        // directly here rather than through tick().
        const hoverLines = [...(item.connectorLines || []), item.spokeLine].filter(Boolean);
        hoverLines.forEach((line) => {
            const base = line.userData.baseOpacity ?? line.material.opacity;
            line.material.opacity = isHovering ? Math.min(base * 1.6, 1) : base;
        });

        if (item.label) item.label.classList.toggle('is-hovered', isHovering);
        if (item.directoryRow) item.directoryRow.classList.toggle('directory-row-hovered', isHovering);
    }

    /**
     * Completion state of a constellation, per STARMAP_SPEC.md §3.
     * Mirrors the mobile app's computation in
     * frontend/features/starmap/components/FullSkyView.tsx:49-53.
     */
    constellationStatus(constellationId) {
        const stars = this.flatStarsArray.filter(s => s.constellationId === constellationId);
        if (stars.length === 0) return 'incomplete';
        const approved = stars.filter(s => s.data.status === 'approved').length;
        if (approved === stars.length) return 'complete';
        if (approved > 0) return 'in_progress';
        return 'incomplete';
    }

    /**
     * Recomputes everything about a constellation that depends on its stars'
     * statuses: connector lit state, spoke-line completion brightness, and the
     * label's complete/in-progress/incomplete treatment (spec §3, §4).
     * Safe to call repeatedly — always derives from current state.
     */
    refreshConstellationVisuals(constellationId) {
        const item = this.constellationNodesArray.find(c => c.id === constellationId);
        if (!item) return;

        const statusOf = (starId) =>
            this.flatStarsArray.find(s => s.data.id === starId)?.data.status;

        (item.connectorLines || []).forEach((line) => {
            const isLit = statusOf(line.userData.fromStarId) === 'approved'
                && statusOf(line.userData.toStarId) === 'approved';
            const opacity = isLit ? 0.95 : 0.8;
            line.material.color.setHex(isLit ? 0x9fe0ff : 0xb9cdf5);
            line.material.opacity = opacity;
            line.userData.baseOpacity = opacity;
        });

        const stars = this.flatStarsArray.filter(s => s.constellationId === constellationId);
        const approved = stars.filter(s => s.data.status === 'approved').length;
        const completion = stars.length > 0 ? approved / stars.length : 0;
        if (item.spokeLine) {
            const spokeOpacity = 0.55 + completion * 0.4;
            item.spokeLine.material.opacity = spokeOpacity;
            item.spokeLine.userData.baseOpacity = spokeOpacity;
        }

        // Spec §3 constellation appearance: complete → white glow,
        // in progress → cyan accent, incomplete → dim/muted.
        if (item.label) {
            const state = this.constellationStatus(constellationId);
            item.label.classList.remove('is-complete', 'is-in-progress', 'is-incomplete');
            item.label.classList.add(
                state === 'complete' ? 'is-complete'
                    : state === 'in_progress' ? 'is-in-progress'
                        : 'is-incomplete'
            );
        }
    }

    dismissLoopItem() {
        this.closeModal('confirm-modal');
        this.confirmationLoopIndex++;
        this.executeConfirmationLoopStep();
    }

    updateDirectoryPanel() {
        const dirPanel = document.getElementById('directory-panel');
        const dirList = document.getElementById('directory-list');
        const dirSummary = document.getElementById('directory-summary');
        if (!dirPanel || !dirList) return;

        dirList.innerHTML = '';
        let visibleCount = 0;
        let totalStars = 0;
        let totalApproved = 0;

        this.constellationNodesArray.forEach((item) => {
            visibleCount++;

            const stars = this.flatStarsArray.filter(s => s.constellationId === item.id);
            const approved = stars.filter(s => s.data.status === 'approved').length;
            const pct = stars.length > 0 ? Math.round((approved / stars.length) * 100) : 0;
            totalStars += stars.length;
            totalApproved += approved;

            const isSelected = this.currentPhase === PHASE.CONST_FOCUS && this.selectedConstellation?.id === item.id;

            const div = document.createElement('div');
            div.className = `p-2 rounded cursor-pointer transition-colors border ${
                isSelected
                    ? 'bg-cyan-400/10 border-cyan-400/40 text-cyan-200'
                    : 'text-slate-300 border-transparent hover:bg-white/[0.04] hover:text-cyan-300 hover:border-white/5'
            }`;
            div.innerHTML = `
                <div class="flex items-center justify-between gap-2 mb-1">
                    <span>${isSelected ? '▸' : '•'} ${item.config.name}</span>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-slate-500">${approved}/${stars.length}</span>
                        <button class="directory-delete-btn text-slate-600 hover:text-red-400 leading-none" title="Delete constellation">&#10005;</button>
                    </div>
                </div>
                <div class="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div class="h-full rounded-full bg-amber-400/80" style="width: ${pct}%"></div>
                </div>
            `;
            div.addEventListener('click', () => {
                this.transitionToFocusPhase(item);
            });
            div.addEventListener('mouseenter', () => this.setConstellationHover(item.id, true));
            div.addEventListener('mouseleave', () => this.setConstellationHover(item.id, false));
            div.querySelector('.directory-delete-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteConstellation(item);
            });
            item.directoryRow = div;
            dirList.appendChild(div);
        });

        if (dirSummary) {
            dirSummary.innerText = totalStars > 0
                ? `${totalApproved} / ${totalStars} STARS COMPLETE`
                : '';
        }

        if (visibleCount > 0 && (this.currentPhase === PHASE.FULL_SKY || this.currentPhase === PHASE.CONST_FOCUS)) {
            dirPanel.style.display = 'block';
        } else {
            dirPanel.style.display = 'none';
        }
    }

    /** Directory panel's delete button — confirms, deletes server-side (if real), then tears down locally. */
    async deleteConstellation(item) {
        if (!confirm(`Delete "${item.config.name}" and all its stars? This cannot be undone.`)) return;

        if (this.usingRealBackend) {
            try {
                await starmapApi.deleteConstellation(item.id);
            } catch (err) {
                console.error('[StarMapView] Failed to delete constellation:', err);
                this.showEditToast('Failed to delete — try again');
                return;
            }
        }

        this.teardownConstellation(item);
        this.updateDirectoryPanel();
    }

    /**
     * Disposes every mesh under a constellation (stars, rings, glow sprites,
     * connector/spoke lines — all children of item.group, so one traversal
     * covers everything), removes its DOM labels/link handles, and strips
     * it from every local array. Deselects it first if it was focused/open.
     */
    teardownConstellation(item) {
        item.group.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((m) => m.dispose());
            }
        });
        this.constellationsGroup.remove(item.group);
        item.label?.remove();

        this.flatStarsArray
            .filter(s => s.constellationId === item.id)
            .forEach((entry) => {
                entry.label.remove();
                entry.linkHandle?.remove();
            });

        this.flatStarsArray = this.flatStarsArray.filter(s => s.constellationId !== item.id);
        this.localStarData = this.localStarData.filter(s => s.constellationId !== item.id);
        this.constellationNodesArray = this.constellationNodesArray.filter(c => c.id !== item.id);

        if (this.selectedConstellation?.id === item.id) {
            this.selectedConstellation = null;
            this.closeStarDetailPanel();
            if (this.currentPhase === PHASE.CONST_FOCUS) this.currentPhase = PHASE.FULL_SKY;
        }
    }

    /**
     * De-emphasizes (factor<1) or restores (factor=1) every mesh under a
     * constellation group. Custom ShaderMaterials (the gem core, the glow
     * halo) don't honor material.opacity the way built-in materials do, so
     * this drives their dedicated uniforms directly instead.
     */
    setNodeEmphasis(threeGroup, factor) {
        threeGroup.traverse((child) => {
            const mat = child.material;
            if (!mat) return;

            if (mat.uniforms?.uOpacity !== undefined) {
                mat.uniforms.uOpacity.value = factor;
            } else if (child.isSprite) {
                // Glow sprites (star + North Star halos) — scale relative to
                // their resting intensity, same pattern as the rings below.
                const base = child.parent?.userData?.baseGlowIntensity ?? 0.45;
                mat.opacity = base * factor;
            } else if (child.userData.baseOpacity !== undefined) {
                // Rings and dashed lines both carry their intended resting
                // opacity in userData, so de-emphasis/restoration scales
                // relative to it instead of overwriting to a flat value that
                // would erase e.g. the lit/unlit or completion-based distinction.
                mat.transparent = true;
                mat.opacity = child.userData.baseOpacity * factor;
            } else {
                mat.transparent = true;
                mat.opacity = factor;
            }
        });
    }

    /**
     * Computes a camera position/direction that fits an ENTIRE constellation's
     * stars on screen, viewed from an angle chosen to avoid foreshortening.
     *
     * The old approach just flew to a fixed distance along the direction from
     * the origin to the constellation's nominal position — it never looked at
     * the star layout at all, so depending on how that layout happened to be
     * oriented relative to that one fixed direction, stars could end up
     * bunched together (viewed nearly edge-on) or spilling off-frame.
     *
     * This instead:
     *  1. Finds the constellation's actual star positions and their centroid.
     *  2. Computes their 3x3 covariance matrix and its dominant eigenvector
     *     (the axis of greatest spread) via power iteration — a standard,
     *     simple way to find a point cloud's principal axis without a full
     *     eigendecomposition.
     *  3. Picks a viewing direction perpendicular to that axis (so the
     *     greatest spread lands on the screen plane, not foreshortened into
     *     depth), biased to still read as "outward from the North Star" for
     *     visual consistency with the spoke-line layout.
     *  4. Computes the minimum distance — from the camera's actual FOV/aspect
     *     — needed to fit the star cluster's bounding sphere fully in frame,
     *     using whichever of the horizontal/vertical FOV is more restrictive.
     */
    computeConstellationFraming(constellationItem) {
        const stars = this.flatStarsArray.filter(s => s.constellationId === constellationItem.id);

        if (stars.length === 0) {
            const centroid = constellationPos(constellationItem.config);
            const viewDir = centroid.clone().normalize().negate();
            return { centroid, viewDir, distance: 55, cameraPos: centroid.clone().sub(viewDir.clone().multiplyScalar(55)) };
        }

        const positions = stars.map((s) => {
            const p = new THREE.Vector3();
            s.mesh.getWorldPosition(p);
            return p;
        });

        const centroid = new THREE.Vector3();
        positions.forEach((p) => centroid.add(p));
        centroid.divideScalar(positions.length);

        // Look along whichever direction the star cloud is FLATTEST — that's
        // what puts both of its meaningfully-spread axes on screen at once.
        // (Aiming perpendicular to only the single most-spread axis, the
        // previous approach, can still collapse the second axis into depth
        // if it happens to point roughly where the camera is looking —
        // exactly the "everything lines up" complaint.) Biased toward
        // outward-from-North-Star when the shape itself doesn't force a
        // particular choice.
        const outward = centroid.clone().normalize();
        const plainPoints = positions.map(p => ({ x: p.x, y: p.y, z: p.z }));
        const axisPlain = bestViewAxis(
            plainPoints,
            { x: centroid.x, y: centroid.y, z: centroid.z },
            { x: outward.x, y: outward.y, z: outward.z }
        );
        let viewDir = new THREE.Vector3(axisPlain.x, axisPlain.y, axisPlain.z);
        if (viewDir.lengthSq() < 1e-6) viewDir = outward.clone();
        viewDir.normalize();

        // Nudge away from a near-vertical viewing direction — camera.lookAt()'s
        // up-vector math gets unstable close to straight up/down.
        if (Math.abs(viewDir.dot(new THREE.Vector3(0, 1, 0))) > 0.97) {
            viewDir.x += 0.2;
            viewDir.normalize();
        }

        let boundingRadius = 0;
        positions.forEach((p) => {
            boundingRadius = Math.max(boundingRadius, p.distanceTo(centroid));
        });
        boundingRadius += 6; // headroom for each star's own glow halo / label

        const fovV = THREE.MathUtils.degToRad(this.camera.fov);
        const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
        const halfFovMin = Math.min(fovV, fovH) / 2;
        const padding = 1.25; // extra margin so stars aren't right at the frame edge
        let distance = (boundingRadius / Math.sin(halfFovMin)) * padding;
        distance = Math.max(distance, (this.controls?.minDistance ?? 15) + 5);

        const cameraPos = centroid.clone().sub(viewDir.clone().multiplyScalar(distance));

        return { centroid, viewDir, distance, cameraPos };
    }

    transitionToFocusPhase(constellationItem) {
        // Leaving one constellation for another commits whatever was being
        // edited, rather than silently discarding it or leaking edit state
        // across constellations.
        if (this.isEditMode && this.selectedConstellation !== constellationItem) {
            this.exitEditMode({ commit: true });
        }
        this.currentPhase = PHASE.CONST_FOCUS;
        this.selectedConstellation = constellationItem;
        this.lastActiveConstellationId = constellationItem.id;
        this.closeStarDetailPanel();
        this.updateCreateButtonLabel();

        const framing = this.computeConstellationFraming(constellationItem);
        constellationItem.framing = framing; // reused by focusOnStar for a consistent angle
        this.animateCameraTo(framing.cameraPos, framing.centroid, 1200, false);

        this.constellationNodesArray.forEach((node) => {
            if (node.id === constellationItem.id) {
                if (node.label) node.label.style.opacity = '1';
                this.setNodeEmphasis(node.group, 1.0);
            } else {
                // Spec §3: non-focused constellations soft-fade to ~20% opacity.
                if (node.label) node.label.style.opacity = String(NON_FOCUSED_OPACITY);
                this.setNodeEmphasis(node.group, NON_FOCUSED_OPACITY);
            }
        });

        this.flatStarsArray.forEach((star) => {
            if (star.constellationId === constellationItem.id) {
                star.label.style.display = 'block';
                star.label.style.opacity = '1';
            } else {
                star.label.style.display = 'none';
            }
        });

        const backBtn = document.getElementById('back-btn');
        if (backBtn) backBtn.style.display = 'block';
        this.updateDirectoryPanel();
        // Sequence badges (1, 2, 3a, 3b...) belong to being focused on a
        // constellation at all, not to edit mode specifically — refreshed
        // here so they show up the moment you focus one, not only once you
        // start editing it.
        this.refreshEditBadges();
    }

    handleBackAction() {
        // Backing out of a constellation commits the edit session — the graph
        // is already live, so discarding here would be the surprising choice.
        if (this.isEditMode) this.exitEditMode({ commit: true });
        this.currentPhase = PHASE.FULL_SKY;
        this.selectedConstellation = null;
        this.closeStarDetailPanel();
        this.updateCreateButtonLabel();

        // Hide the Zoom 0 HUD directly rather than via closeNorthStarScreen(),
        // which calls back into this method.
        this.hideNorthStarScreen();

        this.animateCameraTo(new THREE.Vector3(0, 20, 140), new THREE.Vector3(0, 0, 0), 1200, true);

        this.constellationNodesArray.forEach((node) => {
            if (node.label) node.label.style.opacity = '1';
            this.setNodeEmphasis(node.group, 1.0);
        });

        this.flatStarsArray.forEach(star => star.label.style.display = 'none');
        const backBtn = document.getElementById('back-btn');
        if (backBtn) backBtn.style.display = 'none';
        this.updateDirectoryPanel();
        // selectedConstellation is now null — clears any leftover badge
        // markup back to plain titles rather than leaving it stale in the
        // (hidden) label DOM until the constellation is focused again.
        this.refreshEditBadges();
    }

    openStarDetailPanel(starData) {
        // While restructuring, a click on a star means "grab it", not "open
        // it" — the panel would cover the constellation being rearranged.
        if (this.isEditMode) return;
        this.selectedStarData = starData;
        const panel = document.getElementById('star-detail-panel');
        const badge = document.getElementById('star-status');
        const title = document.getElementById('star-title');

        const colors = COLOUR_MAP[starData.status] || COLOUR_MAP.pending;
        const isApproved = starData.status === 'approved';
        // A submitted star is awaiting admin validation — the user can't edit
        // or re-submit it, so it's read-only here too (but not yet "completed").
        const isLocked = isApproved || starData.status === 'submitted';

        // Spec §5: a completed star is prefixed with a star glyph.
        if (title) title.innerText = isApproved ? `★ ${starData.title}` : starData.title;
        if (badge) {
            badge.innerText = starData.status;
            badge.className = `inline-block px-2 py-0.5 mt-2 rounded text-[10px] font-hud uppercase tracking-wider font-bold ${colors.tailwindBg}`;
        }

        const descEl = document.getElementById('star-description');
        if (descEl) {
            descEl.innerText = starData.description || '';
            descEl.style.display = starData.description ? 'block' : 'none';
        }

        // Completed-star summary: completion date + LUX earned (spec §5).
        const completedBlock = document.getElementById('star-completed-block');
        if (completedBlock) {
            completedBlock.style.display = isApproved ? 'block' : 'none';
            if (isApproved) {
                const dateEl = document.getElementById('star-completed-date');
                const luxEl = document.getElementById('star-lux-earned');
                if (dateEl) dateEl.innerText = starData.completedDate || '—';
                if (luxEl) luxEl.innerText = `+${starData.lux ?? 0} LUX earned`;
            }
        }

        // Spec §5: planets are archived (read-only) once the star is approved.
        const planetsHeading = document.getElementById('planets-heading');
        if (planetsHeading) planetsHeading.innerText = isApproved ? 'Planets (archived)' : 'Required Steps';

        // Editing affordances are hidden once the star is locked.
        const colorSection = document.getElementById('sigil-color-section');
        if (colorSection) colorSection.style.display = isLocked ? 'none' : 'block';
        const addEvidenceBtn = document.getElementById('add-evidence-btn');
        if (addEvidenceBtn) addEvidenceBtn.style.display = isLocked ? 'none' : 'block';
        const submitBtn = document.getElementById('submit-validation-btn');
        if (submitBtn) submitBtn.style.display = isLocked ? 'none' : 'block';
        const evidenceHeading = document.getElementById('evidence-heading');
        if (evidenceHeading) evidenceHeading.innerText = isLocked ? 'Evidence submitted' : 'Evidence';

        // Spec §7: mitosis is offered on any non-approved star that has at
        // least one incomplete step to split off (nothing to promote otherwise).
        const hasSplittableStep = (starData.planets || []).some(p => !p.done);
        const aiSplitBtn = document.getElementById('ai-split-btn');
        if (aiSplitBtn) aiSplitBtn.style.display = (isApproved || !hasSplittableStep) ? 'none' : 'block';
        this.closeMitosisPanel();

        this.renderPlanetsChecklist();
        this.renderEvidenceFiles();
        this.evaluateValidationButtonState();
        this.syncColorPicker(starData);
        this.focusOnStar(starData);
        this.buildPlanetOrbits(starData);

        if (panel) panel.classList.add('open');
    }

    /** Reflects a star's current effective color (custom or status-derived) into the color picker input. */
    syncColorPicker(starData) {
        const picker = document.getElementById('star-color-picker');
        if (!picker) return;
        const baseHex = computeStarBaseColor(starData);
        picker.value = `#${baseHex.toString(16).padStart(6, '0')}`;
    }

    /**
     * Zoom-locks the camera onto a specific star rather than leaving it
     * parked on the constellation's center. Reuses the same outward viewing
     * direction and distance as the constellation-wide shot (not a tight
     * close-up on just this star), so its neighbors in the same constellation
     * stay on screen instead of falling out of frame.
     */
    focusOnStar(starData) {
        const boundElement = this.flatStarsArray.find(s => s.data.id === starData.id);
        if (!boundElement) return;

        const constellationItem = this.constellationNodesArray.find(c => c.id === boundElement.constellationId);
        if (!constellationItem) return;

        const starWorldPos = new THREE.Vector3();
        boundElement.mesh.getWorldPosition(starWorldPos);

        // Reuse the constellation's already-computed viewing angle/distance
        // (the same one proven to fit the whole constellation on screen)
        // rather than a fresh close-up — just re-centers on this specific
        // star along that same direction, so its neighbors stay in frame.
        const framing = constellationItem.framing || this.computeConstellationFraming(constellationItem);
        const camPos = starWorldPos.clone().sub(framing.viewDir.clone().multiplyScalar(framing.distance));
        this.animateCameraTo(camPos, starWorldPos, 900, false);
    }

    closeStarDetailPanel() {
        const panel = document.getElementById('star-detail-panel');
        if (panel) panel.classList.remove('open');
        this.teardownPlanetOrbits();
        this.closeMitosisPanel();
        this.selectedStarData = null;
    }

    /**
     * Builds real planet orbits around the selected star (STARMAP_SPEC.md §5).
     * The resting star keeps its two decorative astrolabe rings; those are
     * hidden while orbits are shown and restored on collapse, so the sky's
     * at-rest look is unchanged.
     *
     * LOCKED spec rule: proximity == completion order — innermost ring is the
     * first planet to complete. Planets sharing an `order` share a ring and
     * are distributed evenly by angle.
     */
    buildPlanetOrbits(starData) {
        this.teardownPlanetOrbits();

        const bound = this.flatStarsArray.find(s => s.data.id === starData.id);
        if (!bound) return;
        const planets = starData.planets || [];
        if (planets.length === 0) return;

        const gem = bound.mesh;
        const orbitGroup = new THREE.Group();
        const orders = [...new Set(planets.map(p => p.order))].sort((a, b) => a - b);
        const planetNodes = [];

        orders.forEach((order, ringIndex) => {
            const ringRadius = 3.2 + ringIndex * 1.5;
            const samePriority = planets.filter(p => p.order === order);

            const ringGeo = new THREE.TorusGeometry(ringRadius, 0.015, 6, 72);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xa8e6ff,
                transparent: true,
                opacity: 0.28,
                alphaMap: getTickRingTexture(),
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.userData.baseOpacity = 0.28;
            orbitGroup.add(ring);

            samePriority.forEach((planet, i) => {
                const angle = (i / samePriority.length) * Math.PI * 2;
                const node = new THREE.Mesh(
                    new THREE.SphereGeometry(0.32, 12, 12),
                    new THREE.MeshBasicMaterial({ color: 0xa8e6ff, transparent: true })
                );
                node.userData.orbitRadius = ringRadius;
                node.userData.orbitAngle = angle;
                node.userData.orbitSpeed = 0.35 / (ringIndex + 1);
                node.userData.planet = planet;
                // Completed planets stop orbiting and ease toward this shared
                // reference angle (0 on every ring) instead — so completed
                // markers line up into a single row extending outward from
                // the star, rather than continuing to drift around their
                // ring. Planets sharing a ring fan out slightly around it so
                // they read as a row rather than one overlapping dot.
                node.userData.lockAngleOffset = (i - (samePriority.length - 1) / 2) * 0.14;

                const halo = createGlowSprite(0xa8e6ff, 2.2, 0.5);
                node.add(halo);
                node.userData.halo = halo;

                orbitGroup.add(node);
                planetNodes.push(node);
            });
        });

        // Hide the decorative rings while real orbits are on screen.
        if (gem.userData.ring1) gem.userData.ring1.visible = false;
        if (gem.userData.ring2) gem.userData.ring2.visible = false;

        gem.add(orbitGroup);
        this.planetOrbit = { gem, group: orbitGroup, nodes: planetNodes, spawnTime: null };
        this.refreshPlanetOrbits();
    }

    /**
     * Star mitosis (STARMAP_SPEC.md §7), Goblin Tools "Magic ToDo"-style:
     * pick one or more of THIS star's existing steps, and each becomes its
     * own new star with its own generated breakdown of sub-steps — further
     * chunking the work, rather than fabricating unrelated new star ideas.
     *
     * TODO(AI): the sub-step breakdown for each promoted star is a generic
     * local placeholder (generateSubStepBreakdown() below). Real, contextual
     * breakdown needs the actual starkeep-ai service (Phase 5, DEC-004 — the
     * mock provider is the v1 contract, so this stays local until then); the
     * "sequence into the constellation based on the original planet order"
     * half of this feature has the same dependency and is also deferred.
     */
    openMitosisPanel() {
        if (!this.selectedStarData) return;
        this.mitosisSuggestions = (this.selectedStarData.planets || [])
            .filter(p => !p.done)
            .map(p => ({ planet: p, selected: false }));
        if (this.mitosisSuggestions.length === 0) return;

        const panel = document.getElementById('mitosis-panel');
        if (panel) panel.style.display = 'block';
        const trigger = document.getElementById('ai-split-btn');
        if (trigger) trigger.style.display = 'none';
        this.renderMitosisList();
    }

    closeMitosisPanel() {
        const panel = document.getElementById('mitosis-panel');
        if (panel) panel.style.display = 'none';
        this.mitosisSuggestions = [];

        const trigger = document.getElementById('ai-split-btn');
        if (trigger && this.selectedStarData) {
            const hasSplittableStep = (this.selectedStarData.planets || []).some(p => !p.done);
            trigger.style.display = (this.selectedStarData.status === 'approved' || !hasSplittableStep)
                ? 'none' : 'block';
        }
    }

    renderMitosisList() {
        const list = document.getElementById('mitosis-list');
        if (!list) return;
        list.innerHTML = '';

        this.mitosisSuggestions.forEach((entry, index) => {
            const row = document.createElement('div');
            row.className = `mitosis-row${entry.selected ? ' selected' : ''}`;

            const toggle = document.createElement('button');
            toggle.className = 'mitosis-toggle';
            toggle.innerHTML = entry.selected ? '&#10003;' : '';
            toggle.title = entry.selected ? 'Deselect' : 'Select this step to split off';
            toggle.addEventListener('click', () => {
                this.mitosisSuggestions[index].selected = !this.mitosisSuggestions[index].selected;
                this.renderMitosisList();
            });

            const label = document.createElement('span');
            label.className = 'flex-1 text-xs text-slate-200';
            label.innerText = entry.planet.label;

            row.appendChild(toggle);
            row.appendChild(label);
            list.appendChild(row);
        });

        // Say up front whether this split will consume the star. The previous
        // version decided that silently, so the parent could vanish with no
        // warning — the fate is the same, it is just no longer a surprise.
        const outcome = this.describeMitosisOutcome();
        const note = document.getElementById('mitosis-outcome');
        if (note) {
            note.innerText = outcome.text;
            note.className = `mitosis-outcome${outcome.consumesParent ? ' is-consuming' : ''}`;
        }
    }

    /**
     * Generic local placeholder breakdown for a newly-promoted star. See the
     * TODO(AI) above — real breakdown needs actual contextual understanding
     * of the step, which only a real AI service can provide.
     */
    generateSubStepBreakdown(stepLabel) {
        return [
            { label: `Plan approach for "${stepLabel}"`, done: false, order: 1 },
            { label: `Complete "${stepLabel}"`, done: false, order: 2 }
        ];
    }

    /**
     * Would this split leave the parent with nothing of its own? Drives both
     * the live preview line in the panel and the actual outcome, so what the
     * user is told and what happens can't drift apart.
     */
    describeMitosisOutcome() {
        const chosen = this.mitosisSuggestions.filter(e => e.selected).length;
        if (!this.selectedStarData || chosen === 0) {
            return { chosen: 0, consumesParent: false, text: 'Select the steps to promote into their own stars.' };
        }
        const total = (this.selectedStarData.planets || []).length;
        const remaining = total - chosen;
        const hasEvidence = (this.selectedStarData.evidence || []).length > 0;
        const consumesParent = remaining === 0 && !hasEvidence;

        const plural = chosen === 1 ? 'star' : 'stars';
        return {
            chosen,
            consumesParent,
            text: consumesParent
                ? `All steps promoted — this star will be replaced by the ${chosen} new ${plural}.`
                : `${remaining > 0 ? `${remaining} step${remaining === 1 ? '' : 's'} remain` : 'Evidence attached'} — this star stays, with ${chosen} new ${plural} ahead of it.`
        };
    }

    /**
     * Promotes each selected step into its own star with its own breakdown.
     *
     * Splitting means "break this work into smaller pieces that culminate in
     * its completion", so the offshoots are PREREQUISITES of the parent, not
     * peers of it — they are spliced into the sequence ahead of it, in their
     * original step order. (This is a deliberate departure from
     * STARMAP_SPEC.md §7's "structurally all stars are peers"; see DEC-013.)
     *
     * The parent is consumed only when the split leaves it with nothing of
     * its own — no steps and no evidence — since completing the offshoots is
     * then exactly equivalent to completing it. Otherwise it survives holding
     * the remainder. Deliberately NOT a rollup that auto-completes: a star
     * always requires evidence, and awarding the parent LUX on top of what
     * its offshoots already earned would double-count the ledger.
     *
     * No positions are computed here — that is layoutConstellation()'s job.
     * The old fixed-ring placement around the parent is what caused split
     * stars to land on top of each other and on their neighbours.
     */
    async confirmMitosisSplitsReal(parent, constellationItem, parentId, ordered) {
        // Mitosis is one atomic server call (not batched at edit-session
        // commit like drag/rename/delete) — if this same constellation's
        // edit session already has uncommitted changes, flush them first
        // rather than silently discarding them once the split response
        // replaces the edge list wholesale.
        if (this.isEditMode && this.editUndoStack.length > 0) {
            try {
                await this.flushEditSession(constellationItem, this.editSnapshot);
            } catch (err) {
                console.error('[StarMapView] Failed to save pending edits before split:', err);
                this.showEditToast('Failed to save pending edits — split cancelled');
                return;
            }
        }

        this.closeMitosisPanel();
        this.showEditToast('Splitting…');

        let result;
        try {
            result = await starmapApi.splitMilestone(parentId, {
                offshoots: ordered.map((entry) => ({
                    title: entry.planet.label,
                    description: `Chunked out of "${this.selectedStarData.title}".`,
                    source_planet_order: entry.planet.order
                }))
            });
        } catch (err) {
            console.error('[StarMapView] Failed to split star:', err);
            this.showEditToast('Split failed — try again');
            return;
        }

        // Server response is authoritative — apply it wholesale rather than
        // re-deriving it from local state.
        const newIds = result.offshoots.map(o => o.id);
        result.offshoots.forEach((o) => {
            const dataObj = {
                id: o.id,
                constellationId: parent.constellationId,
                title: o.title,
                description: o.description || '',
                status: o.status,
                planets: o.planets || [],
                evidence: (o.evidence || []).map(e => ({ id: e.id, type: e.type, payload: e.payload, label: e.label || e.payload }))
            };
            this.localStarData.push(dataObj);
            this.spawnStarMesh(dataObj, parent.mesh.position.clone(), constellationItem);
        });

        const nextEdges = (result.constellation?.edges || []).map(e => ({ from: e.from, to: e.to }));

        if (result.consumed_parent) {
            this.closeStarDetailPanel();
            this.removeStarMesh(parentId);
        } else {
            this.selectedStarData.planets = result.parent?.planets || [];
            this.renderPlanetsChecklist();
            this.evaluateValidationButtonState();
            this.refreshStarVisuals(this.selectedStarData);
            this.buildPlanetOrbits(this.selectedStarData);
        }

        this.applyGraphChange(constellationItem, nextEdges, { newStarIds: newIds });
        this.enterEditMode({ highlight: newIds });
    }

    async confirmMitosisSplits() {
        if (!this.selectedStarData) return;

        const selected = this.mitosisSuggestions.filter(e => e.selected);
        if (selected.length === 0) {
            this.closeMitosisPanel();
            return;
        }

        const parent = this.flatStarsArray.find(s => s.data.id === this.selectedStarData.id);
        if (!parent) return;
        const constellationItem = this.constellationNodesArray.find(c => c.id === parent.constellationId);
        if (!constellationItem) return;

        const parentId = parent.data.id;

        // Preserve the steps' original order — that ordering is the whole
        // point of chaining them rather than fanning them out.
        const ordered = selected
            .slice()
            .sort((a, b) => (a.planet.order ?? 0) - (b.planet.order ?? 0));

        if (this.usingRealBackend) {
            await this.confirmMitosisSplitsReal(parent, constellationItem, parentId, ordered);
            return;
        }

        const outcome = this.describeMitosisOutcome();

        // Remove the promoted steps from the original star's checklist.
        const promoted = new Set(selected.map(e => e.planet));
        this.selectedStarData.planets = (this.selectedStarData.planets || [])
            .filter(p => !promoted.has(p));

        const newIds = ordered.map((entry, i) => {
            const dataObj = {
                id: `mitosis_${parentId}_${Date.now()}_${i}`,
                constellationId: parent.constellationId,
                title: entry.planet.label.toUpperCase(),
                description: `Chunked out of "${this.selectedStarData.title}".`,
                status: 'pending',
                planets: this.generateSubStepBreakdown(entry.planet.label),
                evidence: []
            };
            this.localStarData.push(dataObj);
            this.spawnStarMesh(dataObj, parent.mesh.position.clone(), constellationItem);
            return dataObj.id;
        });

        let nextEdges;
        if (outcome.consumesParent) {
            // The parent is fully superseded — the chain takes over its slot
            // in the sequence entirely, so nothing is left dangling.
            nextEdges = replaceNodeWithChain(constellationItem.edges, parentId, newIds);
            this.closeStarDetailPanel();
            this.removeStarMesh(parentId);
        } else {
            // The parent survives with its remaining work, and the offshoots
            // are prerequisites — so they splice in AHEAD of it.
            nextEdges = insertChainBefore(constellationItem.edges, parentId, newIds);
            this.renderPlanetsChecklist();
            this.evaluateValidationButtonState();
            this.refreshStarVisuals(this.selectedStarData);
            this.buildPlanetOrbits(this.selectedStarData);
        }

        this.closeMitosisPanel();
        this.applyGraphChange(constellationItem, nextEdges, { newStarIds: newIds });
        this.enterEditMode({ highlight: newIds });
    }

    /** Fully disposes and removes one star (mesh, label, link handle, flatStarsArray entry). */
    removeStarMesh(starId) {
        const index = this.flatStarsArray.findIndex(s => s.data.id === starId);
        if (index === -1) return;
        const [entry] = this.flatStarsArray.splice(index, 1);

        entry.mesh.parent?.remove(entry.mesh);
        entry.mesh.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((m) => m.dispose());
            }
        });
        entry.label.remove();
        entry.linkHandle?.remove();

        const dataIndex = this.localStarData.findIndex(s => s.id === starId);
        if (dataIndex !== -1) this.localStarData.splice(dataIndex, 1);
    }

    /** Repaints planet nodes from their current done state (spec §5 visual states). */
    refreshPlanetOrbits() {
        if (!this.planetOrbit) return;
        this.planetOrbit.nodes.forEach((node) => {
            const done = !!node.userData.planet.done;
            node.material.color.setHex(done ? 0xffffff : 0x5f7fa8);
            node.material.opacity = done ? 1.0 : 0.75;
            if (node.userData.halo) {
                node.userData.halo.material.color.setHex(done ? 0xffffff : 0xa8e6ff);
                node.userData.halo.material.opacity = done ? 0.75 : 0.22;
            }
        });
    }

    teardownPlanetOrbits() {
        if (!this.planetOrbit) return;
        const { gem, group } = this.planetOrbit;

        group.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                // The shared tick/glow textures are reused across every star —
                // dispose the materials but never their maps.
                child.material.dispose();
            }
        });
        gem.remove(group);

        if (gem.userData.ring1) gem.userData.ring1.visible = true;
        if (gem.userData.ring2) gem.userData.ring2.visible = true;

        this.planetOrbit = null;
    }

    renderPlanetsChecklist() {
        const container = document.getElementById('planets-checklist');
        const completeMsg = document.getElementById('planets-complete-msg');
        const section = document.getElementById('planets-section');
        const addBtn = document.getElementById('add-planet-btn');
        if (!container || !this.selectedStarData) return;

        container.innerHTML = '';

        const planets = this.selectedStarData.planets || [];
        // Archived once approved: shown as locked/complete with a checkmark
        // glyph (spec §5). Submitted is also frozen (awaiting validation) but
        // isn't "archived" — it shows actual per-planet done state, just
        // non-clickable.
        const isArchived = this.selectedStarData.status === 'approved';
        const isEditable = this.selectedStarData.status === 'active' || this.selectedStarData.status === 'pending';

        if (planets.length === 0 && !isEditable) {
            // Spec §5's distinct "no planets" layout — nothing to show or add.
            if (section) section.style.display = 'none';
            if (completeMsg) completeMsg.style.display = 'none';
            return;
        }
        if (section) section.style.display = 'flex';
        if (addBtn) addBtn.style.display = isEditable ? 'block' : 'none';

        if (planets.length === 0) {
            container.innerHTML = '<div class="text-xs text-slate-500 mb-2">No steps yet.</div>';
            if (completeMsg) completeMsg.style.display = 'none';
            return;
        }

        const ordered = [...planets].sort((a, b) => a.order - b.order);
        let allDone = true;

        ordered.forEach((p) => {
            const isChecked = isArchived || p.done;
            if (!isChecked) allDone = false;

            const div = document.createElement('div');
            div.className = isEditable
                ? 'planet-item text-slate-300 hover:text-white'
                : 'planet-item text-slate-400 cursor-default';
            div.innerHTML = `
                <div class="checkbox rounded ${isChecked ? 'checked' : ''}"></div>
                <span>${p.label}</span>
                ${isArchived ? '<span class="text-emerald-400 ml-auto">&#10003;</span>' : ''}
            `;
            if (isEditable) {
                div.addEventListener('click', () => {
                    p.done = !p.done;
                    // Only checking a step activates — unchecking one is not
                    // "starting work."
                    if (p.done) this.activateStarIfPending();
                    this.renderPlanetsChecklist();
                    this.evaluateValidationButtonState();
                    this.refreshStarVisuals(this.selectedStarData);
                    this.refreshPlanetOrbits();
                    this.schedulePlanetsSync(this.selectedStarData);
                });
            }
            container.appendChild(div);
        });

        // Spec §5: the gold "ready to submit?" prompt only applies while the
        // star is still actionable — not once it's archived.
        if (completeMsg) completeMsg.style.display = (allDone && !isArchived) ? 'block' : 'none';
    }

    addPlanetStep() {
        if (!this.selectedStarData) return;
        const isEditable = this.selectedStarData.status === 'active' || this.selectedStarData.status === 'pending';
        if (!isEditable) return;
        const starData = this.selectedStarData;

        this.openQuickInput({
            title: 'NEW STEP',
            placeholder: 'Describe the step…',
            onConfirm: (label) => {
                if (!starData.planets) starData.planets = [];
                const maxOrder = starData.planets.reduce((m, p) => Math.max(m, p.order), 0);
                starData.planets.push({ label, done: false, order: maxOrder + 1 });

                this.renderPlanetsChecklist();
                this.evaluateValidationButtonState();
                this.refreshStarVisuals(starData);
                // A new order value may need a whole new ring, not just a repaint.
                this.buildPlanetOrbits(starData);
                this.schedulePlanetsSync(starData);
            }
        });
    }

    /**
     * Fire-and-forget, debounced (so rapid-fire checklist clicks don't send
     * one PATCH per click), last-write-wins — sends the full current
     * `planets` array, not a delta. Optimistic: the checklist already
     * reflects the change locally, so a failed sync is low-stakes and
     * self-corrects on next reload. No-op under the dev bypass.
     */
    schedulePlanetsSync(starData) {
        if (!this.usingRealBackend || !starData) return;
        clearTimeout(this.planetsSyncTimer);
        const starId = starData.id;
        const planets = starData.planets;
        this.planetsSyncTimer = setTimeout(() => {
            starmapApi.updateMilestone(starId, { planets }).catch((err) => {
                console.error('[StarMapView] Failed to sync planets:', err);
            });
        }, 400);
    }

    addEvidence() {
        if (!this.selectedStarData) return;
        const starData = this.selectedStarData;

        this.openQuickInput({
            title: 'ATTACH EVIDENCE',
            placeholder: 'Evidence_Document.pdf',
            onConfirm: async (name) => {
                if (!starData.evidence) starData.evidence = [];

                if (this.usingRealBackend) {
                    try {
                        const created = await starmapApi.addEvidence(starData.id, { type: 'text', payload: name, label: name });
                        starData.evidence.push({ id: created.id, type: created.type, payload: created.payload, label: created.label || name });
                    } catch (err) {
                        console.error('[StarMapView] Failed to attach evidence:', err);
                        this.showEditToast('Failed to attach evidence — try again');
                        return;
                    }
                } else {
                    starData.evidence.push({ label: name });
                }

                this.activateStarIfPending();
                this.renderEvidenceFiles();
                this.evaluateValidationButtonState();
                this.refreshStarVisuals(starData);
            }
        });
    }

    renderEvidenceFiles() {
        const container = document.getElementById('evidence-files');
        if (!container) return;

        container.innerHTML = '';
        if (this.selectedStarData && this.selectedStarData.evidence && this.selectedStarData.evidence.length > 0) {
            this.selectedStarData.evidence.forEach(e => {
                container.innerHTML += `<div class="text-amber-400 mt-1 flex items-center gap-1">\u{1F4CE} <span>${e.label}</span></div>`;
            });
        } else {
            container.innerHTML = 'No files attached.';
        }
    }

    evaluateValidationButtonState() {
        const btn = document.getElementById('submit-validation-btn');
        if (!btn || !this.selectedStarData) return;

        const hasEvidence = this.selectedStarData.evidence && this.selectedStarData.evidence.length > 0;
        const statusAllows = (this.selectedStarData.status === 'active' || this.selectedStarData.status === 'pending');

        btn.disabled = !(hasEvidence && statusAllows);
    }

    async submitForValidation() {
        if (!this.selectedStarData) return;
        const starData = this.selectedStarData;

        if (this.usingRealBackend) {
            try {
                await starmapApi.submitMilestone(starData.id);
            } catch (err) {
                console.error('[StarMapView] Failed to submit for validation:', err);
                this.showEditToast(err?.detail || 'Failed to submit — try again');
                return;
            }
        }

        starData.status = 'submitted';
        this.refreshStarVisuals(starData);
        this.openStarDetailPanel(starData);
        alert("Your progress has been submitted for review.");
    }

    /**
     * pending -> active. Previously unreachable anywhere in the app except
     * by hand-editing seed data — nothing ever actually moved a star off its
     * default status. Triggers on the two lowest-friction actions that
     * already exist in the panel and unambiguously mean "work has begun":
     * checking off a step, or attaching evidence. Never fires in reverse —
     * unchecking a step doesn't undo it; once started, a star stays active
     * until it's submitted.
     *
     * Doesn't go through openStarDetailPanel() (submitForValidation()'s
     * pattern) because that also refocuses the camera on the star and closes
     * the mitosis panel — appropriate for a deliberate "submit" action, too
     * heavy-handed for a side effect of ticking one checkbox. Updates just
     * the badge directly instead; the checklist/evidence/submit-button state
     * is already being refreshed by whichever caller triggered this.
     */
    activateStarIfPending() {
        const starData = this.selectedStarData;
        if (!starData || starData.status !== 'pending') return;
        starData.status = 'active';

        const badge = document.getElementById('star-status');
        if (badge) {
            const colors = COLOUR_MAP[starData.status] || COLOUR_MAP.pending;
            badge.innerText = starData.status;
            badge.className = `inline-block px-2 py-0.5 mt-2 rounded text-[10px] font-hud uppercase tracking-wider font-bold ${colors.tailwindBg}`;
        }

        const parentConstItem = this.constellationNodesArray.find(c => c.id === starData.constellationId);
        if (parentConstItem) this.refreshConstellationVisuals(parentConstItem.id);
        this.updateDirectoryPanel();
    }

    /**
     * Single source of truth for a star's visual appearance — status color,
     * an optional user-chosen custom color override, and a checklist-progress
     * tint (steps checked off nudge the gem toward the "submitted" gold tone
     * as a preview, ahead of formal submission/validation). Call this any
     * time any of those three inputs change; it always recomputes fresh from
     * current state rather than incrementally mutating, so calling it
     * repeatedly is safe.
     */
    refreshStarVisuals(starData) {
        const boundElement = this.flatStarsArray.find(s => s.data.id === starData.id);
        if (!boundElement) return;

        const gem = boundElement.mesh;
        const isDormant = starData.status === 'pending';
        const baseHex = computeStarBaseColor(starData);

        const planets = starData.planets || [];
        const doneFraction = planets.length > 0
            ? planets.filter(p => p.done).length / planets.length
            : 0;

        const { center: rimColor, edge: coreColor } = deriveRadialColors(baseHex, 0.55, STAR_CORE_EDGE_SCALE);
        const { center: aheadRim, edge: aheadCore } = deriveRadialColors(COLOUR_MAP.submitted.outer, 0.55, STAR_CORE_EDGE_SCALE);
        const blendedRim = rimColor.clone().lerp(aheadRim, doneFraction * 0.5);
        const blendedCore = coreColor.clone().lerp(aheadCore, doneFraction * 0.5);

        gem.material.uniforms.colorCore.value.copy(blendedCore);
        gem.material.uniforms.colorRim.value.copy(blendedRim);

        const ringOpacityBase = isDormant ? 0.18 : 0.5;
        [gem.userData.ring1, gem.userData.ring2].forEach((ring, i) => {
            if (!ring) return;
            const opacity = i === 0 ? ringOpacityBase : ringOpacityBase * 0.8;
            ring.material.color.copy(blendedRim);
            ring.material.opacity = opacity;
            ring.userData.baseOpacity = opacity;
        });

        // Glow always matches the star's own base color, and is brighter
        // overall — the old 0.12 dormant floor read as barely-there even once
        // a star was fully approved.
        const baseGlowIntensity = (isDormant ? 0.22 : 0.55) + doneFraction * 0.3;
        gem.userData.baseGlowIntensity = baseGlowIntensity;
        gem.userData.isDormant = isDormant;
        if (gem.userData.glowMesh) {
            gem.userData.glowMesh.material.color.setHex(baseHex);
            gem.userData.glowMesh.material.opacity = baseGlowIntensity;
        }

        // A star's status feeds its constellation's connector lit state, spoke
        // brightness and label treatment — keep those in sync rather than
        // leaving them frozen at whatever they were when first built.
        this.refreshConstellationVisuals(boundElement.constellationId);
        this.updateDirectoryPanel();
    }

    fetchWalletBalanceMock() {
        const calculatedBalance = this.localStarData
            .filter(s => s.status === 'approved' && s.lux)
            .reduce((total, current) => total + current.lux, 0);

        const balanceText = document.getElementById('lux-balance-text');
        if (balanceText) balanceText.innerText = calculatedBalance;
    }

    onPointerClick(event) {
        if (this.currentPhase === PHASE.CREATION || !this.camera) return;
        // Edit mode owns the canvas; a click that ends a drag must not also
        // count as "clicked the North Star".
        if (this.isEditMode) return;
        // This listener is on `window`, so ANY click anywhere on the page
        // bubbles here — including clicks on DOM overlay buttons/panels that
        // sit visually on top of the 3D scene. Without this check, clicking
        // e.g. the "Next Step" card (which sits front-and-center, right
        // where the North Star mesh renders behind it once its screen is
        // open) ALSO raycasts the scene from that same screen position,
        // hits the North Star, and reopens the very screen the button just
        // closed — a bug found by tracing console logs, not by inspection;
        // the raycast fired again immediately after every close. Only
        // clicks that actually landed on the canvas itself should raycast.
        if (event.target !== this.renderer?.domElement) return;

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const hits = this.raycaster.intersectObjects(this.scene.children, true);
        if (hits.length > 0) {
            let currentMatch = hits[0].object;
            while (currentMatch.parent && currentMatch !== this.scene) {
                if (currentMatch === this.northStarMesh) {
                    this.openNorthStarScreen();
                    break;
                }
                currentMatch = currentMatch.parent;
            }
        }
    }

    /**
     * Enters Zoom 0 (STARMAP_SPEC.md §2): flies the camera in close to the
     * North Star and de-emphasizes the surrounding sky, so the goal itself is
     * the only thing in focus.
     */
    openNorthStarScreen() {
        if (this.currentPhase === PHASE.CREATION) return;
        // selectedConstellation is cleared below, so any edit session must be
        // committed first — exitEditMode needs it to lay the result out.
        if (this.isEditMode) this.exitEditMode({ commit: true });

        this.currentPhase = PHASE.NORTH_STAR;
        this.closeStarDetailPanel();
        this.selectedConstellation = null;

        this.animateCameraTo(new THREE.Vector3(0, 6, 34), new THREE.Vector3(0, 0, 0), 1000, false);
        this.constellationNodesArray.forEach((node) => {
            if (node.label) node.label.style.opacity = String(NON_FOCUSED_OPACITY);
            this.setNodeEmphasis(node.group, NON_FOCUSED_OPACITY);
        });
        this.flatStarsArray.forEach(star => { star.label.style.display = 'none'; });

        const backBtn = document.getElementById('back-btn');
        if (backBtn) backBtn.style.display = 'none';

        this.renderNorthStarScreen();
        this.showNorthStarScreen();
        this.updateDirectoryPanel();
    }

    /**
     * Direct inline-style toggle, not just classList. The actual bug that
     * made this screen seem impossible to close (found via console logging,
     * not inspection) was unrelated to CSS entirely: onPointerClick() is a
     * `window`-level click listener with no check on event.target, so
     * clicking a DOM button that sits over the 3D scene (e.g. "Next Step",
     * front-and-center where the North Star mesh renders behind it) ALSO
     * raycasts the scene from that same screen position, hits the North
     * Star, and reopens the screen its own button just closed — see the
     * guard added in onPointerClick(). Kept the inline-style toggle anyway;
     * it's a harmless, slightly more bulletproof way to drive the show/hide.
     */
    showNorthStarScreen() {
        const screen = document.getElementById('north-star-screen');
        if (!screen) return;
        screen.classList.remove('hidden');
        screen.style.removeProperty('display');
        screen.style.pointerEvents = 'none';
        // Next frame, so the opacity transition actually runs rather than
        // being collapsed into the same style recalculation as the unhide.
        requestAnimationFrame(() => {
            screen.classList.add('visible');
            screen.style.opacity = '1';
        });
    }

    hideNorthStarScreen() {
        const screen = document.getElementById('north-star-screen');
        if (!screen) return;
        screen.classList.remove('visible');
        screen.classList.add('hidden');
        screen.style.opacity = '0';
        screen.style.display = 'none';
    }

    closeNorthStarScreen() {
        this.hideNorthStarScreen();
        if (this.currentPhase === PHASE.NORTH_STAR) this.handleBackAction();
    }

    /** Populates the Zoom 0 screen from live state (spec §2 content rules). */
    renderNorthStarScreen() {
        const purposeEl = document.getElementById('ns-purpose');
        if (purposeEl) purposeEl.innerText = this.chosenGoal || 'No pathway selected yet';

        // No goal set yet: offer a way to define one right here instead of
        // only showing an empty state — momentum/next-step don't mean
        // anything without a goal, so they're hidden until one exists.
        const createBtn = document.getElementById('create-north-star-btn');
        const definedContent = document.getElementById('ns-defined-content');
        const hasGoal = !!this.chosenGoal;
        if (createBtn) createBtn.classList.toggle('hidden', hasGoal);
        if (definedContent) definedContent.style.display = hasGoal ? '' : 'none';
        if (!hasGoal) return;

        // "Last star" — most recent approved star.
        // TODO(API): backend supplies real validated_at timestamps; mock data
        // only carries a display string on already-approved seeds.
        const lastStarEl = document.getElementById('ns-last-star');
        if (lastStarEl) {
            const approved = this.flatStarsArray
                .map(s => s.data)
                .filter(d => d.status === 'approved' && d.completedDate);
            lastStarEl.innerText = approved.length > 0
                ? approved[approved.length - 1].completedDate
                : '—';
        }

        // "Most active" — spec §2 says by most recent activity, not completion %.
        // TODO(API): use milestone.updated_at once real data is wired up; for
        // now this is the most recently interacted-with constellation.
        const mostActiveEl = document.getElementById('ns-most-active');
        if (mostActiveEl) {
            const activeId = this.lastActiveConstellationId ?? this.constellationNodesArray[0]?.id;
            const item = this.constellationNodesArray.find(c => c.id === activeId);
            mostActiveEl.innerText = item ? item.config.name : '—';
        }

        const next = this.computeNextStep();
        const titleEl = document.getElementById('ns-next-title');
        const fromEl = document.getElementById('ns-next-from');
        const cardEl = document.getElementById('ns-next-step');
        if (titleEl) titleEl.innerText = next ? next.label : 'All caught up';
        if (fromEl) fromEl.innerText = next ? `→ ${next.constellationName}` : '';
        if (cardEl) cardEl.style.display = next ? 'block' : 'none';
    }

    /**
     * Spec §2 priority order for the single most proximate actionable item:
     *   1. incomplete planet (innermost orbit / lowest `order` first)
     *   2. incomplete star with no planets
     *   3. incomplete star with unchecked planets
     * Returns { starData, label, constellationName } or null.
     */
    computeNextStep() {
        const candidates = this.flatStarsArray.filter(s => s.data.status !== 'approved');
        if (candidates.length === 0) return null;

        const nameFor = (constellationId) =>
            this.constellationNodesArray.find(c => c.id === constellationId)?.config.name ?? '';

        // 1. First incomplete planet, lowest order wins.
        let best = null;
        candidates.forEach((star) => {
            (star.data.planets || []).forEach((p) => {
                if (p.done) return;
                if (!best || p.order < best.planet.order) best = { star, planet: p };
            });
        });
        if (best) {
            return {
                starData: best.star.data,
                label: best.planet.label,
                constellationName: nameFor(best.star.constellationId)
            };
        }

        // 2. Incomplete star with no planets, else 3. any remaining incomplete star.
        const noPlanets = candidates.find(s => !s.data.planets || s.data.planets.length === 0);
        const target = noPlanets || candidates[0];
        return {
            starData: target.data,
            label: target.data.title,
            constellationName: nameFor(target.constellationId)
        };
    }

    /** Spec §2: tapping "your next step" navigates to that actual item. */
    jumpToNextStepNode() {
        const next = this.computeNextStep();
        if (!next) return;

        const bound = this.flatStarsArray.find(s => s.data.id === next.starData.id);
        if (!bound) return;
        const parentConstItem = this.constellationNodesArray.find(c => c.id === bound.constellationId);
        if (!parentConstItem) return;

        // Close the North Star HUD directly rather than via
        // closeNorthStarScreen(), which (since we're leaving PHASE.NORTH_STAR)
        // would also run handleBackAction()'s OWN camera flight back to the
        // sky overview — firing a split second before, and fighting over the
        // shared camera-tween state with, transitionToFocusPhase()'s flight
        // to the actual target below. Both used the same 1200ms duration, so
        // handleBackAction's completion handler (which sets
        // controls.autoRotate = true, appropriate for the sky overview it
        // thought it was returning to) tended to win the race and leave the
        // camera auto-rotating around a constellation it had just framed.
        this.hideNorthStarScreen();

        // transitionToFocusPhase() below already sets emphasis and label
        // visibility for every constellation and every star from scratch
        // (target constellation -> full emphasis/visible labels, everyone
        // else -> dimmed/hidden), so nothing needs pre-resetting here first.
        this.transitionToFocusPhase(parentConstItem);
        setTimeout(() => {
            this.openStarDetailPanel(bound.data);
        }, 1200);
    }

    tick(delta, elapsed) {
        // Structural layout slide, and live connector re-pointing while a star
        // is being dragged. Both must run before the label projection below so
        // labels land on this frame's positions, not last frame's.
        this.updateLayoutTween();
        if (this.drag && this.selectedConstellation) {
            this.refreshConnectorGeometry(this.selectedConstellation);
        }

        if (this.northStarMesh && this.northStarMesh.visible) {
            this.northStarMesh.rotation.x += 0.005;
            this.northStarMesh.rotation.y += 0.007;
            this.northStarMesh.material.opacity = Math.sin(elapsed) * 0.3 + 0.7;

            if (this.northStarGlow) {
                this.northStarGlow.material.opacity = 0.5 + Math.sin(elapsed * 2.5) * 0.15;
            }
        }

        this.flatStarsArray.forEach((star) => {
            const gem = star.mesh;
            const isDormant = gem.userData.isDormant;
            const isHovered = gem.userData.isHovered;
            const hoverSpin = isHovered ? 2.5 : 1;

            // Slow overall tumble of the whole sigil, dormant stars hold still
            // unless hovered (a little life on hover, even for dormant stars).
            if (!isDormant || isHovered) {
                gem.rotation.y += 0.008 * hoverSpin;
                gem.rotation.x += 0.004 * hoverSpin;
            }

            gem.material.uniforms.uTime.value = elapsed;

            // Astrolabe rings counter-rotate around their own tilted axes,
            // independent of the gem's overall tumble above.
            if (gem.userData.ring1) gem.userData.ring1.rotation.z += (isDormant ? 0.0006 : 0.004) * hoverSpin;
            if (gem.userData.ring2) gem.userData.ring2.rotation.z -= (isDormant ? 0.0004 : 0.003) * hoverSpin;

            if (gem.userData.glowMesh) {
                const base = gem.userData.baseGlowIntensity ?? 0.45;
                const hoverBoost = isHovered ? 1.8 : 1.0;
                const pulse = isDormant ? 0 : Math.sin(elapsed * 4.0 + gem.position.x) * 0.1;
                gem.userData.glowMesh.material.opacity = THREE.MathUtils.clamp(base * hoverBoost + pulse, 0, 1);
            }
        });

        if (this.particleSystem) {
            this.particleSystem.rotation.y = elapsed * 0.04;
        }

        // Planet orbits on the expanded star (spec §5): planets extend outward
        // from the star center, staggered inner-ring-first, then keep orbiting.
        if (this.planetOrbit) {
            if (this.planetOrbit.spawnTime === null) this.planetOrbit.spawnTime = elapsed;
            const sinceSpawn = elapsed - this.planetOrbit.spawnTime;

            this.planetOrbit.nodes.forEach((node, i) => {
                const delay = i * 0.05;             // spec: 50ms stagger
                const t = (sinceSpawn - delay) / 0.3; // spec: 300ms extend
                const extend = THREE.MathUtils.clamp(t, 0, 1);
                const eased = 1 - Math.pow(1 - extend, 3); // ease-out

                if (node.userData.planet.done) {
                    // Ease toward the shared lock angle instead of continuing
                    // to orbit — exponential decay converges quickly and
                    // handles any amount of prior accumulated rotation.
                    const target = node.userData.lockAngleOffset;
                    node.userData.orbitAngle += (target - node.userData.orbitAngle) * Math.min(delta * 3, 1);
                } else {
                    node.userData.orbitAngle += node.userData.orbitSpeed * delta;
                }

                const r = node.userData.orbitRadius * eased;
                node.position.set(
                    Math.cos(node.userData.orbitAngle) * r,
                    0,
                    Math.sin(node.userData.orbitAngle) * r
                );
                node.visible = extend > 0;
            });
        }

        // OrbitControls tracks the camera's spherical position relative to its
        // OWN `target` and recomputes camera.position from that every update()
        // call — it has no idea sceneEngine.cameraTo() is also moving the
        // camera. `target` is synced every frame (not just while animating) so
        // it's always wherever the last tween left it, ready for the user to
        // free-orbit around once idle.
        this.controls.target.copy(this.sceneEngine.camCurrentLookAt);

        // Custom smooth zoom (ZOOM_* constants; wheel listener is in
        // bindEvents()) — OrbitControls' own wheel zoom has no per-frame
        // easing in this three.js version, so this replaces it entirely:
        // ease the camera toward the accumulated wheel velocity, then decay
        // the remainder, which is what gives both a smooth blend across
        // rapid scroll ticks and a gentle glide once you stop. Skipped while
        // a scripted camera flight has authority over position (it would
        // just get overwritten below), but the velocity still decays either
        // way so it can't silently pile up during a flight and lurch once
        // the flight ends.
        if (Math.abs(this.zoomVelocity) > 1e-4) {
            if (!this.sceneEngine.isAnimatingCamera && this.controls.enabled) {
                const offset = this.camera.position.clone().sub(this.controls.target);
                const dist = offset.length();
                if (dist > 1e-4) {
                    const nextDist = THREE.MathUtils.clamp(
                        dist * (1 + this.zoomVelocity),
                        this.controls.minDistance,
                        this.controls.maxDistance
                    );
                    offset.multiplyScalar(nextDist / dist);
                    this.camera.position.copy(this.controls.target).add(offset);
                }
            }
            this.zoomVelocity *= ZOOM_VELOCITY_DECAY;
            if (Math.abs(this.zoomVelocity) < 1e-4) this.zoomVelocity = 0;
        }

        if (this.sceneEngine.isAnimatingCamera) {
            // Let update() run so any residual damping/autoRotate momentum
            // decays naturally over the tween instead of being frozen and then
            // unleashed as a jump once the tween ends — but since scene.js's
            // tween already set camera.position/orientation correctly this
            // frame (before tickCallbacks run), immediately re-impose that
            // authoritative result, discarding whatever small drift
            // update()'s own (decaying) internal state just introduced.
            const tweenPos = this.camera.position.clone();
            const tweenLookAt = this.sceneEngine.camCurrentLookAt.clone();
            this.controls.update();
            this.camera.position.copy(tweenPos);
            this.camera.lookAt(tweenLookAt);
        } else {
            this.controls.update();
        }

        this.constellationNodesArray.forEach((item) => {
            if (item.label && item.group.visible) {
                // labelAnchorLocal defaults to the group's own origin and is
                // only re-centred on the stars' centroid at LOCK IN (see
                // recomputeLabelAnchor) — applyMatrix4 by the group's world
                // matrix carries that local point into world space exactly
                // like setFromMatrixPosition did for the origin case.
                this.tempProjectionVector.copy(item.labelAnchorLocal).applyMatrix4(item.group.matrixWorld);
                this.tempProjectionVector.project(this.camera);

                const labelsVisibleThisPhase = this.currentPhase === PHASE.FULL_SKY
                    || this.currentPhase === PHASE.NORTH_STAR;
                if (this.tempProjectionVector.z < 1 && labelsVisibleThisPhase) {
                    const screenX = (this.tempProjectionVector.x * 0.5 + 0.5) * window.innerWidth;
                    const screenY = (this.tempProjectionVector.y * -0.5 + 0.5) * window.innerHeight;
                    item.label.style.display = 'block';
                    item.label.style.left = `${screenX}px`;
                    item.label.style.top = `${screenY}px`;
                    item.label.style.zIndex = Math.floor((1 - this.tempProjectionVector.z) * 100);
                } else {
                    item.label.style.display = 'none';
                }
            }
        });

        if (this.currentPhase === PHASE.CONST_FOCUS && this.selectedConstellation) {
            this.flatStarsArray.forEach((star) => {
                if (star.constellationId === this.selectedConstellation.id) {
                    star.mesh.getWorldPosition(this.tempProjectionVector);
                    this.tempProjectionVector.project(this.camera);

                    if (this.tempProjectionVector.z < 1) {
                        const screenX = (this.tempProjectionVector.x * 0.5 + 0.5) * window.innerWidth;
                        const screenY = (this.tempProjectionVector.y * -0.5 + 0.5) * window.innerHeight;
                        const z = Math.floor((1 - this.tempProjectionVector.z) * 100) + 10;

                        star.label.style.display = 'block';
                        star.label.style.left = `${screenX}px`;
                        // Lifted above the star's own screen position (the
                        // label's CSS anchors its bottom edge at top:0) so
                        // the title doesn't sit on top of — and doesn't
                        // intercept clicks meant for — the star itself.
                        star.label.style.top = `${screenY - STAR_LABEL_LIFT_PX}px`;
                        star.label.style.zIndex = z;

                        // Link handle: positioned at the star's own (non-
                        // lifted) screen position, offset diagonally so it
                        // sits next to the star model rather than on top of
                        // its grab circle or inside the title above it.
                        // Optional-chained defensively: this runs every
                        // frame, so a missing handle must never be able to
                        // throw and silently stall the whole render loop.
                        if (this.isEditMode) {
                            if (star.linkHandle) {
                                star.linkHandle.style.display = 'flex';
                                star.linkHandle.style.left = `${screenX + STAR_GRAB_RADIUS_PX * 0.7}px`;
                                star.linkHandle.style.top = `${screenY - STAR_GRAB_RADIUS_PX * 0.7}px`;
                                star.linkHandle.style.zIndex = z + 1;
                            }
                        } else if (star.linkHandle) {
                            star.linkHandle.style.display = 'none';
                        }
                    } else {
                        star.label.style.display = 'none';
                        if (star.linkHandle) star.linkHandle.style.display = 'none';
                    }
                }
            });
        }
    }

    async destroy() {
        // Navigating away entirely (e.g. the Home button) while an edit
        // session is open (or being saved) must not silently discard it —
        // this is awaited BEFORE any teardown below runs, so nothing gets
        // disposed out from under the in-flight API calls. router.js awaits
        // destroy() for exactly this reason.
        //
        // Checks pendingCommitPromise FIRST, not just isEditMode: a "back"
        // click just before this (handleBackAction/transitionToFocusPhase)
        // already flips isEditMode to false synchronously while its own
        // save is still running in the background — trusting isEditMode
        // alone would see "false" and wrongly conclude there's nothing left
        // to wait for, abandoning that in-flight save mid-request.
        if (this.pendingCommitPromise) {
            try {
                await this.pendingCommitPromise;
            } catch (err) {
                console.error('[StarMapView] Failed to save pending edits on navigate-away:', err);
            }
        } else if (this.isEditMode && this.usingRealBackend && this.selectedConstellation) {
            try {
                await this.flushEditSession(this.selectedConstellation, this.editSnapshot);
            } catch (err) {
                console.error('[StarMapView] Failed to save pending edits on navigate-away:', err);
            }
        }

        if (this.tickFn) {
            this.sceneEngine.unregisterTick(this.tickFn);
            this.tickFn = null;
        }

        // Disposes the planet orbit group before the localGroup teardown below
        // (it lives under a star gem, not directly under localGroup).
        this.teardownPlanetOrbits();

        if (this.pointerClickHandler) {
            window.removeEventListener('click', this.pointerClickHandler);
            this.pointerClickHandler = null;
        }
        if (this.mouseDownHandler) {
            this.renderer.domElement.removeEventListener('mousedown', this.mouseDownHandler);
            this.mouseDownHandler = null;
        }
        if (this.mouseUpHandler) {
            this.renderer.domElement.removeEventListener('mouseup', this.mouseUpHandler);
            this.mouseUpHandler = null;
        }
        if (this.wheelHandler) {
            this.renderer.domElement.removeEventListener('wheel', this.wheelHandler);
            this.wheelHandler = null;
        }

        // Edit-mode pointer/keyboard handlers. pointermove/up/cancel and
        // keydown are on window, so leaving them attached after the view is
        // gone would keep a dead view alive and double-handle drags on the
        // next mount.
        if (this.dragDownHandler) {
            this.renderer.domElement.removeEventListener('pointerdown', this.dragDownHandler);
            this.dragDownHandler = null;
        }
        if (this.dragMoveHandler) {
            window.removeEventListener('pointermove', this.dragMoveHandler);
            this.dragMoveHandler = null;
        }
        if (this.dragUpHandler) {
            window.removeEventListener('pointerup', this.dragUpHandler);
            window.removeEventListener('pointercancel', this.dragUpHandler);
            this.dragUpHandler = null;
        }
        if (this.editKeyHandler) {
            window.removeEventListener('keydown', this.editKeyHandler);
            this.editKeyHandler = null;
        }
        clearTimeout(this.toastTimer);
        this.isEditMode = false;
        this.drag = null;
        this.linkDrag = null;
        this.layoutTween = null;

        if (this.controls) {
            this.controls.dispose();
            this.controls = null;
        }

        const labelsContainer = document.getElementById('labels-container');
        if (labelsContainer) labelsContainer.innerHTML = '';

        if (this.localGroup) {
            this.localGroup.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach((m) => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                }
            });
            this.sceneEngine.removeOverlayMesh(this.localGroup);
            this.localGroup = null;
        }

        this.particleSystem = null;
        this.northStarMesh = null;
        this.northStarGlow = null;
        this.constellationsGroup = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
    }
}

export default StarMapView;
