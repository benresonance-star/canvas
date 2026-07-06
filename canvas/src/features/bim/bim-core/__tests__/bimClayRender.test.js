import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  applyClayBaseMaterials,
  applyClayViewportMaterials,
  applyClayCameraDepthRange,
  blendClayColor,
  blendClayScalar,
  buildClayBaseMaterial,
  buildClayGlassMaterial,
  captureClayOriginalMaterialSnapshot,
  canReuseClayBlendFastPath,
  clearClayMaterialGroupCache,
  CLAY_BASE_MATERIAL,
  CLAY_SSAO_REFERENCE_DISTANCE_FACTOR,
  CLAY_SSAO_KERNEL_RADIUS_FLOOR,
  CLAY_SSAO_VIEW_SCALE_MIN,
  CLAY_SSAO_VIEW_SCALE_MAX,
  CLAY_SSAO_DEPTH_SPAN_REFERENCE,
  CLAY_SELECTED_MATERIAL,
  getClayPresetWorkspacePatch,
  fingerprintClayLocalIds,
  invalidateClayMaterialSnapshot,
  copyRenderTargetDepthToScreen,
  copyClayComposerDepthToScreen,
  populateScreenDepthFromScene,
  resolveClayComposerDepthSource,
  renderClayFrame,
  resolveClayCameraDepthRange,
  resolveClayHighlightMaterial,
  resolveClayGlazingLocalIds,
  resolveClayMaterialApplyParams,
  resolveClaySsaoSettings,
  resolveClayViewDistance,
  resolveClayWireframeStyle,
  resolveClaySsaoPassSize,
  resolveClaySsaoKernelSize,
  applyClaySsaoSampleCount,
  updateClaySsaoQuality,
  updateClayComposerSettings,
  updateClayLightingIntensity,
  isClayGlassElement,
  isTransparentMaterialDefinition,
  readMaterialDefinitionColor,
  hasMaterialDefinitionColor,
} from '../bimClayRender.js';
import { createFragmentsIdCache } from '../fragmentsSelection.js';
import {
  CLAY_AO_BIAS_DEFAULT,
  CLAY_AO_BIAS_MAX,
  CLAY_AO_BIAS_MIN,
  CLAY_AO_DISTANCE_DEFAULT,
  CLAY_AO_DISTANCE_MAX,
  CLAY_AO_DISTANCE_MIN,
  CLAY_AO_INTENSITY_DEFAULT,
  CLAY_AO_RADIUS_DEFAULT,
  CLAY_AO_RADIUS_MAX,
  CLAY_AO_RADIUS_MIN,
  CLAY_GLASS_OPACITY_DEFAULT,
  CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
  CLAY_LIGHT_INTENSITY_DEFAULT,
  CLAY_SURFACE_COLOR_DEFAULT,
  normalizeClayStyle,
} from '../types.js';

