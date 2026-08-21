import * as THREE from 'three';

/**
 * View-space-normal radial gradient shader: bright at the center of the
 * visible disc, darkening toward the limb. Used for the HomeView planet and
 * (with per-status colors) the StarMapView star bodies, so both get the same
 * "glowing sphere" look instead of a flat/wireframe fill.
 */
export function createRadialGradientMaterial(centerColor, edgeColor) {
    return new THREE.ShaderMaterial({
        uniforms: {
            colorCenter: { value: new THREE.Color(centerColor) },
            colorEdge: { value: new THREE.Color(edgeColor) }
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 colorCenter;
            uniform vec3 colorEdge;
            varying vec3 vNormal;
            void main() {
                float distFromCenter = length(vNormal.xy);
                float factor = smoothstep(0.0, 0.95, distFromCenter);
                vec3 finalColor = mix(colorCenter, colorEdge, factor);
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });
}

/**
 * Derives a bright center / dark edge color pair from a single base hex
 * color, for feeding into createRadialGradientMaterial().
 */
export function deriveRadialColors(baseHex, centerLerp = 0.55, edgeScale = 0.45) {
    const base = new THREE.Color(baseHex);
    const center = base.clone().lerp(new THREE.Color(0xffffff), centerLerp);
    const edge = base.clone().multiplyScalar(edgeScale);
    return { center, edge };
}
