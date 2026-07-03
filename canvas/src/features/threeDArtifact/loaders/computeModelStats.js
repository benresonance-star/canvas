import * as THREE from 'three';

function vectorToTuple(vector) {
  return [vector.x, vector.y, vector.z];
}

export function computeModelStats(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  let meshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  const materials = new Set();
  const textures = new Set();

  object.traverse((child) => {
    if (!child.isMesh) return;
    meshCount += 1;
    const geometry = child.geometry;
    const position = geometry?.getAttribute?.('position');
    if (position) vertexCount += position.count;
    if (geometry?.index) {
      triangleCount += geometry.index.count / 3;
    } else if (position) {
      triangleCount += position.count / 3;
    }

    const materialList = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : [];
    materialList.forEach((material) => {
      materials.add(material.uuid);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value.uuid);
      });
    });
  });

  return {
    bounds: {
      min: vectorToTuple(box.min),
      max: vectorToTuple(box.max),
      size: vectorToTuple(size),
      center: vectorToTuple(center),
    },
    meshCount,
    vertexCount,
    triangleCount: Math.round(triangleCount),
    materialCount: materials.size,
    textureCount: textures.size,
    hasTextures: textures.size > 0,
    estimatedComplexity:
      triangleCount > 2_000_000 ? 'very_high'
        : triangleCount > 500_000 ? 'high'
          : triangleCount > 100_000 ? 'medium'
            : 'low',
  };
}
