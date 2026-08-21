import { sceneEngine } from './scene.js';
import { store } from './store.js';
import { Router } from './router.js';
import { HomeView } from './views/HomeView.js';
import { StarMapView } from './views/StarMapView.js';
import { AvatarView } from './views/AvatarView.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Identify mount targets in single-page HTML shell
    const canvasElement = document.getElementById('three-canvas');
    const appContainer = document.getElementById('app');

    if (!canvasElement || !appContainer) {
        console.error('Core WebGL or UI mounting elements missing from document shell.');
        return;
    }

    // 2. Initialize persistent WebGL Engine
    sceneEngine.init(canvasElement);

    // 3. Initialize Global State and Persistent Sockets
    await store.init();

    // 4. Route table — 'academy', 'missions', 'lux' are HomeView nav targets
    // not built yet; Router falls back to 'home' for unmapped paths.
    const routes = {
        home: HomeView,
        starmap: StarMapView,
        avatar: AvatarView
    };

    // 5. Initialize Client-Side SPA Router (History API — pushState/popstate).
    // Every fresh page load starts at 'home', regardless of whatever path was
    // left in the address bar from a previous in-app navigation (History API
    // routing means e.g. '/starmap' is a real, reloadable URL) — replaceState
    // resets it without adding a spurious history entry.
    if (window.location.pathname !== '/') {
        window.history.replaceState({}, '', '/');
    }
    const router = new Router(routes, sceneEngine);
    await router.handleRoute();
});