describe('bimClayRender', () => {
  it('normalizes clay style defaults', () => {
    expect(normalizeClayStyle({})).toMatchObject({
      renderStyle: 'standard',
      clayAoIntensity: CLAY_AO_INTENSITY_DEFAULT,
      clayAoRadius: CLAY_AO_RADIUS_DEFAULT,
      clayAoBias: CLAY_AO_BIAS_DEFAULT,
      clayAoDistance: CLAY_AO_DISTANCE_DEFAULT,
      clayLightIntensity: CLAY_LIGHT_INTENSITY_DEFAULT,
      claySurfaceColor: CLAY_SURFACE_COLOR_DEFAULT,
      clayGlassOpacity: CLAY_GLASS_OPACITY_DEFAULT,
      clayOriginalColorBlend: CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
    });
  });

  it('detects transparent fragment materials and IFC glazing classes', () => {
    expect(isTransparentMaterialDefinition({ opacity: 0.4, transparent: true })).toBe(true);
    expect(isTransparentMaterialDefinition({ opacity: 1, transparent: false })).toBe(false);
    expect(isClayGlassElement({ ifcClass: 'IfcWindow' })).toBe(true);
    expect(isClayGlassElement({ ifcClass: 'IfcWall' })).toBe(false);
  });

  it('blends clay colour and opacity toward surface material values', () => {
    const original = new THREE.Color('#ff0000');
    const surface = new THREE.Color('#ffffff');
    const mid = blendClayColor(original, surface, 0.5);
    expect(mid.r).toBeCloseTo(1, 5);
    expect(mid.g).toBeCloseTo(0.5, 5);
    expect(blendClayScalar(0.2, 0.8, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('reads fragment material colours from strings and hex numbers', () => {
    expect(readMaterialDefinitionColor({ color: '#336699' }).getHexString()).toBe('336699');
    expect(readMaterialDefinitionColor({ color: 0xff0000 }).getHexString()).toBe('ff0000');
    expect(hasMaterialDefinitionColor({ color: '#336699' })).toBe(true);
  });

  it('reads fragment colours when isColor is set but clone is missing', () => {
    const fragmentsStyleColor = { isColor: true, r: 51, g: 102, b: 153 };
    const parsed = readMaterialDefinitionColor({ color: fragmentsStyleColor });
    expect(parsed?.isColor).toBe(true);
    expect(parsed.getHexString()).toBe('7caacb');
    expect(hasMaterialDefinitionColor({ color: fragmentsStyleColor })).toBe(true);
  });

  it('keeps native materials at partial Orig without IFC metadata', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2, 3], {
      surfaceColor: '#ff0000',
      originalColorBlend: 0.5,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    expect(model.highlight).not.toHaveBeenCalled();
  });

  it('skips highlights at 0% Orig without IFC metadata', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2, 3], {
      surfaceColor: '#ff0000',
      originalColorBlend: 0,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    expect(model.highlight).not.toHaveBeenCalled();
  });

  it('applies uniform surface colour at 100% Orig even without IFC metadata', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2, 3], {
      surfaceColor: '#ff0000',
      originalColorBlend: 1,
    });
    expect(model.resetHighlight).not.toHaveBeenCalled();
    expect(model.highlight).toHaveBeenCalledTimes(1);
    expect(model.highlight.mock.calls[0][0]).toEqual([1, 2, 3]);
    expect(model.highlight.mock.calls[0][1].color.getHexString()).toBe('ff0000');
    expect(globalThis.__canvasBimClayDebug).toMatchObject({
      phase: 'applyClayBaseMaterials',
      ok: true,
      stats: expect.objectContaining({
        highlightedLocalIdCount: 3,
        surfaceBlend: 1,
        surfaceColor: '#ff0000',
      }),
    });
  });

  it('returns null for partial Orig without IFC colour metadata', () => {
    expect(resolveClayHighlightMaterial({
      definition: { opacity: 1, transparent: false },
      surfaceColor: '#aabbcc',
      originalColorBlend: 0.5,
    })).toBeNull();
  });

  it('skips highlights at partial Orig without IFC metadata', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2, 3], {
      surfaceColor: '#aabbcc',
      originalColorBlend: 0.5,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    expect(model.highlight).not.toHaveBeenCalled();
  });

  it('prefetches fragment material groups in batched local-id calls', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async (localIds) => ([{
        localIds,
        definition: { color: new THREE.Color('#804020'), opacity: 1, transparent: false },
      }])),
      highlight: vi.fn(async () => {}),
    };
    clearClayMaterialGroupCache(model);
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2, 3], {
      surfaceColor: '#ffffff',
      originalColorBlend: 0.5,
    });
    expect(model.getItemsMaterialDefinition).toHaveBeenCalled();
    expect(model.getItemsMaterialDefinition).not.toHaveBeenCalledWith(null);
    expect(model.highlight).toHaveBeenCalledTimes(1);
  });

  it('always resets highlights at 0% Orig even during reapply', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2], {
      surfaceColor: '#f8f8f8',
      originalColorBlend: 0,
    }, { reapplyOnly: true });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    expect(model.highlight).not.toHaveBeenCalled();
  });

  it('returns uniform surface material at 100% Orig without IFC colour metadata', () => {
    const material = resolveClayHighlightMaterial({
      definition: { opacity: 1, transparent: false },
      surfaceColor: '#aabbcc',
      originalColorBlend: 1,
    });
    expect(material.color.getHexString()).toBe('aabbcc');
  });

  it('re-captures clay material snapshot when fragment localIds change', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async (localIds) => {
        if (localIds.includes(99)) {
          return [{
            localIds: [99],
            definition: { color: new THREE.Color('#112233'), opacity: 1, transparent: false },
          }];
        }
        return [];
      }),
    };
    await captureClayOriginalMaterialSnapshot(model, [1, 2]);
    expect(model.resetHighlight).not.toHaveBeenCalled();
    const second = await captureClayOriginalMaterialSnapshot(model, [99]);
    const cached = await captureClayOriginalMaterialSnapshot(model, [99]);
    expect(readMaterialDefinitionColor(second.get(99))?.getHexString()).toBe('112233');
    expect(readMaterialDefinitionColor(cached.get(99))?.getHexString()).toBe('112233');
    expect(fingerprintClayLocalIds([1, 2])).not.toBe(fingerprintClayLocalIds([99]));
  });

  it('invalidates stale snapshot so prefetch can populate IFC colours', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
    };
    await captureClayOriginalMaterialSnapshot(model, [5]);
    invalidateClayMaterialSnapshot(model);
    model.getItemsMaterialDefinition = vi.fn(async () => ([
      {
        localIds: [5],
        definition: { color: new THREE.Color('#445566'), opacity: 1, transparent: false },
      },
    ]));
    const refreshed = await captureClayOriginalMaterialSnapshot(model, [5]);
    expect(hasMaterialDefinitionColor(refreshed.get(5))).toBe(true);
  });

  it('applyClayViewportMaterials syncs fragments before and after highlight apply', async () => {
    const updateFragments = vi.fn(async () => true);
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => ([
        {
          localIds: [1],
          definition: { color: new THREE.Color('#804020'), opacity: 1, transparent: false },
        },
      ])),
      highlight: vi.fn(async () => {}),
    };
    const result = await applyClayViewportMaterials(
      model,
      { elements: [] },
      {},
      [1],
      { surfaceColor: '#ffffff', originalColorBlend: 0.5 },
      { updateFragments },
    );
    expect(updateFragments).toHaveBeenCalledTimes(2);
    expect(model.highlight).toHaveBeenCalledTimes(1);
    expect(model.highlight.mock.calls[0][1].color.getHexString()).toBe('cdc0bd');
    expect(result.ok).toBe(true);
    expect(result.stats.highlightedLocalIdCount).toBe(1);
    expect(globalThis.__canvasBimClayDebug).toMatchObject({
      phase: 'applyClayViewportMaterials',
      updateBeforeOk: true,
      updateAfterOk: true,
    });
  });

  it('keeps quiet viewport applies from publishing intermediate base markers', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayViewportMaterials(
      model,
      { elements: [] },
      {},
      [1, 2, 3],
      { surfaceColor: '#ff0000', originalColorBlend: 1 },
      { quietDebug: true },
    );
    expect(globalThis.__canvasBimClayDebug?.phase).not.toBe('applyClayBaseMaterials');
  });

  it('lerps known IFC colours toward the surface colour across partial blend values', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => ([
        {
          localIds: [1],
          definition: { color: new THREE.Color('#804020'), opacity: 1, transparent: false },
        },
      ])),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1], {
      surfaceColor: '#ffffff',
      originalColorBlend: 0.5,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    expect(model.highlight).toHaveBeenCalledTimes(1);
    expect(model.highlight.mock.calls[0][0]).toEqual([1]);
    expect(model.highlight.mock.calls[0][1].color.getHexString()).toBe('cdc0bd');
  });

  it('transitions from IFC colour to mixed colour to Surf colour at 0%, 50%, and 100% Orig', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => ([
        {
          localIds: [1],
          definition: { color: new THREE.Color('#336699'), opacity: 1, transparent: false },
        },
      ])),
      highlight: vi.fn(async () => {}),
    };

    await applyClayBaseMaterials(model, { elements: [] }, {}, [1], {
      surfaceColor: '#ff0000',
      originalColorBlend: 0,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    expect(model.highlight).not.toHaveBeenCalled();

    model.resetHighlight.mockClear();
    model.highlight.mockClear();
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1], {
      surfaceColor: '#ff0000',
      originalColorBlend: 0.5,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    const mixedColor = model.highlight.mock.calls[0][1].color.getHexString();
    expect(mixedColor).not.toBe('336699');
    expect(mixedColor).not.toBe('ff0000');

    model.resetHighlight.mockClear();
    model.highlight.mockClear();
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1], {
      surfaceColor: '#ff0000',
      originalColorBlend: 1,
    });
    expect(model.resetHighlight).not.toHaveBeenCalled();
    expect(model.highlight.mock.calls[0][1].color.getHexString()).toBe('ff0000');
  });

  it('resets all highlights when leaving full Surf for partial Orig', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => ([
        {
          localIds: [1],
          definition: { color: new THREE.Color('#804020'), opacity: 1, transparent: false },
        },
      ])),
      highlight: vi.fn(async () => {}),
    };
    clearClayMaterialGroupCache(model);

    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2, 3], {
      surfaceColor: '#ffffff',
      originalColorBlend: 1,
    });

    model.resetHighlight.mockClear();
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2, 3], {
      surfaceColor: '#ffffff',
      originalColorBlend: 0.5,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    expect(model.resetHighlight.mock.calls[0]).toEqual([]);
    expect(globalThis.__canvasBimClayDebug).toMatchObject({
      stats: expect.objectContaining({
        blendZone: 'partial',
        resetCalled: true,
        leavingFull: true,
        highlightedLocalIdCount: 1,
        nativeLeftCount: 2,
      }),
    });
  });

  it('resets before partial Orig reapply after fragments update', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => ([
        {
          localIds: [1],
          definition: { color: new THREE.Color('#804020'), opacity: 1, transparent: false },
        },
      ])),
      highlight: vi.fn(async () => {}),
    };
    clearClayMaterialGroupCache(model);
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2], {
      surfaceColor: '#ffffff',
      originalColorBlend: 0.25,
    });
    model.resetHighlight.mockClear();
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2], {
      surfaceColor: '#ffffff',
      originalColorBlend: 0.25,
    }, { reapplyOnly: true });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    expect(globalThis.__canvasBimClayDebug).toMatchObject({
      stats: expect.objectContaining({
        frameReapply: true,
        resetCalled: true,
        reapplyOnly: true,
      }),
    });
  });

  it('resets highlights during partial Orig slider moves', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => ([
        {
          localIds: [1],
          definition: { color: new THREE.Color('#804020'), opacity: 1, transparent: false },
        },
      ])),
      highlight: vi.fn(async () => {}),
    };
    clearClayMaterialGroupCache(model);

    await applyClayBaseMaterials(model, { elements: [] }, {}, [1], {
      surfaceColor: '#ffffff',
      originalColorBlend: 0.25,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);

    model.resetHighlight.mockClear();
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1], {
      surfaceColor: '#ffffff',
      originalColorBlend: 0.75,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
  });

  it('publishes blend zone and reset stats in clay debug markers', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2, 3], {
      surfaceColor: '#f8f8f8',
      originalColorBlend: 0.01,
    });
    expect(globalThis.__canvasBimClayDebug).toMatchObject({
      phase: 'applyClayBaseMaterials',
      ok: true,
      stats: expect.objectContaining({
        blendZone: 'partial',
        resetCalled: true,
        nativeLeftCount: 3,
        highlightedLocalIdCount: 0,
      }),
    });
  });

  it('disables blend-only fast path when Orig leaves the full Surf zone', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => ([
        {
          localIds: [1],
          definition: { color: new THREE.Color('#804020'), opacity: 1, transparent: false },
        },
      ])),
      highlight: vi.fn(async () => {}),
    };
    clearClayMaterialGroupCache(model);
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1], {
      surfaceColor: '#ffffff',
      originalColorBlend: 1,
    });
    expect(canReuseClayBlendFastPath(model, [1], 1)).toBe(true);
    expect(canReuseClayBlendFastPath(model, [1], 0.5)).toBe(false);
  });

  it('returns null for missing colours when no fallback is provided', () => {
    expect(readMaterialDefinitionColor({ opacity: 1 }, null)).toBeNull();
  });

  it('continues blending toward surface colour below 100% Orig', () => {
    const definition = { color: new THREE.Color('#804020'), opacity: 1, transparent: false };
    const at95 = resolveClayHighlightMaterial({
      definition,
      surfaceColor: '#ffffff',
      originalColorBlend: 0.95,
    });
    const at100 = resolveClayHighlightMaterial({
      definition,
      surfaceColor: '#ffffff',
      originalColorBlend: 1,
    });
    expect(at95.color.getHexString()).not.toBe('ffffff');
    expect(at95.color.getHexString()).not.toBe(at100.color.getHexString());
    expect(at100.color.getHexString()).toBe('ffffff');
  });

  it('builds highlight materials from fragment definitions', () => {
    const originalMaterial = resolveClayHighlightMaterial({
      definition: { color: new THREE.Color('#336699'), opacity: 0.4, transparent: true },
      surfaceColor: '#f8f8f8',
      glassOpacity: 0.25,
      originalColorBlend: 0,
      isGlazing: true,
    });
    expect(originalMaterial.color.getHexString()).toBe('336699');
    expect(originalMaterial.opacity).toBeCloseTo(0.4, 5);

    const fullSurface = resolveClayHighlightMaterial({
      definition: { color: new THREE.Color('#336699'), opacity: 0.4, transparent: true },
      surfaceColor: '#f8f8f8',
      glassOpacity: 0.25,
      originalColorBlend: 1,
      isGlazing: true,
    });
    expect(fullSurface.opacity).toBe(0.25);
    expect(fullSurface.transparent).toBe(true);
    expect(fullSurface.customId).toContain('canvas-bim-clay-glass');
  });

  it('resolves glazing local IDs from transparent materials and IFC classes', async () => {
    const model = {
      getItemsMaterialDefinition: vi.fn(async () => ([
        {
          localIds: [1, 2],
          definition: { color: new THREE.Color('#ffffff'), opacity: 0.3, transparent: true },
        },
        {
          localIds: [3],
          definition: { color: new THREE.Color('#cccccc'), opacity: 1, transparent: false },
        },
      ])),
      getLocalIdsByGuids: vi.fn(async (guids) => guids.map((guid) => (guid === 'door-guid' ? 4 : null))),
      highlight: vi.fn(async () => {}),
    };
    const preparedModel = {
      elements: [
        { ifcGlobalId: 'door-guid', ifcClass: 'IfcDoor' },
      ],
    };
    const glazingIds = await resolveClayGlazingLocalIds(
      model,
      preparedModel,
      createFragmentsIdCache(),
      [1, 2, 3, 4],
    );
    expect(glazingIds.sort()).toEqual([1, 2, 4]);
  });

  it('restores IFC materials when surface blend is 0%', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2], {
      originalColorBlend: 0,
    });
    expect(model.resetHighlight).toHaveBeenCalledTimes(1);
    expect(model.highlight).not.toHaveBeenCalled();
  });

  it('applies grouped clay materials from fragment material definitions', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => ([
        {
          localIds: [1],
          definition: { color: new THREE.Color('#224466'), opacity: 1, transparent: false },
        },
        {
          localIds: [2],
          definition: { color: new THREE.Color('#88ccff'), opacity: 0.2, transparent: true },
        },
      ])),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2], {
      surfaceColor: '#f8f8f8',
      glassOpacity: 0.31,
      originalColorBlend: 0.5,
    });
    expect(model.getItemsMaterialDefinition).toHaveBeenCalled();
    expect(model.highlight).toHaveBeenCalled();
    const customIds = model.highlight.mock.calls.map((call) => call[1].customId);
    expect(customIds).toContain('canvas-bim-clay-base');
    expect(customIds).toContain('canvas-bim-clay-glass');
  });

  it('applies uniform clay materials when surface blend is 100%', async () => {
    const cache = createFragmentsIdCache();
    cache.globalIdToLocalId.set('window-guid', 2);
    cache.localIdToGlobalId.set(2, 'window-guid');
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      getLocalIdsByGuids: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(
      model,
      { elements: [{ ifcGlobalId: 'window-guid', ifcClass: 'IfcWindow' }] },
      cache,
      [1, 2, 3],
      {
        surfaceColor: '#ff0000',
        glassOpacity: 0.42,
        originalColorBlend: 1,
      },
    );
    expect(model.getItemsMaterialDefinition).toHaveBeenCalled();
    expect(model.resetHighlight).not.toHaveBeenCalled();
    expect(model.highlight.mock.calls[0][1].customId).toBe('canvas-bim-clay-base');
    expect(model.highlight.mock.calls[0][1].color.getHexString()).toBe('ff0000');
    expect(model.highlight.mock.calls.at(-1)[1].customId).toBe('canvas-bim-clay-glass');
    expect(model.highlight.mock.calls.at(-1)[1].opacity).toBeCloseTo(0.42, 5);
  });

  it('accepts viewport workspace clay param keys', async () => {
    const model = {
      resetHighlight: vi.fn(async () => {}),
      getItemsMaterialDefinition: vi.fn(async () => []),
      highlight: vi.fn(async () => {}),
    };
    await applyClayBaseMaterials(model, { elements: [] }, {}, [1, 2], {
      claySurfaceColor: '#ff0000',
      clayGlassOpacity: 0.42,
      clayOriginalColorBlend: 1,
    });
    expect(resolveClayMaterialApplyParams({
      claySurfaceColor: '#112233',
      clayGlassOpacity: 0.2,
      clayOriginalColorBlend: 0.65,
    })).toMatchObject({
      surfaceColor: '#112233',
      glassOpacity: 0.2,
      originalColorBlend: 0.65,
    });
    expect(model.highlight.mock.calls[0][1].color.getHexString()).toBe('ff0000');
  });

  it('builds clay materials from style inputs', () => {
    expect(buildClayBaseMaterial({ surfaceColor: '#ffffff' }).color.getHexString()).toBe('ffffff');
    expect(buildClayGlassMaterial({ surfaceColor: '#eeeeee', glassOpacity: 0.25 }).opacity).toBe(0.25);
  });

  it('returns clay wireframe profile as a hidden-line overlay on SSAO', () => {
    expect(resolveClayWireframeStyle({})).toMatchObject({
      lineWeight: 1.25,
      opacity: 0.45,
      color: '#000000',
      hiddenLines: true,
      depthTest: true,
    });
    expect(resolveClayWireframeStyle({ hiddenLines: false })).toMatchObject({
      hiddenLines: false,
      depthTest: false,
    });
  });

  it('returns Rhino Arctic clay preset when entering clay mode', () => {
    expect(getClayPresetWorkspacePatch()).toMatchObject({
      renderStyle: 'clay',
      clayAoIntensity: 25,
      clayAoRadius: 0.0005,
      clayAoBias: 0.05,
      clayAoDistance: 0.17,
      clayAoSamples: 256,
      clayAoResolution: 1,
      clayLightIntensity: 2.7,
      clayGlassOpacity: 0.31,
      viewportBackgroundColor: '#ffffff',
      wireframeMode: false,
      wireframeColor: '#919191',
      wireframeOpacity: 0.5,
      wireframeLineWeight: 1.25,
      lightingMode: 'soft',
      environmentPreset: 'sunset',
    });
  });

  it('scales SSAO pass size from clay Res slider', () => {
    expect(resolveClaySsaoPassSize(1920, 1080, 1)).toEqual({
      width: 1920,
      height: 1080,
      scale: 1,
    });
    expect(resolveClaySsaoPassSize(1920, 1080, 0.25)).toEqual({
      width: 480,
      height: 270,
      scale: 0.25,
    });
  });

  it('disables shadow maps during clay SSAO composer render', () => {
    const renderer = {
      shadowMap: { enabled: true },
      setClearColor: () => {},
    };
    const composer = {
      render: () => {
        expect(renderer.shadowMap.enabled).toBe(false);
      },
    };
    const scene = { background: null };
    const camera = {
      near: 1,
      far: 100,
      projectionMatrix: { copy: () => {} },
      projectionMatrixInverse: { copy: () => {} },
      updateProjectionMatrix: () => {},
    };

    renderClayFrame({
      renderer,
      clayComposerState: {
        composer,
        baseWidth: 800,
        baseHeight: 600,
        ssaoPass: {
          width: 800,
          height: 600,
          kernelRadius: 1,
          minDistance: 0.01,
          maxDistance: 0.1,
          ssaoMaterial: {
            uniforms: {
              cameraNear: { value: 0 },
              cameraFar: { value: 0 },
              cameraProjectionMatrix: { value: { copy: () => {} } },
              cameraInverseProjectionMatrix: { value: { copy: () => {} } },
              kernelRadius: { value: 0 },
              minDistance: { value: 0 },
              maxDistance: { value: 0 },
            },
          },
          depthRenderMaterial: {
            uniforms: {
              cameraNear: { value: 0 },
              cameraFar: { value: 0 },
            },
          },
        },
      },
      scene,
      camera,
    });

    expect(renderer.shadowMap.enabled).toBe(true);
  });

  it('fits the model bounding sphere inside the clay depth range when viewed from outside', () => {
    const range = resolveClayCameraDepthRange({
      cameraPosition: new THREE.Vector3(0, 1.6, 80),
      boundsCenter: new THREE.Vector3(0, 1.6, 0),
      modelRadius: 40,
    });
    expect(range.insideBounds).toBe(false);
    expect(range.far).toBeGreaterThanOrEqual(80 - 0.5);
    expect(range.far - range.near).toBeLessThan(120);
  });

  it('uses a tight local frustum when zoomed inside the model bounds', () => {
    const range = resolveClayCameraDepthRange({
      cameraPosition: new THREE.Vector3(0, 1.6, 0),
      boundsCenter: new THREE.Vector3(12, 1.6, 0),
      cameraDistance: 4,
      modelRadius: 40,
    });
    expect(range.insideBounds).toBe(true);
    expect(range.near).toBeGreaterThan(0.02);
    expect(range.far - range.near).toBeLessThan(50);
    expect(range.far / range.near).toBeLessThan(2000);
  });

  it('tightens camera depth range for clay SSAO', () => {
    const camera = {
      near: 0.1,
      far: 100000,
      updateProjectionMatrix: () => {},
    };
    const restore = applyClayCameraDepthRange(camera, { cameraDistance: 50, modelRadius: 25 });
    expect(camera.far).toBeLessThan(200);
    expect(camera.near).toBeGreaterThan(0.004);
    restore();
    expect(camera.far).toBe(100000);
    expect(camera.near).toBe(0.1);
  });

  it('uses a tighter depth span when the camera is close to the orbit target', () => {
    const close = resolveClayCameraDepthRange({ cameraDistance: 3, modelRadius: 25 });
    const far = resolveClayCameraDepthRange({ cameraDistance: 80, modelRadius: 25 });
    expect(close.far - close.near).toBeLessThan(far.far - far.near);
  });

  it('scales SSAO kernel with view distance for screen-stable shading', () => {
    const radius = 25;
    const reference = radius * CLAY_SSAO_REFERENCE_DISTANCE_FACTOR;
    const close = resolveClaySsaoSettings({ modelRadius: radius, cameraDistance: 3 });
    const mid = resolveClaySsaoSettings({ modelRadius: radius, cameraDistance: 35 });
    const far = resolveClaySsaoSettings({ modelRadius: radius, cameraDistance: 90 });
    expect(close.viewScale).toBe(CLAY_SSAO_VIEW_SCALE_MIN);
    expect(mid.viewScale).toBeCloseTo(35 / reference, 2);
    expect(far.viewScale).toBe(CLAY_SSAO_VIEW_SCALE_MAX);
    expect(far.kernelRadius).toBeGreaterThanOrEqual(close.kernelRadius);
    expect(close.kernelRadius).toBeGreaterThan(CLAY_SSAO_KERNEL_RADIUS_FLOOR * 8);
  });

  it('scales SSAO distance thresholds down for wide camera depth spans', () => {
    const tight = resolveClaySsaoSettings({
      modelRadius: 40,
      cameraNear: 0.5,
      cameraFar: 35,
    });
    const wide = resolveClaySsaoSettings({
      modelRadius: 40,
      cameraNear: 0.001,
      cameraFar: 120,
    });
    expect(wide.minDistance).toBeLessThan(tight.minDistance);
    expect(wide.maxDistance).toBeLessThan(tight.maxDistance);
    expect(wide.minDistance).toBeCloseTo(tight.minDistance * (CLAY_SSAO_DEPTH_SPAN_REFERENCE / (120 - 0.001)), 4);
  });

  it('maps clay AO sliders to responsive SSAO settings', () => {
    const low = resolveClaySsaoSettings({
      aoIntensity: 0,
      aoRadius: CLAY_AO_RADIUS_MIN,
      aoBias: CLAY_AO_BIAS_MIN,
      aoDistance: CLAY_AO_DISTANCE_MIN,
      modelRadius: 24,
    });
    const high = resolveClaySsaoSettings({
      aoIntensity: 100,
      aoRadius: CLAY_AO_RADIUS_MAX,
      aoBias: CLAY_AO_BIAS_MAX,
      aoDistance: CLAY_AO_DISTANCE_MAX,
      modelRadius: 24,
    });
    expect(high.maxDistance).toBeGreaterThan(low.maxDistance * 2);
    expect(high.kernelRadius).toBeGreaterThan(low.kernelRadius);
    expect(high.minDistance).toBeGreaterThan(low.minDistance);
    expect(CLAY_AO_BIAS_DEFAULT).toBeGreaterThanOrEqual(CLAY_AO_BIAS_MIN);
    expect(CLAY_AO_BIAS_MIN).toBe(0.05);
  });

  it('updates clay composer SSAO settings from camera and model radius', () => {
    const camera = {
      near: 2,
      far: 120,
      projectionMatrix: { elements: new Array(16).fill(0), copy: () => {} },
      projectionMatrixInverse: { elements: new Array(16).fill(0), copy: () => {} },
    };
    const state = {
      baseWidth: 1920,
      baseHeight: 1080,
      ssaoPass: {
        width: 1920,
        height: 1080,
        kernelRadius: 8,
        maxDistance: 0.1,
        minDistance: 0.002,
        kernel: new Array(32).fill(null),
        setSize: vi.fn(function setSize(width, height) {
          this.width = width;
          this.height = height;
        }),
        ssaoMaterial: {
          defines: { KERNEL_SIZE: 32 },
          uniforms: {
            cameraNear: { value: 0 },
            cameraFar: { value: 0 },
            cameraProjectionMatrix: { value: { copy: () => {} } },
            cameraInverseProjectionMatrix: { value: { copy: () => {} } },
            kernelRadius: { value: 0 },
            minDistance: { value: 0 },
            maxDistance: { value: 0 },
            kernel: { value: new Array(32).fill(null) },
          },
          needsUpdate: false,
        },
        depthRenderMaterial: {
          uniforms: {
            cameraNear: { value: 0 },
            cameraFar: { value: 0 },
          },
        },
      },
    };
    updateClayComposerSettings(state, {
      aoIntensity: 12.5,
      aoRadius: 0.02,
      aoBias: 0.2,
      aoDistance: CLAY_AO_DISTANCE_DEFAULT,
      camera,
      modelRadius: 24,
    });
    expect(state.ssaoPass.kernelRadius).toBeGreaterThanOrEqual(4);
    expect(state.ssaoPass.minDistance).toBeGreaterThan(0.009);
    expect(state.ssaoPass.maxDistance).toBeGreaterThan(0.03);
    expect(state.ssaoPass.maxDistance).toBeLessThanOrEqual(0.13);
    expect(state.ssaoPass.ssaoMaterial.uniforms.cameraFar.value).toBe(120);
  });

  it('clamps AO sample count and resolution scale', () => {
    expect(resolveClaySsaoKernelSize(4)).toBe(8);
    expect(resolveClaySsaoKernelSize(80)).toBe(80);
    expect(resolveClaySsaoKernelSize(512)).toBe(256);
    expect(resolveClaySsaoPassSize(1920, 1080, 0.5)).toEqual({
      width: 960,
      height: 540,
      scale: 0.5,
    });
  });

  it('updates SSAO sample count and pass resolution from clay quality sliders', () => {
    const ssaoPass = {
      width: 1920,
      height: 1080,
      kernel: new Array(32).fill(null),
      setSize: vi.fn(function setSize(width, height) {
        this.width = width;
        this.height = height;
      }),
      ssaoMaterial: {
        defines: { KERNEL_SIZE: 32 },
        uniforms: {
          kernel: { value: new Array(32).fill(null) },
        },
        needsUpdate: false,
      },
    };
    const clayComposerState = {
      baseWidth: 1920,
      baseHeight: 1080,
      ssaoPass,
    };

    updateClaySsaoQuality(clayComposerState, { aoSamples: 16, aoResolution: 0.5 });

    expect(ssaoPass.ssaoMaterial.defines.KERNEL_SIZE).toBe(16);
    expect(ssaoPass.kernel).toHaveLength(16);
    expect(ssaoPass.setSize).toHaveBeenCalledWith(960, 540);
    expect(applyClaySsaoSampleCount(ssaoPass, 16)).toBe(true);
  });

  it('updates clay lighting intensity from style input', () => {
    const hemisphere = { isHemisphereLight: true, intensity: 0.72 };
    const directional = { isDirectionalLight: true, intensity: 0.12 };
    updateClayLightingIntensity({ lights: { children: [hemisphere, directional] } }, 0.4);
    expect(hemisphere.intensity).toBe(0.4);
    expect(directional.intensity).toBeCloseTo(0.068);
  });

  it('uses subtle grey clay selection material', () => {
    expect(CLAY_SELECTED_MATERIAL.color.getHexString()).toBe('e5e5e5');
  });

  it('copies render-target depth to the screen buffer when blitFramebuffer is available', () => {
    const readBuffer = {};
    const drawBuffer = {};
    const gl = {
      DEPTH_BUFFER_BIT: 256,
      NEAREST: 9728,
      FRAMEBUFFER_BINDING: 36006,
      READ_FRAMEBUFFER: 36008,
      DRAW_FRAMEBUFFER: 36009,
      bindFramebuffer: vi.fn(),
      blitFramebuffer: vi.fn(),
      getParameter: vi.fn(() => drawBuffer),
    };
    const depthSource = { width: 1280, height: 720, depthBuffer: true };
    const renderer = {
      getContext: () => gl,
      properties: {
        get: () => ({ __webglFramebuffer: readBuffer }),
      },
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
    };

    expect(copyRenderTargetDepthToScreen(renderer, depthSource, 1280, 720)).toBe(true);
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.DRAW_FRAMEBUFFER, null);
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.READ_FRAMEBUFFER, readBuffer);
    expect(gl.blitFramebuffer).toHaveBeenCalledWith(
      0, 0, 1280, 720,
      0, 0, 1280, 720,
      gl.DEPTH_BUFFER_BIT,
      gl.NEAREST,
    );
    expect(resolveClayComposerDepthSource({
      composer: { readBuffer: { width: 10 }, writeBuffer: { width: 20 } },
    }).width).toBe(10);
  });

  it('copies clay composer depth from whichever buffer still holds the render-pass depth', () => {
    const readBuffer = { width: 1280, height: 720, depthBuffer: true };
    const writeBuffer = { width: 1280, height: 720, depthBuffer: true };
    const gl = {
      DEPTH_BUFFER_BIT: 256,
      NEAREST: 9728,
      NO_ERROR: 0,
      bindFramebuffer: vi.fn(),
      blitFramebuffer: vi.fn(),
      getError: vi.fn(() => 0),
    };
    const renderer = {
      getContext: () => gl,
      properties: {
        get: (target) => ({ __webglFramebuffer: target === readBuffer ? 'read-fbo' : 'write-fbo' }),
      },
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
    };

    expect(copyClayComposerDepthToScreen(renderer, {
      composer: { readBuffer, writeBuffer },
    }, 1280, 720)).toBe(true);
    expect(gl.blitFramebuffer).toHaveBeenCalled();
  });

  it('populates screen depth without writing color', () => {
    const colorBuffer = {
      setMask: vi.fn(),
      setLocked: vi.fn(),
    };
    const depthBuffer = {
      setTest: vi.fn(),
      setMask: vi.fn(),
    };
    const renderer = {
      autoClear: true,
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
      clearDepth: vi.fn(),
      render: vi.fn(),
      state: {
        buffers: {
          color: colorBuffer,
          depth: depthBuffer,
        },
      },
    };
    const scene = {};
    const camera = {};

    expect(populateScreenDepthFromScene(renderer, scene, camera)).toBe(true);
    expect(colorBuffer.setMask).toHaveBeenCalledWith(false);
    expect(colorBuffer.setLocked).toHaveBeenCalledWith(true);
    expect(renderer.clearDepth).toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    expect(colorBuffer.setLocked).toHaveBeenCalledWith(false);
    expect(colorBuffer.setMask).toHaveBeenCalledWith(true);
  });

  it('renders clay wireframe overlay after composer without repainting the scene', () => {
    const colorBuffer = {
      setMask: vi.fn(),
      setLocked: vi.fn(),
    };
    const depthBuffer = {
      setTest: vi.fn(),
      setMask: vi.fn(),
    };
    const scene = {
      overrideMaterial: null,
    };
    const camera = {
      near: 2,
      far: 120,
      updateProjectionMatrix: () => {},
    };
    const renderer = {
      autoClear: true,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clearDepth: () => {},
      getRenderTarget: () => null,
      state: {
        buffers: {
          color: colorBuffer,
          depth: depthBuffer,
        },
      },
      render: () => {},
    };
    const composer = { render: () => {} };
    const overlayScene = {};
    const wireframeEdges = {
      parent: overlayScene,
      visible: true,
      updateMatrixWorld: () => {},
      material: {
        depthTest: true,
        depthWrite: true,
        resolution: { set: () => {} },
        color: { set: () => {} },
      },
    };
    let renderCalls = 0;
    renderer.render = () => {
      renderCalls += 1;
    };

    const rendered = renderClayFrame({
      renderer,
      clayComposerState: {
        composer,
        ssaoPass: {
          kernelRadius: 4,
          minDistance: 0.01,
          maxDistance: 0.1,
          ssaoMaterial: {
            uniforms: {
              cameraNear: { value: 0 },
              cameraFar: { value: 0 },
              cameraProjectionMatrix: { value: { copy: () => {} } },
              cameraInverseProjectionMatrix: { value: { copy: () => {} } },
              kernelRadius: { value: 0 },
              minDistance: { value: 0 },
              maxDistance: { value: 0 },
            },
          },
          depthRenderMaterial: {
            uniforms: {
              cameraNear: { value: 0 },
              cameraFar: { value: 0 },
            },
          },
        },
      },
      scene,
      overlayScene,
      camera,
      wireframeEdges,
      wireframeEnabled: true,
      wireframeOptions: resolveClayWireframeStyle({ color: '#000000' }),
    });

    expect(rendered).toBe(true);
    expect(renderCalls).toBe(2);
  });

  it('skips clay wireframe overlay when line opacity is zero', () => {
    const renderer = {
      autoClear: true,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clearDepth: () => {},
      render: () => {},
    };
    const scene = { background: null, overrideMaterial: null };
    const overlayScene = {};
    const camera = {
      near: 0.1,
      far: 100,
      updateProjectionMatrix: () => {},
      projectionMatrix: { copy: () => {} },
      projectionMatrixInverse: { copy: () => {} },
    };
    let composerRenderCalls = 0;
    let wireframeRenderCalls = 0;
    const composer = { render: () => { composerRenderCalls += 1; } };
    const wireframeEdges = {
      parent: overlayScene,
      visible: true,
      updateMatrixWorld: () => {},
      material: {
        depthTest: true,
        depthWrite: true,
        resolution: { set: () => {} },
        color: { set: () => {} },
      },
    };
    renderer.render = () => {
      wireframeRenderCalls += 1;
    };

    const rendered = renderClayFrame({
      renderer,
      clayComposerState: {
        composer,
        ssaoPass: {
          kernelRadius: 4,
          minDistance: 0.01,
          maxDistance: 0.1,
          ssaoMaterial: {
            uniforms: {
              cameraNear: { value: 0 },
              cameraFar: { value: 0 },
              cameraProjectionMatrix: { value: { copy: () => {} } },
              cameraInverseProjectionMatrix: { value: { copy: () => {} } },
              kernelRadius: { value: 0 },
              minDistance: { value: 0 },
              maxDistance: { value: 0 },
            },
          },
          depthRenderMaterial: {
            uniforms: {
              cameraNear: { value: 0 },
              cameraFar: { value: 0 },
            },
          },
        },
      },
      scene,
      overlayScene,
      camera,
      wireframeEdges,
      wireframeEnabled: true,
      wireframeOptions: resolveClayWireframeStyle({ opacity: 0 }),
    });

    expect(rendered).toBe(true);
    expect(composerRenderCalls).toBe(1);
    expect(wireframeRenderCalls).toBe(0);
  });
});
