import * as THREE from 'three';

export const EDGE_ROLE_COLORS = {
  current: '#f97316',
  path: '#22d3ee',
  quiet: '#64748b',
  ghosted: '#64748b',
};

/** @type {Map<string, THREE.ShaderMaterial>} */
const edgeMaterialCache = new Map();

const pulseVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const pulseFragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPulse;
  uniform float uDashOffset;
  uniform float uAnimated;
  varying vec2 vUv;

  void main() {
    float dash = uAnimated > 0.5
      ? step(0.45, fract(vUv.x * 8.0 + uDashOffset))
      : 1.0;
    float glow = uAnimated > 0.5 ? 0.55 + uPulse * 0.45 : 1.0;
    gl_FragColor = vec4(uColor * glow, uOpacity * dash);
  }
`;

/**
 * @param {'quiet' | 'path' | 'current'} visualRole
 * @param {boolean} ghosted
 * @param {boolean} flowing
 */
export function getDiagnosticsEdgeMaterial(visualRole, ghosted = false, flowing = false) {
  const role = visualRole === 'current' || visualRole === 'path' ? visualRole : 'quiet';
  const cacheKey = `${role}:${ghosted ? 'ghost' : 'solid'}:${flowing ? 'flow' : 'static'}`;
  const cached = edgeMaterialCache.get(cacheKey);
  if (cached) return cached;

  const color = new THREE.Color(EDGE_ROLE_COLORS[ghosted ? 'ghosted' : role]);
  const opacity = ghosted ? 0.1 : role === 'quiet' ? 0.72 : 1;
  const animated = flowing && !ghosted && role !== 'quiet';

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: opacity },
      uPulse: { value: 0 },
      uDashOffset: { value: 0 },
      uAnimated: { value: animated ? 1 : 0 },
    },
    vertexShader: pulseVertexShader,
    fragmentShader: pulseFragmentShader,
    transparent: true,
    depthWrite: false,
  });

  material.userData = {
    role,
    ghosted,
    flowing: animated,
    pulseSpeed: role === 'current' ? 2.4 : 1.4,
  };

  edgeMaterialCache.set(cacheKey, material);
  return material;
}

/**
 * @param {THREE.ShaderMaterial} material
 * @param {number} elapsed
 */
export function updateDiagnosticsEdgeMaterial(material, elapsed) {
  if (!material.userData.flowing) return;
  const speed = material.userData.pulseSpeed ?? 1.4;
  material.uniforms.uPulse.value = 0.5 + Math.sin(elapsed * speed) * 0.5;
  material.uniforms.uDashOffset.value = elapsed * speed * 0.35;
}

export function clearDiagnosticsEdgeMaterialCache() {
  edgeMaterialCache.forEach((material) => material.dispose());
  edgeMaterialCache.clear();
}
