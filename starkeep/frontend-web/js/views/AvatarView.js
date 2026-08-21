import * as THREE from 'three';
import { store } from '../store.js';
import { avatarApi } from '../avatarApi.js';
import { API_BASE } from '../config.js';
import { EARTH_RADIUS } from '../scene.js';

// Static assets (glyph SVGs) are served from the Django host itself, not
// under /api/v1 — strip that suffix off API_BASE to get the origin.
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '');

function resolveAssetUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Shared camera framing this view resets to on mount — StarMapView leaves
// the camera at a very different angle (0,20,140), so without this the
// background Earth/starfield would look wrong behind the profile cards.
// Matches HomeView's own framing exactly for visual continuity between them.
const CAMERA_FRAME_POS = new THREE.Vector3(0, 0, 7.2);
const CAMERA_FRAME_LOOKAT = new THREE.Vector3(0, 0, 0);

// World-Z depth the locked Earth sits at — same plane HomeView's Earth uses,
// so it doesn't change apparent size when it glides into the corner.
const EARTH_LOCK_Z = 0;

// World-Z depth the foreground mannequin sits at, relative to its own
// independent fgCamera (position (0,0,10)) — matches the Gemini reference.
const AVATAR_TARGET_Z = 2.2;

// Local Y of the mannequin's feet (bottom of the ankle joints in
// buildMannequin()) — used to project exactly where the feet land on
// screen each frame, so the locked Earth can be placed precisely under
// them rather than at a rough viewport fraction.
const MANNEQUIN_FEET_LOCAL_Y = -1.04;

// World-space gap between the Earth's rim and the feet anchor point. The
// Earth (radius EARTH_RADIUS ≈ 4.5) is huge relative to the camera distance
// here — its angular size exceeds the camera's own FOV — so centering the
// sphere directly ON the anchor point fills/darkens most of the screen with
// its near-invisible core color instead of showing a clean rim. Pushing the
// center down by a full radius (+ this gap) so only the TOP curve of the
// sphere reaches the anchor reproduces HomeView's own "big dome, mostly
// off-screen" look instead of a huge dark disc.
const EARTH_RIM_GAP = 0.6;

const ARCHETYPE_QUIZ_URL = 'https://starkeepacademy-production.up.railway.app/';

// Generic placeholder shown wherever a data-driven glyph (heroic/learning
// path SVG from the backend) is missing or fails to load, and for the
// always-static Alias/Purpose icons — same diamond-sigil motif throughout.
const PLACEHOLDER_GLYPH_SVG = `
    <svg viewBox="0 0 100 100">
        <polygon points="50,8 92,50 50,92 8,50" fill="none" stroke="currentColor" stroke-width="4"/>
        <circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" stroke-width="3"/>
    </svg>
`;

const ALIAS_SIGIL_SVG = `
    <svg viewBox="0 0 100 100">
        <polygon points="50,5 95,50 50,95 5,50" fill="none" stroke="currentColor" stroke-width="3"/>
        <circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="50" cy="50" r="14" fill="none" stroke="#ffffff" stroke-width="2"/>
        <polygon points="50,22 78,50 50,78 22,50" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
    </svg>
`;

const PURPOSE_ICON_SVG = `
    <svg viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="22" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M 18,44 L 30,12 L 42,44" fill="none" stroke="#ffffff" stroke-width="2"/>
        <line x1="14" y1="34" x2="46" y2="34" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="30" cy="12" r="3" fill="currentColor"/>
    </svg>
`;

// Ported from the Gemini Avatar.html reference — a decorative backplate
// behind the mannequin, low-opacity so it doesn't compete with card text.
const COAT_OF_ARMS_SVG = `
    <svg viewBox="0 0 300 350">
        <path d="M150 20 C180 50 220 30 250 60 C230 100 270 140 240 180 C210 210 230 260 150 320 C70 260 90 210 60 180 C30 140 70 100 50 60 C80 30 120 50 150 20 Z" fill="rgba(255,255,255,0.04)" stroke="rgba(0,243,255,0.3)" stroke-width="1.8"/>
        <path d="M150 40 L230 80 L220 180 C220 230 150 280 150 280 C150 280 80 230 80 180 L70 80 Z" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
        <path d="M50 60 C30 90 20 130 40 160 C10 140 20 100 50 60 Z" fill="rgba(0,243,255,0.08)"/>
        <path d="M250 60 C270 90 280 130 260 160 C290 140 280 100 250 60 Z" fill="rgba(0,243,255,0.08)"/>
        <path d="M40 290 Q150 330 260 290 L240 310 Q150 345 60 310 Z" fill="rgba(255,255,255,0.12)"/>
    </svg>
`;

