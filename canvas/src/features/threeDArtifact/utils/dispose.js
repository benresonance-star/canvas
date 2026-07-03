import * as THREE from 'three';

function disposeMaterial(material) {
  Object.values(material).forEach((value) => {
    if (value && typeof value === 'object' && typeof value.dispose === 'function') {
      try {
        value.dispose();
      } catch {
        /* ignore texture disposal errors */
      }
    }
  });
  material.dispose();
}

export function disposeObject3D(object) {
  if (!object) return;
  object.traverse((child) => {
    if (child.geometry && typeof child.geometry.dispose === 'function') {
      child.geometry.dispose();
    }
    const material = child.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material instanceof THREE.Material) {
      disposeMaterial(material);
    }
  });
}
