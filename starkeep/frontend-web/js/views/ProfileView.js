import * as THREE from 'three';
import { store } from '../store.js';
import { authApi } from '../api.js';

// Same framing HomeView and AvatarView use, so the shared Earth/starfield
// behind this page doesn't jump when you arrive from either of them.
const CAMERA_FRAME_POS = new THREE.Vector3(0, 0, 7.2);
const CAMERA_FRAME_LOOKAT = new THREE.Vector3(0, 0, 0);

function formatJoined(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Account & identity page — reached from the AVATAR node's PROFILE subitem.
 *
 * Deliberately separate from AvatarView: this is the account (who you are to
 * the system — email, membership, signing out), while the Avatar page is the
 * persona (paths, archetype, powers). Keeping them apart means the Avatar page
 * stays a character sheet rather than a settings screen.
 */
export class ProfileView {
    constructor(router) {
        this.router = router;
        this.sceneEngine = null;
    }

    render() {
        return `
            <div class="profile-root">
                <header class="header-bar">
                    <button class="back-btn-home" id="profile-back-btn">&larr; MENU</button>
                    <div class="page-title">ACCOUNT</div>
                    <div class="system-status" id="profile-status">LOADING ACCOUNT...</div>
                </header>

                <section class="profile-card">
                    <dl class="profile-fields">
                        <div class="profile-field">
                            <dt>ALIAS</dt>
                            <dd id="profile-alias">—</dd>
                        </div>
                        <div class="profile-field">
                            <dt>NAME</dt>
                            <dd id="profile-display-name">—</dd>
                        </div>
                        <div class="profile-field">
                            <dt>EMAIL</dt>
                            <dd id="profile-email">—</dd>
                        </div>
                        <div class="profile-field">
                            <dt>MEMBER SINCE</dt>
                            <dd id="profile-joined">—</dd>
                        </div>
                        <div class="profile-field">
                            <dt>LEVEL</dt>
                            <dd id="profile-level">—</dd>
                        </div>
                        <div class="profile-field">
                            <dt>ACCOUNT ID</dt>
                            <dd><code id="profile-user-id">—</code></dd>
                        </div>
                    </dl>
                </section>

                <section class="profile-actions">
                    <button class="profile-signout-btn" id="profile-signout-btn">SIGN OUT</button>
                    <p class="profile-note" id="profile-note"></p>
                </section>
            </div>
        `;
    }

    async mount({ scene, camera }) {
        this.sceneEngine = this.router.sceneEngine;
        this.sceneEngine.cameraTo(CAMERA_FRAME_POS, CAMERA_FRAME_LOOKAT, 900);

        document.getElementById('profile-back-btn')
            ?.addEventListener('click', () => this.router.navigate('home'));
        document.getElementById('profile-signout-btn')
            ?.addEventListener('click', () => this.signOut());

        await this.loadAccount();
    }

    async loadAccount() {
        // The store already holds /auth/me from session restore. Re-fetch anyway
        // so a level or alias changed elsewhere in this session isn't shown stale
        // — but fall back to the cached copy rather than showing an empty page.
        let me = store.getState().user;
        const usingDevBypass = localStorage.getItem('starkeep_web_dev_bypass') === '1';

        if (!usingDevBypass) {
            try {
                me = await authApi.me();
            } catch (err) {
                console.error('[ProfileView] Could not refresh account details:', err);
            }
        }
        if (this.destroyed) return;

        const avatar = me?.avatar || {};
        this.setText('profile-alias', avatar.alias || 'NOT SET');
        this.setText('profile-display-name', avatar.display_name || 'NOT SET');
        this.setText('profile-email', me?.email || '—');
        this.setText('profile-joined', formatJoined(me?.date_joined));
        this.setText('profile-level', `LVL ${avatar.level ?? 0}`);
        this.setText('profile-user-id', me?.user_id || '—');
        this.setText(
            'profile-status',
            usingDevBypass ? 'DEV SESSION — NOT A REAL ACCOUNT' : 'ACCOUNT SYNCED'
        );
    }

    async signOut() {
        const button = document.getElementById('profile-signout-btn');
        if (button) {
            button.disabled = true;
            button.textContent = 'SIGNING OUT…';
        }
        await store.logout();
        // Router's DEC-011 guard sends any non-home route back to the login
        // gate once isAuthenticated is false, so 'home' is the honest target.
        this.router.navigate('home');
    }

    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    destroy() {
        // No GPU resources of its own — this view only borrows the shared scene
        // (WEB_FRONTEND_ARCHITECTURE.md §4) — but loadAccount() may still be
        // awaiting, so mark it dead.
        this.destroyed = true;
    }
}