const PLACEMENTS = [
    { key: 'sun', symbol: '☉', label: 'SUN', field: 'sun_sign' },
    { key: 'moon', symbol: '☽', label: 'MOON', field: 'moon_sign' },
    { key: 'rising', symbol: 'ASC', label: 'RISING', field: 'rising_sign' }
];

// Decorative-only birth-chart symbols — no backend fields exist for these
// yet (ArchetypeProfile only stores sun/moon/rising), so clicking one shows
// a "coming soon" state rather than fabricated astrology content.
const DECORATIVE_GLYPHS = ['☿', '♀', '♂', '♃', '♄', '♅', '♆', '♇', 'MC', 'IC', 'DSC', '☊'];

// Deliberately generic, not sign-specific — these are placeholders until
// real AI-personalized copy exists (per product decision), so they must not
// read as if they were already real astrology content.
const PLACEHOLDER_COPY = {
    sun: 'Your Sun sign colors your core identity and how you shine. A personalized reading from your quiz and AI data is coming soon.',
    moon: 'Your Moon sign shapes your emotional inner world. A personalized reading from your quiz and AI data is coming soon.',
    rising: 'Your Rising sign is the mask you show the world first. A personalized reading from your quiz and AI data is coming soon.'
};

export class AvatarView {
    constructor(router) {
        this.router = router;
        this.sceneEngine = null;
        this.scene = null;
        this.camera = null;

        this.avatarData = null;

        // Foreground (mannequin) — its own independent renderer/scene/camera,
        // sandwiched visually above the UI cards but below nothing else, per
        // the two-canvas reference design.
        this.fgCanvas = null;
        this.fgRenderer = null;
        this.fgScene = null;
        this.fgCamera = null;
        this.avatarGroup = null;
        this.mannequinFeetScreen = null;

        this.foregroundTickFn = null;
        this.earthLockTickFn = null;
        this.resizeHandler = null;
    }

