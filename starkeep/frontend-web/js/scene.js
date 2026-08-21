import * as THREE from 'three';
import { createRadialGradientMaterial } from './materials/RadialGradientMaterial.js';

// Idle spin rate for the persistent Earth, radians/sec — matches HomeView's
// former per-frame accumulator (0.0025 rad/frame @ ~60fps ≈ 0.15 rad/sec),
// expressed as a deterministic function of elapsed time (like the starfield's
// own rotation below) instead of a frame-accumulated value, so it's exactly
// reproducible regardless of which view is currently driving the tick loop.
const EARTH_IDLE_ROTATION_RATE = 0.15;
// Exported so views computing a screen-anchor target (e.g. AvatarView locking
// the Earth's rim just under the mannequin's feet) can offset by the actual
// radius instead of duplicating this number.
export const EARTH_RADIUS = 4.5;
// How far off the camera's view axis (world X=0) the Earth has to be before
// the glow plane needs re-billboarding to avoid perspective keystoning.
// HomeView's Earth sits exactly at x=0; AvatarView's locked corner sits
// around x=-5.25 — comfortably on either side of any reasonable threshold.
const EARTH_BILLBOARD_X_THRESHOLD = 1.0;

class SceneEngine {
    constructor() {
        this.container = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;

        // Core persistent meshes
        this.starfield = null;
        this.lightingGroup = null;
        this.earthGroup = null;
        this.earthGlowMesh = null;

        // View-specific objects container
        this.viewGroup = new THREE.Group();

        // Camera animation state
        this.isAnimatingCamera = false;
        this.camStartPos = new THREE.Vector3();
        this.camEndPos = new THREE.Vector3();
        this.camStartLookAt = new THREE.Vector3();
        this.camEndLookAt = new THREE.Vector3();
        this.camCurrentLookAt = new THREE.Vector3(0, 0, 0);
        this.camAnimStartTime = 0;
        this.camAnimDuration = 1000;

        // Earth position animation state — mirrors the camera tween above so
        // the same globe can visibly glide between views (e.g. HomeView's
        // center position to AvatarView's bottom-left locked corner) instead
        // of being rebuilt/cut on every navigation.
        this.isAnimatingEarth = false;
        this.earthStartPos = new THREE.Vector3();
        this.earthEndPos = new THREE.Vector3();
        this.earthAnimStartTime = 0;
        this.earthAnimDuration = 1000;
        this.hasPositionedEarth = false;

        // Warp speed effect state
        this.warpIntensity = 0;
        this.targetWarpIntensity = 0;

        // Tracks whether cameraTo() has ever run — the very first call snaps
        // instantly instead of animating, since there's nothing meaningful to
        // fly in from (the engine's raw default position is an arbitrary far
        // wide shot, not a prior view).
        this.hasPositionedCamera = false;

        // Per-frame callbacks registered by the active view, run inside the
        // single persistent render loop so views never own their own rAF/render call.
        this.tickCallbacks = new Set();

        // Clock & Render loop
        this.clock = new THREE.Clock();
        this.animFrameId = null;

        this.resizeHandler = this.onWindowResize.bind(this);
    }

    /**
     * Initializes the persistent WebGL engine, camera, and background elements.
     * @param {HTMLCanvasElement} canvasElement
     */
    init(canvasElement) {
        this.container = canvasElement;

        const width = window.innerWidth;
        const height = window.innerHeight;

        // 1. Core WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvasElement,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x02040a, 1.0);

        // 2. Persistent Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x02040a, 0.003);

        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
        this.camera.position.set(0, 0, 100);
        this.camera.lookAt(this.camCurrentLookAt);

        // 3. Container group for dynamic view-specific 3D objects
        this.scene.add(this.viewGroup);

        // 4. Construct persistent background elements
        this.initLighting();
        this.initStarfield();
        this.initEarth();

        // 5. Event Listeners
        window.addEventListener('resize', this.resizeHandler);

        // 6. Start persistent loop
        this.animate();
    }

    initLighting() {
        this.lightingGroup = new THREE.Group();

        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        sunLight.position.set(150, 50, 100);

        this.lightingGroup.add(ambient);
        this.lightingGroup.add(sunLight);
        this.scene.add(this.lightingGroup);
    }

