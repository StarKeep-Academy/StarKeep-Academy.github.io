import * as THREE from 'three';
import { store } from '../store.js';
import { authApi, ApiError } from '../api.js';
import { IS_LOCAL_DEV } from '../config.js';

export class HomeView {
    constructor(router) {
        this.router = router;

        // View State & Animation Handlers
        this.animFrameId = null;
        this.resizeHandler = null;
        this.titleTimer = null;
        this.hoveredItem = null;

        // Auth gate state
        this.authMode = 'login'; // 'login' | 'register'
        this.authToastTimer = null;
        this.storeUnsubscribe = null;

        // 3D Scene Local References
        this.scene = null;
        this.camera = null;
        this.localGroup = new THREE.Group();
        // Reference to the persistent, scene.js-owned Earth (shared across
        // views so it can glide between them) — not created/disposed here.
        this.earthGroup = null;
        this.arrowGroup = null;
        this.earthTickFn = null;

        // Mechanics & Positions
        this.earthPosition3D = new THREE.Vector3(0, 4.3, 0);
        this.nodeRadius3D = 5.4;

        this.targetZOffset = 0;
        this.currentZOffset = 0;

        this.defaultTitle = "STARKEEP ACADEMY";

        // Navigation Data Configuration
        this.navigationData = [
            {
                id: "avatar",
                title: "AVATAR",
                // A subitem may be a bare label (clicking it just opens the
                // node's own route) or {label, route} to go somewhere of its
                // own — account/identity lives on its own page, apart from the
                // Avatar view's paths-and-archetype content.
                subitems: [
                    { label: "PROFILE", route: "profile" },
                    "ARCHETYPES",
                    "HEROIC PATH",
                    "LEARNING PATH"
                ],
                route: "avatar",
                screenAngle: 140 * (Math.PI / 180)
            },
            {
                id: "starmaps",
                title: "STAR MAPS",
                subitems: ["CREATE STARS", "CONSTELLATIONS", "MILESTONES"],
                route: "starmap",
                screenAngle: 115 * (Math.PI / 180)
            },
            {
                id: "academy",
                title: "ACADEMY",
                subitems: ["GUILDS", "ALLIANCES", "ALLIES", "COMMUNITY FEED"],
                route: "academy",
                screenAngle: 90 * (Math.PI / 180)
            },
            {
                id: "missions",
                title: "MISSION LOG",
                subitems: ["RECORD", "MISSIONS", "QUESTS"],
                route: "missions",
                screenAngle: 65 * (Math.PI / 180)
            },
            {
                id: "lux",
                title: "LUX WALLET",
                subitems: ["WALLET", "TRADE", "DONATE", "TRANSACTIONS"],
                route: "lux",
                screenAngle: 40 * (Math.PI / 180)
            }
        ];
    }

