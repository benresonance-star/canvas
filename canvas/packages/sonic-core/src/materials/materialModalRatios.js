export const materialModalRatios = {
  skin: [1.0, 1.59, 2.14, 2.65, 3.16, 3.50],
  wood: [1.0, 2.01, 3.02, 4.12, 5.19, 6.27],
  steel: [1.0, 1.41, 2.17, 2.89, 3.73, 5.11],
  brass: [1.0, 1.35, 2.04, 2.88, 4.05, 5.62],
  bronze: [1.0, 1.38, 2.08, 2.92, 4.22, 5.76],
  glass: [1.0, 2.32, 3.88, 5.41, 7.12, 9.31],
  ceramic: [1.0, 1.68, 2.91, 4.37, 6.82, 8.40],
  stone: [1.0, 1.52, 2.44, 3.80, 5.95, 8.10],
  concrete: [1.0, 1.47, 2.30, 3.62, 5.42, 7.60],
  plastic: [1.0, 1.82, 2.70, 3.92, 5.20, 6.90],
  bamboo: [1.0, 2.08, 3.15, 4.22, 5.41, 6.52],
  carbon: [1.0, 1.72, 2.86, 4.18, 6.02, 8.30],
  synthetic: [1.0, 1.75, 2.62, 3.72, 5.18, 7.12],
};

export function getMaterialModalRatios(type = 'skin') {
  return materialModalRatios[type] ?? materialModalRatios.skin;
}

export function interpolateModalRatios({ materialType = 'skin', inharmonicity = 0, count = 6 } = {}) {
  const ratios = getMaterialModalRatios(materialType);
  return Array.from({ length: count }, (_, index) => {
    const harmonic = index + 1;
    const material = ratios[index % ratios.length] * (index >= ratios.length ? Math.ceil((index + 1) / ratios.length) : 1);
    return harmonic + (material - harmonic) * Math.max(0, Math.min(1, inharmonicity));
  });
}
