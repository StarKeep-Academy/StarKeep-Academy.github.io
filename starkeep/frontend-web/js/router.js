import { store } from './store.js';

export class Router {
    constructor(routes, sceneEngine) {
        this.routes = routes;
        this.sceneEngine = sceneEngine;
        this.currentView = null;
        this.appContainer = document.getElementById('app');

        window.addEventListener('popstate', () => this.handleRoute());
    }

    /**
     * @param {string} path
     * @param {Object} [context] One-shot data handed to the incoming view's
     *   mount() — e.g. { quizComplete: true } so AvatarView knows to refetch
     *   after the archetype quiz returns. Not persisted: it applies to this
     *   navigation only, so a later reload or Back doesn't replay it.
     */
    navigate(path, context = null) {
        window.history.pushState({}, '', path.startsWith('/') ? path : `/${path}`);
        return this.handleRoute(context);
    }

    async handleRoute(context = null) {
        let path = window.location.pathname.replace('/', '') || 'home';

        // DEC-011: no anonymous browsing. HomeView is the only route reachable
        // unauthenticated (it renders the login/signup gate); direct URL nav
        // or a stale link to anything else bounces back to it. This mirrors
        // the mobile app's (shell)/_layout.tsx redirect-to-splash guard.
        if (path !== 'home' && !store.getState().isAuthenticated) {
            window.history.replaceState({}, '', '/');
            path = 'home';
        }

        // 1. Clean up previous view and GPU memory. Awaited — StarMapView's
        // destroy() may need to flush a pending edit session to the server
        // before it's safe to tear down (see its own comment).
        if (this.currentView && typeof this.currentView.destroy === 'function') {
            await this.currentView.destroy();
        }

        // 2. Resolve View Class
        const ViewClass = this.routes[path] || this.routes['home'];
        this.currentView = new ViewClass(this);

        // 3. Render HTML UI overlay into container
        this.appContainer.innerHTML = this.currentView.render();

        // 4. Mount 3D objects into central Three.js scene. Awaited (mount()
        // may be async — e.g. StarMapView fetching real data before it can
        // finish setting up) so a thrown error surfaces through this async
        // function instead of becoming a silent unhandled rejection.
        if (typeof this.currentView.mount === 'function') {
            await this.currentView.mount({
                scene: this.sceneEngine.scene,
                camera: this.sceneEngine.camera,
                context
            });
        }
    }
}
