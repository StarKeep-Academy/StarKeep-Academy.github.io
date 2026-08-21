import * as THREE from 'three';

/**
 * "Astrolabe sigil" star core: a faceted gem shader — Fresnel-brightened rim
 * (edges catch the glow, like light on a cut stone) with a slow inner pulse,
 * and an explicit opacity uniform (custom ShaderMaterials don't auto-honor
 * material.opacity the way built-in materials do, so focus-phase
 * de-emphasis has to drive this directly).
 */
export function createSigilCoreMaterial(coreColor, rimColor) {
    return new THREE.ShaderMaterial({
        uniforms: {
            colorCore: { value: new THREE.Color(coreColor) },
            colorRim: { value: new THREE.Color(rimColor) },
            uTime: { value: 0 },
            uPulseSpeed: { value: 1.6 },
            uOpacity: { value: 1.0 }
        },
        transparent: true,
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 colorCore;
            uniform vec3 colorRim;
            uniform float uTime;
            uniform float uPulseSpeed;
            uniform float uOpacity;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 viewDir = normalize(vViewPosition);
                float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 1.8);
                float pulse = 0.65 + 0.35 * sin(uTime * uPulseSpeed);
                vec3 base = mix(colorCore, colorRim, fresnel * 0.85);
                vec3 finalColor = base + colorRim * fresnel * pulse * 0.6;
                // Alpha alone carries opacity here — standard (non-premultiplied)
                // blending already multiplies color by alpha at the GPU level, so
                // also darkening finalColor by uOpacity would square the falloff
                // (e.g. a 0.08 de-emphasis factor would render at 0.08^2 ≈ 0.006,
                // effectively black instead of just dim).
                gl_FragColor = vec4(finalColor, uOpacity);
            }
        `
    });
}

/**
 * Faceted (flat-shaded) low-poly gem geometry for the sigil core.
 */
export function createSigilGeometry(radius = 1.4) {
    let geo = new THREE.IcosahedronGeometry(radius, 0);
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    return geo;
}
