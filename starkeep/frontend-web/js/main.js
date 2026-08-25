import { sceneEngine } from './scene.js';
import { store } from './store.js';
import { Router } from './router.js';
import { HomeView } from './views/HomeView.js';
import { StarMapView } from './views/StarMapView.js';
import { AvatarView } from './views/AvatarView.js';
import { ProfileView } from './views/ProfileView.js';

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
        avatar: AvatarView,
        profile: ProfileView
    };

    // 5. Initialize Client-Side SPA Router (History API — pushState/popstate).
    // Every fresh page load starts at 'home', regardless of whatever path was
    // left in the address bar from a previous in-app navigation (History API
    // routing means e.g. '/starmap' is a real, reloadable URL) — replaceState
    // resets it without adding a spurious history entry.
    //
    // The one exception is the archetype quiz sending the user back (DEC-014).
    // That return is a *full page load* at /avatar?quiz=complete, so the reset
    // below would discard both the route and the marker before anything could
    // act on them. Read them first, then let the reset proceed as normal.
    const returnedFromQuiz =
        new URLSearchParams(window.location.search).get('quiz') === 'complete';
    const returnRoute = window.location.pathname.replace(/^\//, '');

    if (window.location.pathname !== '/' || window.location.search) {
        window.history.replaceState({}, '', '/');
    }

    const router = new Router(routes, sceneEngine);

    if (returnedFromQuiz && routes[returnRoute]) {
        // Route guard still applies: if the session lapsed while the user was
        // on the quiz, Router bounces them to the login gate as usual.
        await router.navigate(returnRoute, { quizComplete: true });
    } else {
        await router.handleRoute();
    }
});
