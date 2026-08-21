import { authApi, tokenStorage } from './api.js';
import { IS_LOCAL_DEV } from './config.js';

const DEV_BYPASS_KEY = 'starkeep_web_dev_bypass';

// Mirrors frontend/features/auth/store.ts's devSeed() mock user shape exactly
// (same field names, same fake heroic/learning path) — lets local prototyping
// continue without a running backend, matching the mobile precedent.
const DEV_USER = {
    user_id: '00000000-0000-0000-0000-000000000001',
    email: 'dev@starkeep.io',
    avatar: {
        id: '00000000-0000-0000-0000-000000000002',
        alias: 'DREAMWALKER',
        display_name: 'Dev User',
        level: 7,
        heroic_path: 'dreamwalker',
        learning_path: 'divergent',
        has_archetype: false
    }
};

export class Store {
    constructor() {
        this.state = {
            user: null,
            isAuthenticated: false,
            currentRoute: 'home',
            luxBalance: 0,
            socketConnected: false,
            activeConstellations: []
        };

        this.listeners = new Set();
        this.socket = null;
    }

    /**
     * Initializes global state, restores user session, and opens persistent network sockets.
     */
    async init() {
        await this.restoreSession();
        this.initPersistentWebSocket();
    }

    /**
     * Rehydrates auth state on page load from a stored access token, if any.
     * Awaited by main.js before the first route mounts, so HomeView's very
     * first render already knows whether to show the auth gate or the menu.
     */
    async restoreSession() {
        const token = tokenStorage.getAccessToken();
        if (!token) {
            // Dev-only convenience: if devSeed() was used on a previous load,
            // stay "logged in" across reloads without a running backend, so
            // prototyping doesn't require re-clicking past the login gate
            // every time. Never applies outside localhost, and signing out
            // clears the flag same as a real session.
            if (IS_LOCAL_DEV && localStorage.getItem(DEV_BYPASS_KEY) === '1') {
                this.state.user = DEV_USER;
                this.state.isAuthenticated = true;
                this.notify();
                return;
            }
            this.state.isAuthenticated = false;
            this.notify();
            return;
        }

        try {
            const me = await authApi.me();
            this.state.user = me;
            this.state.isAuthenticated = true;
        } catch {
            // Expired/invalid token — clear it rather than leaving the app
            // stuck thinking it's authenticated when the backend disagrees.
            tokenStorage.clearTokens();
            this.state.user = null;
            this.state.isAuthenticated = false;
        }
        this.notify();
    }

    /**
     * Called after a successful login/register response with fresh tokens.
     */
    async login(accessToken, refreshToken) {
        tokenStorage.setTokens(accessToken, refreshToken);
        // A real login always supersedes a stale dev-bypass flag from an
        // earlier session — otherwise restoreSession()/StarMapView's
        // usingRealBackend check would keep treating this genuinely
        // authenticated session as the local-only mock path forever.
        localStorage.removeItem(DEV_BYPASS_KEY);
        const me = await authApi.me();
        this.state.user = me;
        this.state.isAuthenticated = true;
        this.notify();
    }

    async logout() {
        try {
            await authApi.logout();
        } catch {
            // Best-effort — clear local state regardless of whether the
            // server-side revoke succeeded (or whether there's a backend to
            // reach at all, e.g. while using the dev bypass below).
        }
        tokenStorage.clearTokens();
        localStorage.removeItem(DEV_BYPASS_KEY);
        this.state.user = null;
        this.state.isAuthenticated = false;
        this.notify();
    }

    /**
     * Dev-only: bypass auth entirely with a mock user, no network call and
     * no running backend required. See restoreSession() for the reload
     * persistence half of this.
     */
    devSeed() {
        if (!IS_LOCAL_DEV) return;
        localStorage.setItem(DEV_BYPASS_KEY, '1');
        this.state.user = DEV_USER;
        this.state.isAuthenticated = true;
        this.notify();
    }

    /**
     * Shell-level persistent WebSocket connection.
     * Stays alive continuously across view transitions.
     */
    initPersistentWebSocket() {
        // Simulated shell-level WebSocket connection
        this.socket = {
            connected: true,
            send: (payload) => {
                console.log('[Persistent Socket Outgoing]:', payload);
            },
            close: () => {
                console.log('[Persistent Socket Closed]');
                this.state.socketConnected = false;
                this.notify();
            }
        };

        this.state.socketConnected = true;
        this.notify();
    }

    /**
     * Returns the current state tree.
     */
    getState() {
        return this.state;
    }

    /**
     * Updates state and notifies subscribed view components.
     * @param {Object} partialState
     */
    setState(partialState) {
        this.state = { ...this.state, ...partialState };
        this.notify();
    }

    /**
     * Subscribes a callback to state updates.
     * @param {Function} listener
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach((listener) => listener(this.state));
    }
}

export const store = new Store();