    render() {
        return `
            <div class="avatar-view-wrapper" id="avatar-view-wrapper">
                <header class="header-bar">
                    <button class="back-btn-home" id="avatar-back-btn">&larr; MENU</button>
                    <div class="page-title">AVATAR</div>
                    <div class="system-status" id="avatar-status">SYNCING PROFILE...</div>
                </header>

                <div class="avatar-grid">
                    <div class="avatar-card avatar-profile-card" id="avatar-profile-card">
                        <div class="avatar-profile-header">
                            <div class="avatar-alias-sigil">${ALIAS_SIGIL_SVG}</div>
                            <div class="avatar-label-tiny">ALIAS</div>
                            <h2 class="avatar-alias-title" id="avatar-alias">—</h2>
                            <div class="avatar-divider-line"></div>
                        </div>

                        <div class="avatar-coat-of-arms">${COAT_OF_ARMS_SVG}</div>

                        <div id="avatar-anchor" class="avatar-anchor"></div>

                        <div class="avatar-profile-footer">
                            <div class="avatar-label-tiny">NAME</div>
                            <h3 class="avatar-real-name" id="avatar-display-name">—</h3>
                            <div class="avatar-label-tiny">POWERS</div>
                            <div class="avatar-powers" id="avatar-powers"></div>
                        </div>
                    </div>

                    <div class="avatar-card avatar-attributes-card" id="avatar-attributes-card">
                        <div class="avatar-attributes-header">
                            <span class="avatar-header-dash"></span>
                            <h2>ATTRIBUTES</h2>
                            <span class="avatar-header-dash"></span>
                        </div>

                        <div class="avatar-attributes-grid" id="avatar-attributes-grid">
                            <div class="avatar-symbolic-cell">
                                <div class="avatar-attr-label">LEVEL</div>
                                <div class="avatar-attr-sub">How far you've come</div>
                                <div class="avatar-val-huge" id="avatar-level-value">LVL —</div>
                            </div>
                            <div class="avatar-v-divider"></div>
                            <div class="avatar-detail-cell">
                                <h3 class="avatar-detail-title" id="avatar-hours-title">— HOURS OF IMPACT</h3>
                                <ul class="avatar-detail-list" id="avatar-hours-list"></ul>
                            </div>

                            <div class="avatar-row-separator"></div>

                            <div class="avatar-symbolic-cell">
                                <div class="avatar-attr-label">HEROIC PATH</div>
                                <div class="avatar-attr-sub">How you create impact</div>
                                <div class="avatar-path-glyph" id="avatar-heroic-path-glyph">${PLACEHOLDER_GLYPH_SVG}</div>
                            </div>
                            <div class="avatar-v-divider"></div>
                            <div class="avatar-detail-cell">
                                <h3 class="avatar-detail-title" id="avatar-heroic-path-title">—</h3>
                                <p class="avatar-detail-text" id="avatar-visionary-trait"></p>
                            </div>

                            <div class="avatar-row-separator"></div>

                            <div class="avatar-symbolic-cell">
                                <div class="avatar-attr-label">LEARNING PATH</div>
                                <div class="avatar-attr-sub">How you learn &amp; grow</div>
                                <div class="avatar-path-glyph" id="avatar-learning-path-glyph">${PLACEHOLDER_GLYPH_SVG}</div>
                            </div>
                            <div class="avatar-v-divider"></div>
                            <div class="avatar-detail-cell">
                                <h3 class="avatar-detail-title" id="avatar-learning-path-title">—</h3>
                                <p class="avatar-detail-text" id="avatar-divergent-trait"></p>
                            </div>

                            <div class="avatar-row-separator"></div>

                            <div id="avatar-archetype-section" class="avatar-archetype-section"></div>
                        </div>
                    </div>
                </div>

                <canvas id="avatar-fg-canvas" class="avatar-fg-canvas"></canvas>
            </div>
        `;
    }

    async mount({ scene, camera }) {
        this.sceneEngine = this.router.sceneEngine;
        this.scene = scene;
        this.camera = camera;

        this.sceneEngine.cameraTo(CAMERA_FRAME_POS, CAMERA_FRAME_LOOKAT, 900);

        document.getElementById('avatar-back-btn')?.addEventListener('click', () => {
            this.router.navigate('home');
        });

        this.initForeground();
        this.updateMannequinPose(0);
        this.lockEarthToAnchor(1100);

        await this.loadAvatarData();
        this.renderAvatarData();

        this.resizeHandler = this.onResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);

        this.foregroundTickFn = (delta, elapsed) => this.tickForeground(delta, elapsed);
        this.sceneEngine.registerTick(this.foregroundTickFn);