    render() {
        // store.init() (main.js) always resolves before the router's first
        // handleRoute() call, so this is never stale on first paint — no
        // flash of the wrong gate state.
        const isAuthenticated = store.getState().isAuthenticated;
        return `
            <style>
                .home-view-wrapper {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 2;
                    overflow: hidden;
                    /* Base/fallback for anything not more specifically
                       styled below — body-text font, matching the rest of
                       the app's --font-sans. Titles and menu items set
                       their own font-family explicitly; buttons get theirs
                       from the global button rule in styles.css. */
                    font-family: 'Michroma', sans-serif;
                    color: #ffffff;
                }

                .section-title {
                    position: absolute;
                    top: 6vh;
                    left: 50%;
                    transform: translateX(-50%) translateY(-12px);
                    font-family: 'Syncopate', sans-serif;
                    font-size: 2.75rem;
                    font-weight: 400;
                    letter-spacing: 0.35em;
                    text-transform: uppercase;
                    color: #ffffff;
                    text-shadow: 0 0 20px rgba(255, 255, 255, 0.8), 0 0 40px rgba(0, 243, 255, 0.6);
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.25s;
                    pointer-events: none;
                    white-space: nowrap;
                    z-index: 5;
                }

                .section-title.visible {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(-50%) translateY(0);
                }

                .nav-nodes-container {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 10;
                    opacity: 0;
                    transition: opacity 0.35s ease-in-out;
                }

                .nav-nodes-container.ready {
                    opacity: 1;
                }

                .nav-node {
                    position: absolute;
                    top: -9999px;
                    left: -9999px;
                    width: 64px;
                    height: 64px;
                    transform: translate(-50%, -50%);
                    pointer-events: auto;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .node-icon {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: rgba(10, 16, 30, 0.85);
                    border: 2px solid rgba(0, 243, 255, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(8px);
                    box-shadow: 0 0 15px rgba(0, 0, 0, 0.9), inset 0 0 12px rgba(0, 243, 255, 0.2);
                    transition: all 0.25s ease;
                }

                .node-icon svg {
                    width: 28px;
                    height: 28px;
                    fill: none;
                    stroke: #ffffff;
                    stroke-width: 1.8;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                    transition: all 0.25s ease;
                }

                .nav-node:hover .node-icon,
                .nav-node.active .node-icon {
                    border-color: #00f3ff;
                    background: rgba(28, 75, 176, 0.95);
                    box-shadow: 0 0 30px rgba(0, 243, 255, 0.6), inset 0 0 15px rgba(0, 243, 255, 0.7);
                    transform: scale(1.18);
                }

                .nav-node:hover .node-icon svg,
                .nav-node.active .node-icon svg {
                    stroke: #ffffff;
                    filter: drop-shadow(0 0 8px #ffffff);
                }

                .node-submenu {
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    margin-top: 16px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity 0.25s ease, transform 0.25s ease, visibility 0.25s;
                    pointer-events: auto;
                    white-space: nowrap;
                    z-index: 15;
                }

                .nav-node:hover .node-submenu,
                .nav-node.active .node-submenu {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(-50%) translateY(0);
                }

                .submenu-item {
                    font-family: 'Syncopate', sans-serif;
                    font-size: 0.75rem;
                    font-weight: 400;
                    letter-spacing: 0.18em;
                    color: #8e9bb0;
                    text-transform: uppercase;
                    padding: 6px 14px;
                    border-radius: 16px;
                    background: rgba(18, 24, 38, 0.85);
                    border: 1px solid rgba(0, 243, 255, 0.25);
                    backdrop-filter: blur(8px);
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .submenu-item:hover {
                    color: #00f3ff;
                    border-color: #00f3ff;
                    background: rgba(0, 243, 255, 0.2);
                    box-shadow: 0 0 12px rgba(0, 243, 255, 0.6);
                    transform: scale(1.05);
                }

                .footer-bar {
                    position: absolute;
                    bottom: 25px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 90%;
                    max-width: 1200px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-family: 'Michroma', sans-serif;
                    font-size: 0.75rem;
                    color: #8e9bb0;
                    letter-spacing: 0.1em;
                    border-top: 1px solid rgba(255, 255, 255, 0.12);
                    padding-top: 15px;
                    pointer-events: auto;
                    z-index: 10;
                }

                .status-tag {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #00f3ff;
                    box-shadow: 0 0 10px #00f3ff;
                }

                .enter-btn {
                    background: transparent;
                    border: 1px solid #00f3ff;
                    color: #00f3ff;
                    padding: 10px 28px;
                    /* font-family intentionally not set here — the global
                       button rule in styles.css (Michroma, !important)
                       covers every button app-wide, this one included. */
                    font-size: 0.85rem;
                    font-weight: 700;
                    letter-spacing: 0.25em;
                    border-radius: 20px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .enter-btn:hover {
                    background: #00f3ff;
                    color: #060911;
                    box-shadow: 0 0 25px rgba(0, 243, 255, 0.6);
                }

                /* Used only for the auth-gate-critical elements (nav icons,
                   ENTER DOMAIN, SIGN OUT, the auth overlay itself) instead of
                   Tailwind's .hidden utility. Tailwind CDN compiles/injects its
                   utility stylesheet asynchronously as it scans the DOM (see
                   styles.css's .font-hud comment for the same issue elsewhere
                   this session) — for a login gate that async window is a real
                   flash-of-unauthenticated-content risk, not just a cosmetic
                   one, so this class lives in this view's own synchronously-
                   loaded <style> block instead. */
                .locked-hidden {
                    display: none !important;
                }

                .footer-right-group {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }

                .sign-out-btn {
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: #8e9bb0;
                    padding: 6px 16px;
                    font-size: 0.7rem;
                    letter-spacing: 0.15em;
                    border-radius: 16px;
                    cursor: pointer;
                    transition: all 0.25s ease;
                }

                .sign-out-btn:hover {
                    border-color: #E25B5B;
                    color: #E25B5B;
                }

                .auth-toggle-link {
                    color: #00f3ff;
                    cursor: pointer;
                    text-decoration: none;
                }

                .auth-toggle-link:hover {
                    text-decoration: underline;
                }

                .auth-error-banner {
                    background: rgba(226, 91, 91, 0.12);
                    border: 1px solid #E25B5B;
                    border-radius: 8px;
                    padding: 10px;
                    margin-bottom: 14px;
                    color: #E25B5B;
                    font-size: 0.75rem;
                    text-align: center;
                }

                .auth-field-error {
                    color: #E25B5B;
                    font-size: 0.68rem;
                    margin-top: 4px;
                }
            </style>

            <div class="home-view-wrapper" id="home-ui-container">
                <div id="section-title" class="section-title visible">STARKEEP ACADEMY</div>

                <div class="nav-nodes-container ${isAuthenticated ? '' : 'locked-hidden'}" id="nav-nodes-container">
                    <!-- Avatar Node -->
                    <div class="nav-node" data-id="avatar" id="node-avatar">
                        <div class="node-icon">
                            <svg viewBox="0 0 24 24">
                                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                <polyline points="2 17 12 22 22 17"></polyline>
                                <polyline points="2 12 12 17 22 12"></polyline>
                            </svg>
                        </div>
                        <div class="node-submenu" id="submenu-avatar"></div>
                    </div>

                    <!-- Star Maps Node -->
                    <div class="nav-node" data-id="starmaps" id="node-starmaps">
                        <div class="node-icon">
                            <svg viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="3"></circle>
                                <circle cx="19" cy="5" r="2"></circle>
                                <circle cx="5" cy="19" r="2"></circle>
                                <path d="M12 9V5M12 15v4M15 12h4M9 12H5"></path>
                            </svg>
                        </div>
                        <div class="node-submenu" id="submenu-starmaps"></div>
                    </div>

                    <!-- Academy Node -->
                    <div class="nav-node" data-id="academy" id="node-academy">
                        <div class="node-icon">
                            <svg viewBox="0 0 24 24">
                                <path d="M18 12c0 3-2.5 5.5-5.5 5.5S7 15 7 12s2.5-5.5 5.5-5.5S18 9 18 12z"></path>
                                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path>
                            </svg>
                        </div>
                        <div class="node-submenu" id="submenu-academy"></div>
                    </div>

                    <!-- Mission Log Node -->
                    <div class="nav-node" data-id="missions" id="node-missions">
                        <div class="node-icon">
                            <svg viewBox="0 0 24 24">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <path d="M9 3v18M15 3v18M3 9h18M3 15h18"></path>
                            </svg>
                        </div>
                        <div class="node-submenu" id="submenu-missions"></div>
                    </div>

                    <!-- LUX Wallet Node -->
                    <div class="nav-node" data-id="lux" id="node-lux">
                        <div class="node-icon">
                            <svg viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="9"></circle>
                                <path d="M12 3v18M3 12h18M7.5 7.5l9 9M16.5 7.5l-9 9"></path>
                            </svg>
                        </div>
                        <div class="node-submenu" id="submenu-lux"></div>
                    </div>
                </div>

                <div class="footer-bar">
                    <div class="status-tag">
                        <div class="status-dot"></div>
                        <span>ATLAS // SYSTEM ONLINE</span>
                    </div>
                    <button class="enter-btn ${isAuthenticated ? '' : 'locked-hidden'}" id="enter-btn">ENTER DOMAIN</button>
                    <div class="footer-right-group">
                        <button class="sign-out-btn ${isAuthenticated ? '' : 'locked-hidden'}" id="sign-out-btn">SIGN OUT</button>
                        <div>VER 2.7.0</div>
                    </div>
                </div>

                <!-- Auth gate (DEC-011): blocks the menu/footer CTAs until the
                     user signs in or creates an account. The earth keeps
                     rotating behind it as ambient backdrop. -->
                <div class="modal-overlay ${isAuthenticated ? 'locked-hidden' : ''}" id="auth-overlay">
                    <div class="modal-content" style="width: 420px; max-width: 90%; position: relative;">
                        <div class="text-center" style="font-family: 'Syncopate', sans-serif; letter-spacing: 0.3em; font-size: 0.8rem; color: #00f3ff; margin-bottom: 8px;">STARKEEP ACADEMY</div>
                        <h2 id="auth-title" class="text-center" style="font-family: 'Syncopate', sans-serif; letter-spacing: 0.15em; font-size: 1.25rem; margin-bottom: 20px;">SIGN IN</h2>

                        <div id="auth-error-banner" class="auth-error-banner hidden"></div>

                        <div class="mb-3">
                            <input id="auth-email" type="email" placeholder="Email" autocomplete="email"
                                class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-hud text-slate-200 tracking-wide focus:outline-none focus:border-cyan-400/60" />
                            <div id="auth-email-error" class="auth-field-error hidden"></div>
                        </div>

                        <div class="mb-3">
                            <input id="auth-password" type="password" placeholder="Password" autocomplete="current-password"
                                class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-hud text-slate-200 tracking-wide focus:outline-none focus:border-cyan-400/60" />
                            <div id="auth-password-error" class="auth-field-error hidden"></div>
                        </div>

                        <div class="mb-3 hidden" id="auth-displayname-field">
                            <input id="auth-displayname" type="text" placeholder="Display Name (optional)" autocomplete="name"
                                class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-hud text-slate-200 tracking-wide focus:outline-none focus:border-cyan-400/60" />
                        </div>

                        <button id="auth-submit-btn" class="btn-nebula w-full py-2.5 rounded-lg text-xs tracking-wider" style="margin-top: 4px;">SIGN IN</button>

                        <div class="flex items-center gap-3" style="margin: 16px 0;">
                            <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.12);"></div>
                            <span class="text-[10px] font-hud" style="color: #8e9bb0; letter-spacing: 0.15em;">OR</span>
                            <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.12);"></div>
                        </div>

                        <button id="auth-google-btn" class="btn-nebula w-full py-2 rounded-lg text-[11px] tracking-wider" style="margin-bottom: 8px;">CONTINUE WITH GOOGLE</button>
                        <button id="auth-apple-btn" class="btn-nebula w-full py-2 rounded-lg text-[11px] tracking-wider">CONTINUE WITH APPLE</button>

                        <div class="text-center text-xs font-hud" style="margin-top: 18px; color: #8e9bb0;">
                            <span id="auth-toggle-text">Don't have an account? </span><a href="#" id="auth-toggle-link" class="auth-toggle-link">Join the Academy</a>
                        </div>

                        ${IS_LOCAL_DEV ? `
                        <div class="text-center" style="margin-top: 14px;">
                            <a href="#" id="auth-dev-skip" style="color: #4a5568; font-size: 0.62rem; letter-spacing: 0.08em; text-decoration: underline; cursor: pointer;">DEV: Skip login (localhost only)</a>
                        </div>
                        ` : ''}

                        <div id="auth-toast" class="edit-toast"></div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Dual protocol support for SPA routing (mount / init)
     */
    async init(params) {
        this.mount(params);
    }

    mount(options = {}) {
        const { scene, camera } = options;

        // Context fallback for global engine or passed context
        this.scene = scene || window.sceneEngine?.scene || options.sceneEngine?.scene;
        this.camera = camera || window.sceneEngine?.camera || options.sceneEngine?.camera;

        this.frameCamera();

        if (this.scene) {
            this.scene.add(this.localGroup);
            this.init3DOverlays();
        }

        const sceneEngine = this.router?.sceneEngine;
        if (sceneEngine) {
            sceneEngine.moveEarthTo(this.earthPosition3D, 900);
            this.earthGroup = sceneEngine.earthGroup;
            this.earthTickFn = () => this.tickEarth();
            sceneEngine.registerTick(this.earthTickFn);
        }

        this.populateSubmenus();
        this.bindEvents();
        this.bindAuthEvents();
        this.updateAuthFormMode();

        // Defense-in-depth beyond the render()-time class computation: if
        // auth state changes while this view is mounted (sign-out, or a
        // token silently expiring), reflect it immediately rather than only
        // on the next full re-render.
        this.storeUnsubscribe = store.subscribe((state) => this.applyAuthGate(state.isAuthenticated));

        this.resizeHandler = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);

        requestAnimationFrame(() => {
            this.updateNodePositions();
            const container = document.getElementById('nav-nodes-container');
            if (container) container.classList.add('ready');
        });

        this.animate();
    }

    // ─── Auth Gate ──────────────────────────────────────────────────────────

    bindAuthEvents() {
        document.getElementById('auth-toggle-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.authMode = this.authMode === 'login' ? 'register' : 'login';
            this.updateAuthFormMode();
        });

        document.getElementById('auth-submit-btn')?.addEventListener('click', () => this.handleAuthSubmit());
        document.getElementById('auth-password')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleAuthSubmit();
        });

        document.getElementById('auth-google-btn')?.addEventListener('click', () => this.showAuthToast('Google sign-in is coming soon.'));
        document.getElementById('auth-apple-btn')?.addEventListener('click', () => this.showAuthToast('Apple sign-in is coming soon.'));

        document.getElementById('sign-out-btn')?.addEventListener('click', () => this.handleSignOut());

        document.getElementById('auth-dev-skip')?.addEventListener('click', (e) => {
            e.preventDefault();
            store.devSeed();
            this.applyAuthGate(true);
        });
    }

    updateAuthFormMode() {
        const isRegister = this.authMode === 'register';

        const title = document.getElementById('auth-title');
        const submitBtn = document.getElementById('auth-submit-btn');
        const displayNameField = document.getElementById('auth-displayname-field');
        const toggleText = document.getElementById('auth-toggle-text');
        const toggleLink = document.getElementById('auth-toggle-link');

        if (title) title.innerText = isRegister ? 'CREATE ACCOUNT' : 'SIGN IN';
        if (submitBtn) submitBtn.innerText = isRegister ? 'CREATE ACCOUNT' : 'SIGN IN';
        displayNameField?.classList.toggle('hidden', !isRegister);
        if (toggleText) toggleText.innerText = isRegister ? 'Already have an account? ' : "Don't have an account? ";
        if (toggleLink) toggleLink.innerText = isRegister ? 'Sign In' : 'Join the Academy';

        this.clearAuthErrors();
    }

    clearAuthErrors() {
        document.getElementById('auth-error-banner')?.classList.add('hidden');
        document.getElementById('auth-email-error')?.classList.add('hidden');
        document.getElementById('auth-password-error')?.classList.add('hidden');
    }

    showAuthError(message) {
        const banner = document.getElementById('auth-error-banner');
        if (banner) {
            banner.innerText = message;
            banner.classList.remove('hidden');
        }
    }

    showAuthFieldError(field, message) {
        const el = document.getElementById(`auth-${field}-error`);
        if (el) {
            el.innerText = message;
            el.classList.remove('hidden');
        }
    }

    showAuthToast(message) {
        const toast = document.getElementById('auth-toast');
        if (!toast) return;
        toast.innerText = message;
        toast.classList.add('is-visible');
        clearTimeout(this.authToastTimer);
        this.authToastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
    }

    async handleAuthSubmit() {
        this.clearAuthErrors();

        const email = document.getElementById('auth-email')?.value.trim() ?? '';
        const password = document.getElementById('auth-password')?.value ?? '';
        const displayName = document.getElementById('auth-displayname')?.value.trim() ?? '';
        const isRegister = this.authMode === 'register';

        let hasError = false;
        if (!email) { this.showAuthFieldError('email', 'Email is required.'); hasError = true; }
        if (!password) {
            this.showAuthFieldError('password', 'Password is required.');
            hasError = true;
        } else if (isRegister && password.length < 8) {
            this.showAuthFieldError('password', 'Password must be at least 8 characters.');
            hasError = true;
        }
        if (hasError) return;

        const submitBtn = document.getElementById('auth-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = isRegister ? 'CREATING...' : 'SIGNING IN...';
        }

        try {
            const result = isRegister
                ? await authApi.register({ email, password, displayName })
                : await authApi.login({ email, password });
            await store.login(result.access, result.refresh);
            this.applyAuthGate(true);
        } catch (err) {
            if (err instanceof ApiError && err.invalidParams?.length) {
                let mapped = false;
                for (const p of err.invalidParams) {
                    if (p.field === 'email') { this.showAuthFieldError('email', p.message); mapped = true; }
                    if (p.field === 'password') { this.showAuthFieldError('password', p.message); mapped = true; }
                }
                if (!mapped) this.showAuthError(err.detail);
            } else {
                this.showAuthError(err instanceof ApiError ? err.detail : 'Something went wrong. Please try again.');
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = isRegister ? 'CREATE ACCOUNT' : 'SIGN IN';
            }
        }
    }

    async handleSignOut() {
        await store.logout();
        this.applyAuthGate(false);
    }

    /**
     * Toggles every auth-gate-critical element in one place. Called from
     * render()'s initial class computation's JS-side counterpart (login/
     * logout DOM patches, no full re-render needed) and from the store
     * subscription above.
     */
    applyAuthGate(isAuthenticated) {
        document.getElementById('auth-overlay')?.classList.toggle('locked-hidden', isAuthenticated);
        document.getElementById('nav-nodes-container')?.classList.toggle('locked-hidden', !isAuthenticated);
        document.getElementById('enter-btn')?.classList.toggle('locked-hidden', !isAuthenticated);
        document.getElementById('sign-out-btn')?.classList.toggle('locked-hidden', !isAuthenticated);
    }

    /**
     * Frames the radial-nav hub: earth big and biased toward the top of the
     * viewport, node ring (which sits below earthPosition3D) reading lower on
     * screen. Without this the view just inherits whatever camera position/lookAt
     * the shell happened to be left at (e.g. StarMapView's own framing), which
     * can put the earth anywhere from a tiny dot to filling the whole screen.
     */
    frameCamera() {
        if (!this.camera) return;

        // Calibrated against the reference Homepage.html, which uses
        // PerspectiveCamera(45deg) at position (0,0,10) with NO lookAt call —
        // the earth (sitting at world Y=4.3) simply clips off the top edge
        // because the camera looks straight at the origin while earth sits
        // high above it. This engine's shared camera is fixed at 60deg FOV
        // (StarMapView is tuned around it), so the distance is scaled to the
        // 60deg-equivalent that reproduces the same on-screen framing:
        // d60 = d45 * tan(22.5deg) / tan(30deg) = 10 * 0.7174 = 7.17.
        // Node positions aren't hardcoded anywhere — they're recomputed every
        // frame from the live camera in updateNodePositions(), so they
        // automatically rescale/reflow with this framing.
        const targetPos = new THREE.Vector3(0, 0, 7.2);
        const targetLookAt = new THREE.Vector3(0, 0, 0);

        const sceneEngine = this.router?.sceneEngine;
        if (sceneEngine && typeof sceneEngine.cameraTo === 'function') {
            sceneEngine.cameraTo(targetPos, targetLookAt, 900);
        } else {
            this.camera.position.copy(targetPos);
            this.camera.lookAt(targetLookAt);
        }
    }

    init3DOverlays() {
        // The Earth sphere AND its atmosphere glow are now persistent,
        // scene.js-owned (see mount() -> sceneEngine.moveEarthTo()) so both
        // can glide together between views instead of being rebuilt here
        // every time. This view still owns the pointer arrow below, which
        // stays fixed at earthPosition3D — exactly where moveEarthTo()
        // places the shared Earth while HomeView is mounted.

        // Radial Pointer Arrow Group
        this.arrowGroup = new THREE.Group();
        this.arrowGroup.position.copy(this.earthPosition3D);
        this.localGroup.add(this.arrowGroup);

        const baseR = 4.52;

        const glowShape = new THREE.Shape();
        const glowW = 0.52;
        const glowH = 0.26;
        glowShape.moveTo(-glowW / 2, -baseR + 0.03);
        glowShape.lineTo(glowW / 2, -baseR + 0.03);
        glowShape.lineTo(0, -baseR - glowH - 0.05);
        glowShape.closePath();

        const glowShapeGeo = new THREE.ShapeGeometry(glowShape);
        const glowShapeMat = new THREE.MeshBasicMaterial({
            color: 0x00f3ff,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        const glowShapeMesh = new THREE.Mesh(glowShapeGeo, glowShapeMat);
        glowShapeMesh.renderOrder = 998;
        this.arrowGroup.add(glowShapeMesh);

        const triShape = new THREE.Shape();
        const sideWidth = 0.46;
        const triHeight = 0.20;
        triShape.moveTo(-sideWidth / 2, -baseR);
        triShape.lineTo(sideWidth / 2, -baseR);
        triShape.lineTo(0, -baseR - triHeight);
        triShape.closePath();

        const triGeo = new THREE.ShapeGeometry(triShape);
        const triMat = new THREE.MeshBasicMaterial({
            color: 0x00f3ff,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        const triMesh = new THREE.Mesh(triGeo, triMat);
        triMesh.renderOrder = 999;
        this.arrowGroup.add(triMesh);

        const diamondGeo = new THREE.PlaneGeometry(0.12, 0.12);
        const diamondMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        const diamondMesh = new THREE.Mesh(diamondGeo, diamondMat);
        diamondMesh.position.set(0, -baseR, 0.01);
        diamondMesh.rotation.z = Math.PI / 4;
        diamondMesh.renderOrder = 1000;
        this.arrowGroup.add(diamondMesh);
    }

    populateSubmenus() {
        this.navigationData.forEach(item => {
            const submenuEl = document.getElementById(`submenu-${item.id}`);
            if (submenuEl) {
                submenuEl.innerHTML = "";
                item.subitems.forEach(sub => {
                    const { label, route } = typeof sub === "string" ? { label: sub } : sub;
                    const div = document.createElement("div");
                    div.className = "submenu-item";
                    div.innerText = label;
                    if (route) {
                        div.dataset.route = route;
                        div.classList.add("submenu-item--linked");
                    }
                    submenuEl.appendChild(div);
                });
            }
        });
    }

    bindEvents() {
        const navNodes = document.querySelectorAll(".nav-node");
        const nodesContainer = document.getElementById("nav-nodes-container");

        navNodes.forEach(node => {
            const id = node.getAttribute("data-id");
            const itemData = this.navigationData.find(d => d.id === id);

            node.addEventListener("mouseenter", () => {
                this.showHoverState(itemData, node, navNodes);
            });

            node.addEventListener("click", (e) => {
                if (e.target.classList.contains('submenu-item')) {
                    // Subitems without a route of their own stay inert, as before.
                    const subRoute = e.target.dataset.route;
                    if (subRoute) this.triggerTransition(subRoute);
                    return;
                }
                this.triggerTransition(itemData.route);
            });
        });

        nodesContainer?.addEventListener("mouseleave", () => {
            this.clearHoverState(navNodes);
        });

        document.getElementById("enter-btn")?.addEventListener("click", () => {
            const targetRoute = this.hoveredItem ? this.hoveredItem.route : "starmap";
            this.triggerTransition(targetRoute);
        });
    }

    setTitleTextAnimated(newText) {
        const titleElem = document.getElementById("section-title");
        if (!titleElem || titleElem.innerText === newText) return;

        clearTimeout(this.titleTimer);
        titleElem.classList.remove("visible");

        this.titleTimer = setTimeout(() => {
            titleElem.innerText = newText;
            titleElem.classList.add("visible");
        }, 200);
    }

    showHoverState(item, node, navNodes) {
        this.hoveredItem = item;
        navNodes.forEach(n => n.classList.remove("active"));
        node.classList.add("active");

        this.setTitleTextAnimated(item.title);

        const targetAngleFromDown = item.screenAngle - (Math.PI / 2);
        this.targetZOffset = -targetAngleFromDown;
    }

    clearHoverState(navNodes) {
        this.hoveredItem = null;
        navNodes.forEach(n => n.classList.remove("active"));
        this.setTitleTextAnimated(this.defaultTitle);
    }

    triggerTransition(routePath) {
        if (this.router && typeof this.router.navigate === 'function') {
            this.router.navigate(routePath);
        } else {
            console.log(`[HomeView]: Navigating to route "${routePath}"`);
        }
    }

    updateNodePositions() {
        if (!this.camera) return;

        this.camera.updateMatrixWorld(true);

        this.navigationData.forEach(item => {
            const nodeEl = document.getElementById(`node-${item.id}`);
            if (!nodeEl) return;

            const rad = item.screenAngle;

            const node3D = new THREE.Vector3(
                this.earthPosition3D.x + this.nodeRadius3D * Math.cos(rad),
                this.earthPosition3D.y - this.nodeRadius3D * Math.sin(rad),
                this.earthPosition3D.z
            );

            node3D.project(this.camera);

            const x = (node3D.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(node3D.y * 0.5) + 0.5) * window.innerHeight;

            nodeEl.style.left = `${x}px`;
            nodeEl.style.top = `${y}px`;
        });
    }

    /**
     * Applies this view's hover-driven rotation offset on top of the shared
     * Earth's idle spin (set by scene.js each frame before tick callbacks
     * run — see scene.js's animate() step ordering). Registered via
     * sceneEngine.registerTick() instead of folded into the private rAF
     * loop below, specifically so it always runs after scene.js has set
     * that frame's base rotation.
     */
    tickEarth() {
        if (this.earthGroup) {
            this.earthGroup.rotation.z += this.currentZOffset;
        }
    }

    animate() {
        this.animFrameId = requestAnimationFrame(() => this.animate());

        this.currentZOffset += (this.targetZOffset - this.currentZOffset) * 0.1;

        if (this.arrowGroup) {
            this.arrowGroup.rotation.z = this.currentZOffset;
        }

        this.updateNodePositions();
    }

    onWindowResize() {
        this.updateNodePositions();
    }

    /**
     * Dual protocol support for SPA routing (cleanup / destroy)
     */
    cleanup() {
        this.destroy();
    }

    destroy() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
        }

        if (this.earthTickFn) {
            this.router?.sceneEngine?.unregisterTick(this.earthTickFn);
            this.earthTickFn = null;
        }

        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }

        if (this.storeUnsubscribe) {
            this.storeUnsubscribe();
        }

        clearTimeout(this.titleTimer);
        clearTimeout(this.authToastTimer);

        // GPU Memory Disposal Guidelines
        this.localGroup.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(mat => {
                        if (mat.map) mat.map.dispose();
                        mat.dispose();
                    });
                } else {
                    if (object.material.map) object.material.map.dispose();
                    object.material.dispose();
                }
            }
        });

        if (this.scene) {
            this.scene.remove(this.localGroup);
        }
    }
}

export default HomeView;