    initStarfield() {
        const count = 8000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const r = 400 + Math.random() * 600;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            const c = new THREE.Color();
            c.setHSL(0.55 + Math.random() * 0.15, 0.7, 0.5 + Math.random() * 0.5);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 2,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            fog: false // stars sit 400-1000 units out; scene fog (density 0.003) would
                       // otherwise fog them almost fully into the background color
        });

        this.starfield = new THREE.Points(geometry, material);
        this.scene.add(this.starfield);
    }

    /**
     * Builds the persistent Earth (sphere + cyan wireframe overlay), shared
     * across every view instead of being owned/rebuilt by whichever view
     * wants it — HomeView.js previously built and destroyed this mesh itself
     * on every mount/unmount, which made a continuous cross-view glide (e.g.
     * into AvatarView's locked corner) impossible. Starts hidden; a view
     * makes it visible by calling moveEarthTo().
     */
    initEarth() {
        this.earthGroup = new THREE.Group();
        this.earthGroup.visible = false;

        // Atmosphere glow plane — a child of earthGroup (not a separate
        // view-owned mesh) specifically so it travels with the Earth
        // whenever moveEarthTo() relocates it, instead of staying behind
        // when e.g. HomeView hands off to AvatarView. Re-oriented toward the
        // camera every frame in animate() (see earthGlowMesh below) — a
        // flat plane only reads as a clean centered radial gradient when it
        // faces the viewer head-on; once the Earth sits well off the
        // camera's view axis (AvatarView's locked corner), a plane left at
        // a fixed orientation gets keystoned by perspective and its bright
        // center visibly drifts away from the sphere's own silhouette.
        const glowGeo = new THREE.PlaneGeometry(EARTH_RADIUS * 3.2, EARTH_RADIUS * 3.2);
        const glowMat = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                void main() {
                    float dist = length(vUv - vec2(0.5));
                    float fadeIn = smoothstep(0.12, 0.30, dist);
                    float fadeOut = 1.0 - smoothstep(0.30, 0.5, dist);
                    float alpha = fadeIn * fadeOut * 0.9;
                    gl_FragColor = vec4(0.0, 0.85, 1.0, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.earthGlowMesh = new THREE.Mesh(glowGeo, glowMat);
        this.earthGlowMesh.position.set(0, 0, -0.1);
        this.earthGroup.add(this.earthGlowMesh);

        const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
        const earthMat = createRadialGradientMaterial(0x0a1f4d, 0x7ec8ff);
        this.earthGroup.add(new THREE.Mesh(earthGeo, earthMat));

        const wireGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.002, 36, 36);
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0x00f3ff,
            wireframe: true,
            transparent: true,
            opacity: 0.35
        });
        this.earthGroup.add(new THREE.Mesh(wireGeo, wireMat));

        this.scene.add(this.earthGroup);
    }

    /**
     * Smoothly animates camera to a target position and lookAt target.
     * @param {THREE.Vector3} targetPos
     * @param {THREE.Vector3} targetLookAt
     * @param {number} duration Duration in milliseconds
     */
    cameraTo(targetPos, targetLookAt = new THREE.Vector3(0, 0, 0), duration = 1200) {
        const isFirstPlacement = !this.hasPositionedCamera;
        this.hasPositionedCamera = true;

        if (isFirstPlacement) {
            this.camera.position.copy(targetPos);
            this.camCurrentLookAt.copy(targetLookAt);
            this.camera.lookAt(this.camCurrentLookAt);
            this.isAnimatingCamera = false;
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.camStartPos.copy(this.camera.position);
            this.camEndPos.copy(targetPos);

            this.camStartLookAt.copy(this.camCurrentLookAt);
            this.camEndLookAt.copy(targetLookAt);

            this.camAnimStartTime = performance.now();
            this.camAnimDuration = duration;
            this.isAnimatingCamera = true;

            setTimeout(() => {
                resolve();
            }, duration);
        });
    }

    /**
     * Smoothly animates the persistent Earth to a target world position,
     * making it visible if it wasn't already. Mirrors cameraTo()'s tween
     * shape exactly (first call snaps instantly, later calls lerp with the
     * same easing inside animate()) so views can rely on identical behavior.
     * @param {THREE.Vector3} targetPos
     * @param {number} duration Duration in milliseconds
     */
    moveEarthTo(targetPos, duration = 1200) {
        if (!this.earthGroup) return Promise.resolve();
        this.earthGroup.visible = true;

        const isFirstPlacement = !this.hasPositionedEarth;
        this.hasPositionedEarth = true;

        if (isFirstPlacement) {
            this.earthGroup.position.copy(targetPos);
            this.isAnimatingEarth = false;
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.earthStartPos.copy(this.earthGroup.position);
            this.earthEndPos.copy(targetPos);

            this.earthAnimStartTime = performance.now();
            this.earthAnimDuration = duration;
            this.isAnimatingEarth = true;

            setTimeout(() => {
                resolve();
            }, duration);
        });
    }

    /**
     * Hides the persistent Earth (e.g. Star Map, which has never shown it).
     * Instant, no fade — kept deliberately simple.
     */
    hideEarth() {
        if (this.earthGroup) this.earthGroup.visible = false;
    }

    /**
     * Unprojects a screen-space NDC point (-1..1 on each axis) into a world
     * position at a given world-Z depth, using the live camera. Lets a view
     * convert a DOM anchor element's on-screen position into a 3D target for
     * moveEarthTo() — the same technique the Gemini Avatar.html reference
     * used to lock its own background Earth under a screen anchor.
     * @param {number} ndcX -1..1
     * @param {number} ndcY -1..1
     * @param {number} targetZ world-space Z the returned point should sit at
     */
    screenAnchorToWorld(ndcX, ndcY, targetZ) {
        const vec = new THREE.Vector3(ndcX, ndcY, 0.5);
        vec.unproject(this.camera);
        const dir = vec.sub(this.camera.position).normalize();
        const dist = (targetZ - this.camera.position.z) / dir.z;
        return this.camera.position.clone().add(dir.multiplyScalar(dist));
    }

    /**
     * Adjusts the warp speed starfield effect intensity.
     * @param {number} intensity Scale value (0 to 1)
     */
    setWarpSpeed(intensity) {
        this.targetWarpIntensity = Math.max(0, Math.min(1, intensity));
    }

    /**
     * Adds dynamic 3D objects managed by the current active view.
     * @param {THREE.Object3D} object
     */
    addOverlayMesh(object) {
        this.viewGroup.add(object);
    }

    /**
     * Removes view-specific 3D objects.
     * @param {THREE.Object3D} object
     */
    removeOverlayMesh(object) {
        this.viewGroup.remove(object);
    }

    /**
     * Registers a per-frame callback invoked from the single persistent render loop.
     * Views use this instead of running their own requestAnimationFrame/render call.
     * @param {(delta: number, elapsed: number) => void} fn
     */
    registerTick(fn) {
        this.tickCallbacks.add(fn);
    }

    /**
     * Unregisters a previously-registered per-frame callback.
     * @param {(delta: number, elapsed: number) => void} fn
     */
    unregisterTick(fn) {
        this.tickCallbacks.delete(fn);
    }

    animate() {
        this.animFrameId = requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        const elapsed = this.clock.getElapsedTime();

        // 1. Background rotations
        if (this.starfield) {
            this.starfield.rotation.y = elapsed * (0.01 + this.warpIntensity * 0.2);
        }
        if (this.earthGroup && this.earthGroup.visible) {
            this.earthGroup.rotation.z = elapsed * EARTH_IDLE_ROTATION_RATE;
        }

        // 2. Interpolate warp speed state
        this.warpIntensity += (this.targetWarpIntensity - this.warpIntensity) * 0.05;

        // 3. Smooth Camera Interpolation
        if (this.isAnimatingCamera) {
            const now = performance.now();
            const progress = Math.min((now - this.camAnimStartTime) / this.camAnimDuration, 1.0);

            // Smooth easeInOutCubic easing
            const ease = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            this.camera.position.lerpVectors(this.camStartPos, this.camEndPos, ease);
            this.camCurrentLookAt.lerpVectors(this.camStartLookAt, this.camEndLookAt, ease);
            this.camera.lookAt(this.camCurrentLookAt);

            if (progress >= 1.0) {
                this.isAnimatingCamera = false;
            }
        }

        // 3b. Smooth Earth Position Interpolation (same easing as the camera)
        if (this.isAnimatingEarth) {
            const now = performance.now();
            const progress = Math.min((now - this.earthAnimStartTime) / this.earthAnimDuration, 1.0);

            const ease = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            this.earthGroup.position.lerpVectors(this.earthStartPos, this.earthEndPos, ease);

            if (progress >= 1.0) {
                this.isAnimatingEarth = false;
            }
        }

        // 3c. Re-billboard the glow plane toward the camera, but only once
        // the Earth actually sits off the camera's view axis (AvatarView's
        // locked corner) — see the comment on the glow plane's construction
        // in initEarth() for why that's when a fixed orientation drifts.
        // HomeView's Earth stays perfectly on-axis (x=0) and additionally
        // spins on hover (see HomeView.tickEarth(), which runs after this
        // step and adds a rotation on top of it) — billboarding there both
        // isn't needed and fights that later rotation, so this resets the
        // glow to its plain identity orientation (just following the
        // parent's rotation like a normal child) whenever off-axis enough
        // to need billboarding stops being true.
        if (this.earthGroup && this.earthGroup.visible && this.earthGlowMesh) {
            if (Math.abs(this.earthGroup.position.x) > EARTH_BILLBOARD_X_THRESHOLD) {
                this.earthGlowMesh.lookAt(this.camera.position);
            } else if (this.earthGlowMesh.quaternion.x !== 0 || this.earthGlowMesh.quaternion.y !== 0 || this.earthGlowMesh.quaternion.z !== 0) {
                this.earthGlowMesh.quaternion.identity();
            }
        }

        // 4. Run view-registered per-frame logic before the single render call.
        // Guarded per-callback: this loop runs inside the persistent rAF chain
        // (already re-scheduled above, so future frames aren't at risk), but
        // an uncaught exception here would still skip the render() call below
        // for every subsequent frame it recurs on — freezing the canvas
        // completely while unrelated DOM-driven UI (panels, modals) keeps
        // working fine, which reads as "nothing is happening" with no visible
        // error. Catching and logging keeps one bad frame from becoming a
        // silent, total, and easily-misdiagnosed freeze.
        this.tickCallbacks.forEach((fn) => {
            try {
                fn(delta, elapsed);
            } catch (err) {
                console.error('[scene] tick callback threw:', err);
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;

        const w = window.innerWidth;
        const h = window.innerHeight;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    get Context() {
        return {
            scene: this.scene,
            camera: this.camera,
            renderer: this.renderer,
            viewGroup: this.viewGroup,
            earthGroup: this.earthGroup
        };
    }
}

export const sceneEngine = new SceneEngine();