        this.earthLockTickFn = () => this.tickEarthLock();
        this.sceneEngine.registerTick(this.earthLockTickFn);
    }

    // ─── Data ───────────────────────────────────────────────────────────────

    /**
     * Dev-bypass sessions (store.devSeed()) have no real Avatar row to fetch
     * — same reasoning StarMapView's resetState() uses for the same check.
     */
    async loadAvatarData() {
        const usingDevBypass = !store.getState().isAuthenticated
            || localStorage.getItem('starkeep_web_dev_bypass') === '1';
        const stateAvatar = store.getState().user?.avatar;

        if (usingDevBypass) {
            this.avatarData = this.buildDevAvatarData(stateAvatar);
            return;
        }

        try {
            this.avatarData = await avatarApi.getAvatar(stateAvatar?.id);
        } catch (err) {
            console.error('[AvatarView] Failed to load avatar profile from the server:', err);
            this.avatarData = this.buildDevAvatarData(stateAvatar);
        }
    }

    buildDevAvatarData(stateAvatar) {
        const heroicSlug = stateAvatar?.heroic_path || '';
        const learningSlug = stateAvatar?.learning_path || '';
        return {
            id: stateAvatar?.id,
            alias: stateAvatar?.alias || 'UNKNOWN',
            display_name: stateAvatar?.display_name || '',
            level: stateAvatar?.level || 0,
            heroic_path: heroicSlug ? { slug: heroicSlug, display_name: capitalize(heroicSlug), campus: '', glyph_url: null } : null,
            learning_path: learningSlug ? { slug: learningSlug, display_name: capitalize(learningSlug), glyph_url: null } : null,
            purpose: '',
            powers: [],
            archetype: stateAvatar?.has_archetype ? {
                sun_sign: '', moon_sign: '', rising_sign: '',
                jung_archetype: '', mbti: '', visionary_trait: '', divergent_trait: '', purpose_seed: ''
            } : null,
            hours_of_impact: 0,
            impact_sources: []
        };
    }

    // ─── DOM population ─────────────────────────────────────────────────────

    renderAvatarData() {
        const avatar = this.avatarData || {};
        const statusEl = document.getElementById('avatar-status');
        if (statusEl) statusEl.textContent = 'PROFILE SYNCED';

        this.setText('avatar-alias', avatar.alias || '—');
        this.setText('avatar-display-name', avatar.display_name || '—');
        this.setText('avatar-level-value', `LVL ${avatar.level ?? 0}`);

        this.renderGlyph('avatar-heroic-path-glyph', avatar.heroic_path?.glyph_url);
        this.renderGlyph('avatar-learning-path-glyph', avatar.learning_path?.glyph_url);

        this.setText('avatar-heroic-path-title', (avatar.heroic_path?.display_name || 'Not yet chosen').toUpperCase());
        this.setText('avatar-visionary-trait', avatar.archetype?.visionary_trait || '');
        this.setText('avatar-learning-path-title', (avatar.learning_path?.display_name || 'Not yet chosen').toUpperCase());
        this.setText('avatar-divergent-trait', avatar.archetype?.divergent_trait || '');

        this.renderPowers(avatar.powers);
        this.renderHoursOfImpact(avatar.hours_of_impact, avatar.impact_sources);
        this.renderArchetypeSection(avatar.archetype);
    }

    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    /**
     * `container` holds the PLACEHOLDER_GLYPH_SVG markup by default (set in
     * render()). When a real glyph_url exists, swap it for an <img>; on
     * load failure (asset not actually deployed yet), fall back to the
     * placeholder rather than leaving a broken-image icon.
     */
    renderGlyph(id, glyphUrl) {
        const container = document.getElementById(id);
        if (!container) return;
        if (!glyphUrl) {
            container.innerHTML = PLACEHOLDER_GLYPH_SVG;
            return;
        }
        const img = document.createElement('img');
        img.alt = '';
        img.onerror = () => { container.innerHTML = PLACEHOLDER_GLYPH_SVG; };
        img.src = resolveAssetUrl(glyphUrl);
        container.innerHTML = '';
        container.appendChild(img);
    }

    renderPowers(powers) {
        const el = document.getElementById('avatar-powers');
        if (!el) return;
        el.innerHTML = '';
        if (!powers || powers.length === 0) {
            const span = document.createElement('span');
            span.className = 'avatar-powers-empty';
            span.textContent = 'No powers unlocked yet';
            el.appendChild(span);
            return;
        }
        powers.forEach((power) => {
            const span = document.createElement('span');
            span.className = 'avatar-power-badge';
            span.textContent = power;
            el.appendChild(span);
        });
    }

    renderHoursOfImpact(hours, sources) {
        this.setText('avatar-hours-title', `${hours ?? 0} HOURS OF IMPACT`);
        const list = document.getElementById('avatar-hours-list');
        if (!list) return;
        list.innerHTML = '';
        (sources || []).forEach((source) => {
            const li = document.createElement('li');
            li.textContent = `${source.label} (${source.hours} HRS)`;
            list.appendChild(li);
        });
    }

    renderArchetypeSection(archetype) {
        const section = document.getElementById('avatar-archetype-section');
        if (!section) return;

        if (!archetype) {
            section.innerHTML = `
                <div class="avatar-archetype-cta">
                    <h3 class="avatar-detail-title">DISCOVER YOUR ARCHETYPE</h3>
                    <p class="avatar-detail-text">Complete the archetype quiz to unlock your birth chart, Jungian archetype, MBTI type, and purpose statement.</p>
                    <button class="avatar-quiz-cta-btn" id="avatar-quiz-cta-btn">TAKE THE ARCHETYPE QUIZ</button>
                </div>
            `;
            document.getElementById('avatar-quiz-cta-btn')?.addEventListener('click', () => {
                window.open(ARCHETYPE_QUIZ_URL, '_blank', 'noopener,noreferrer');
            });
            return;
        }

        section.innerHTML = `
            <div class="avatar-symbolic-cell">
                <div class="avatar-attr-label">ARCHETYPES</div>
                <div class="avatar-attr-sub">Your tropes, themes &amp; story</div>
                <div class="avatar-astro-grid" id="avatar-astro-grid"></div>
            </div>
            <div class="avatar-v-divider"></div>
            <div class="avatar-detail-cell">
                <h3 class="avatar-detail-title" id="avatar-astro-title">—</h3>
                <p class="avatar-detail-text" id="avatar-astro-desc"></p>
                <p class="avatar-detail-note" id="avatar-astro-note"></p>
                <div class="avatar-archetypes-subgrid">
                    <div class="avatar-arch-col">
                        <div class="avatar-arch-header">. JUNG .</div>
                        <h4 class="avatar-arch-title">${archetype.jung_archetype ? archetype.jung_archetype.toUpperCase() : '—'}</h4>
                    </div>
                    <div class="avatar-arch-col">
                        <div class="avatar-arch-header">. MBTI .</div>
                        <h4 class="avatar-arch-title">${archetype.mbti || '—'}</h4>
                    </div>
                </div>
            </div>

            <div class="avatar-row-separator"></div>

            <div class="avatar-symbolic-cell">
                <div class="avatar-attr-label">PURPOSE</div>
                <div class="avatar-attr-sub">Your calling &amp; destiny</div>
                <div class="avatar-path-glyph avatar-purpose-icon">${PURPOSE_ICON_SVG}</div>
            </div>
            <div class="avatar-v-divider"></div>
            <div class="avatar-detail-cell">
                <h3 class="avatar-detail-title" id="avatar-purpose-title">—</h3>
            </div>
        `;

        const gridEl = document.getElementById('avatar-astro-grid');
        PLACEMENTS.forEach((p) => {
            const btn = document.createElement('button');
            btn.className = 'avatar-astro-glyph';
            btn.dataset.placement = p.key;
            btn.textContent = p.symbol;
            btn.title = p.label;
            gridEl.appendChild(btn);
        });
        DECORATIVE_GLYPHS.forEach((symbol) => {
            const btn = document.createElement('button');
            btn.className = 'avatar-astro-glyph avatar-astro-glyph--soon';
            btn.dataset.placement = 'soon';
            btn.textContent = symbol;
            btn.title = 'Coming soon';
            gridEl.appendChild(btn);
        });
        gridEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.avatar-astro-glyph');
            if (btn) this.selectPlacement(btn.dataset.placement);
        });

        this.setText('avatar-purpose-title', this.avatarData?.purpose || archetype.purpose_seed || 'Not yet defined');

        this.selectPlacement('sun');
    }

    selectPlacement(key) {
        document.querySelectorAll('.avatar-astro-glyph').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.placement === key);
        });

        const titleEl = document.getElementById('avatar-astro-title');
        const descEl = document.getElementById('avatar-astro-desc');
        const noteEl = document.getElementById('avatar-astro-note');
        if (!titleEl || !descEl || !noteEl) return;

        if (key === 'soon') {
            titleEl.textContent = 'COMING SOON';
            descEl.textContent = 'Full birth chart placements (Mercury, Venus, Mars, and more) will unlock in a future update.';
            noteEl.textContent = '';
            return;
        }

        const placement = PLACEMENTS.find((p) => p.key === key);
        const sign = this.avatarData?.archetype?.[placement.field];

        if (!sign) {
            titleEl.textContent = `${placement.label} — UNKNOWN`;
            descEl.textContent = 'This placement hasn\'t been recorded yet.';
            noteEl.textContent = '';
            return;
        }

        titleEl.textContent = `${placement.label} IN ${sign.toUpperCase()}`;
        descEl.textContent = PLACEHOLDER_COPY[key];
        noteEl.textContent = 'AI-personalized description coming soon.';
    }

    // ─── Persistent Earth lock ──────────────────────────────────────────────
    // Anchored to the mannequin's own projected feet position (computed each
    // frame in updateMannequinPose()) rather than a fixed DOM element, so the
    // Earth sits precisely under the feet in screen space regardless of
    // viewport size or where the profile card ends up.

    computeEarthAnchorWorldPos() {
        if (!this.mannequinFeetScreen || !this.sceneEngine) return null;
        const px = this.mannequinFeetScreen.x;
        const py = this.mannequinFeetScreen.y;
        const ndcX = (px / window.innerWidth) * 2 - 1;
        const ndcY = -((py / window.innerHeight) * 2 - 1);
        const rimPos = this.sceneEngine.screenAnchorToWorld(ndcX, ndcY, EARTH_LOCK_Z);
        if (!rimPos) return null;
        rimPos.y -= (EARTH_RADIUS + EARTH_RIM_GAP);
        return rimPos;
    }

    lockEarthToAnchor(duration) {
        const worldPos = this.computeEarthAnchorWorldPos();
        if (worldPos) this.sceneEngine.moveEarthTo(worldPos, duration);
    }

    tickEarthLock() {
        if (!this.sceneEngine?.earthGroup || this.sceneEngine.isAnimatingEarth) return;
        const worldPos = this.computeEarthAnchorWorldPos();
        if (worldPos) this.sceneEngine.earthGroup.position.copy(worldPos);
    }

    // ─── Foreground mannequin (full port, own canvas/renderer) ─────────────

    initForeground() {
        this.fgCanvas = document.getElementById('avatar-fg-canvas');
        if (!this.fgCanvas) return;

        this.fgScene = new THREE.Scene();
        this.fgCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.fgCamera.position.set(0, 0, 10);
        // A brand-new camera's matrixWorld is only computed lazily during
        // render() — but updateMannequinPose() unprojects through it
        // synchronously below, before the first fgRenderer.render() call
        // ever runs. Without this, that first computation (which seeds the
        // Earth's initial glide target via lockEarthToAnchor()) unprojects
        // through a stale identity matrix and produces a bogus target, so
        // the Earth appears to glide partway then snap once later frames
        // (post-render, matrixWorld now valid) correct it.
        this.fgCamera.updateMatrixWorld(true);

        this.fgRenderer = new THREE.WebGLRenderer({ canvas: this.fgCanvas, antialias: true, alpha: true });
        this.fgRenderer.setSize(window.innerWidth, window.innerHeight);
        this.fgRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.avatarGroup = this.buildMannequin();
        this.fgScene.add(this.avatarGroup);
    }

    /**
     * True 3D joint rig — a sphere at every joint, a capsule oriented via
     * quaternion (not a single Z-axis Euler rotation, which is what made the
     * previous cylinder-based arms look flat/broken) between each pair of
     * joints. Relaxed arms-down standing pose, matching the reference photo
     * rather than the wide T-pose splay the earlier version used.
     */
    buildMannequin() {
        const group = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98 });
        const UP = new THREE.Vector3(0, 1, 0);

        const joint = (pos, radius) => {
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16), mat);
            mesh.position.copy(pos);
            group.add(mesh);
            return mesh;
        };

        const bone = (a, b, radius) => {
            const dir = new THREE.Vector3().subVectors(b, a);
            const dist = dir.length();
            const length = Math.max(dist - radius * 2, 0.01);
            const geo = new THREE.CapsuleGeometry(radius, length, 4, 8);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.addVectors(a, b).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
            group.add(mesh);
            return mesh;
        };

        const V = (x, y, z) => new THREE.Vector3(x, y, z);

        const shoulderL = V(-0.34, 0.95, 0), shoulderR = V(0.34, 0.95, 0);
        const chestTop = V(0, 0.95, 0), chestBottom = V(0, 0.62, 0), waistBottom = V(0, 0.30, 0);
        const hipCenter = V(0, 0.28, 0), hipL = V(-0.15, 0.28, 0), hipR = V(0.15, 0.28, 0);
        const elbowL = V(-0.46, 0.55, 0.06), elbowR = V(0.46, 0.55, 0.06);
        const wristL = V(-0.44, 0.15, 0.12), wristR = V(0.44, 0.15, 0.12);
        const kneeL = V(-0.17, -0.32, 0.02), kneeR = V(0.17, -0.32, 0.02);
        const ankleL = V(-0.20, MANNEQUIN_FEET_LOCAL_Y, 0.05), ankleR = V(0.20, MANNEQUIN_FEET_LOCAL_Y, 0.05);

        joint(V(0, 1.25, 0), 0.24); // head
        bone(V(0, 1.1, 0), chestTop, 0.09); // neck
        joint(shoulderL, 0.11);
        joint(shoulderR, 0.11);
        bone(chestTop, chestBottom, 0.30); // chest
        bone(chestBottom, waistBottom, 0.22); // waist
        joint(hipCenter, 0.24);

        bone(shoulderL, elbowL, 0.095);
        joint(elbowL, 0.09);
        bone(elbowL, wristL, 0.075);
        joint(wristL, 0.085);

        bone(shoulderR, elbowR, 0.095);
        joint(elbowR, 0.09);
        bone(elbowR, wristR, 0.075);
        joint(wristR, 0.085);

        bone(hipL, kneeL, 0.12);
        joint(kneeL, 0.11);
        bone(kneeL, ankleL, 0.09);
        joint(ankleL, 0.09);

        bone(hipR, kneeR, 0.12);
        joint(kneeR, 0.11);
        bone(kneeR, ankleR, 0.09);
        joint(ankleR, 0.09);

        return group;
    }

    /**
     * Projects the anchor-target position + gentle float onto avatarGroup,
     * then re-derives the feet's own screen position from that — the single
     * source of truth tickEarthLock() reads from (see computeEarthAnchorWorldPos()
     * above). Also called once synchronously at mount (elapsed=0) so the
     * Earth's very first glide has a real target instead of waiting a frame.
     */
    updateMannequinPose(elapsed) {
        const anchorEl = document.getElementById('avatar-anchor');
        if (!anchorEl || !this.avatarGroup || !this.fgCamera) return;

        const rect = anchorEl.getBoundingClientRect();
        const ndcX = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
        const ndcY = -((rect.top + rect.height / 2) / window.innerHeight) * 2 + 1;

        const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
        vec.unproject(this.fgCamera);
        const dir = vec.sub(this.fgCamera.position).normalize();
        const dist = (AVATAR_TARGET_Z - this.fgCamera.position.z) / dir.z;
        const pos = this.fgCamera.position.clone().add(dir.multiplyScalar(dist));

        this.avatarGroup.position.x = pos.x;
        this.avatarGroup.position.y = pos.y + Math.sin(elapsed * 1.8) * 0.06;
        this.avatarGroup.position.z = AVATAR_TARGET_Z;

        const feetWorld = new THREE.Vector3(
            this.avatarGroup.position.x,
            this.avatarGroup.position.y + MANNEQUIN_FEET_LOCAL_Y,
            this.avatarGroup.position.z
        );
        feetWorld.project(this.fgCamera);
        this.mannequinFeetScreen = {
            x: (feetWorld.x * 0.5 + 0.5) * window.innerWidth,
            y: (-(feetWorld.y * 0.5) + 0.5) * window.innerHeight
        };
    }

    tickForeground(delta, elapsed) {
        if (!this.fgRenderer) return;
        this.updateMannequinPose(elapsed);
        this.fgRenderer.render(this.fgScene, this.fgCamera);
    }

    onResize() {
        if (!this.fgRenderer || !this.fgCamera) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.fgCamera.aspect = w / h;
        this.fgCamera.updateProjectionMatrix();
        this.fgRenderer.setSize(w, h);
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    destroy() {
        if (this.foregroundTickFn) this.sceneEngine?.unregisterTick(this.foregroundTickFn);
        if (this.earthLockTickFn) this.sceneEngine?.unregisterTick(this.earthLockTickFn);
        if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);

        if (this.avatarGroup) {
            this.avatarGroup.traverse((object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) object.material.dispose();
            });
        }
        if (this.fgRenderer) this.fgRenderer.dispose();

        this.fgRenderer = null;
        this.fgScene = null;
        this.fgCamera = null;
        this.avatarGroup = null;
    }
}

export default AvatarView;
