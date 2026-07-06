import { describe, expect, it } from 'vitest';
import {
  buildSunStudyReadout,
  computeSolarPosition,
  normalizeBimEnvironmentalAnalysisState,
  patchBimEnvironmentalAnalysisState,
  resolveSunDirection,
  shadowMapSizeForQuality,
  zonedDateTimeToUtcDate,
} from '../bimSunStudy.js';

describe('bimSunStudy environmental analysis state', () => {
  it('defaults to disabled visual sun study with shared site state', () => {
    const state = normalizeBimEnvironmentalAnalysisState();

    expect(state).toMatchObject({
      schemaVersion: 1,
      site: {
        latitude: -37.8136,
        longitude: 144.9631,
        timezone: 'Australia/Melbourne',
        trueNorthOffsetDeg: 0,
        source: 'manual',
      },
      sunStudy: {
        enabled: false,
        controlMode: 'manual',
        showSunTracker: false,
        shadowsEnabled: true,
        shadowQuality: 'medium',
        manual: {
          azimuthDeg: 215,
          elevationDeg: 35,
        },
      },
      lightingAnalysis: {
        schemaVersion: 1,
        enabled: false,
      },
      heatAnalysis: {
        schemaVersion: 1,
        enabled: false,
      },
    });
  });

  it('clamps invalid numbers and preserves valid sun study toggles', () => {
    const state = normalizeBimEnvironmentalAnalysisState({
      site: {
        latitude: -200,
        longitude: 240,
        timezone: 'Australia/Sydney',
        trueNorthOffsetDeg: 999,
      },
      sunStudy: {
        enabled: true,
        controlMode: 'geo',
        showSkyDome: true,
        showSunTracker: true,
        shadowsEnabled: false,
        shadowQuality: 'high',
        manual: {
          azimuthDeg: 450,
          elevationDeg: -20,
        },
        geo: {
          dateTimeLocal: '2026-12-01T09:15',
        },
      },
    });

    expect(state.site).toMatchObject({
      latitude: -90,
      longitude: 180,
      timezone: 'Australia/Sydney',
      trueNorthOffsetDeg: 180,
    });
    expect(state.sunStudy).toMatchObject({
      enabled: true,
      controlMode: 'geo',
      showSkyDome: true,
      showSunTracker: true,
      shadowsEnabled: false,
      shadowQuality: 'high',
      manual: {
        azimuthDeg: 360,
        elevationDeg: -5,
      },
      geo: {
        dateTimeLocal: '2026-12-01T09:15',
      },
    });
  });

  it('patches nested site, manual, geo, and animation state without dropping siblings', () => {
    const current = normalizeBimEnvironmentalAnalysisState({
      sunStudy: {
        enabled: true,
        manual: { azimuthDeg: 120, elevationDeg: 42 },
      },
    });

    const next = patchBimEnvironmentalAnalysisState(current, {
      site: { trueNorthOffsetDeg: 12 },
      sunStudy: {
        manual: { azimuthDeg: 180 },
        animation: { enabled: true },
      },
    });

    expect(next.site.trueNorthOffsetDeg).toBe(12);
    expect(next.sunStudy.enabled).toBe(true);
    expect(next.sunStudy.manual).toEqual({ azimuthDeg: 180, elevationDeg: 42 });
    expect(next.sunStudy.animation).toMatchObject({
      enabled: true,
      playbackSpeedHoursPerSecond: 1,
    });
  });

  it('converts local timezone wall time to UTC across daylight saving offsets', () => {
    expect(zonedDateTimeToUtcDate('2026-07-05T14:30', 'Australia/Melbourne').toISOString())
      .toBe('2026-07-05T04:30:00.000Z');
    expect(zonedDateTimeToUtcDate('2026-12-05T14:30', 'Australia/Melbourne').toISOString())
      .toBe('2026-12-05T03:30:00.000Z');
  });

  it('computes plausible southern hemisphere solar positions', () => {
    const winter = computeSolarPosition({
      latitude: -37.8136,
      longitude: 144.9631,
      timezone: 'Australia/Melbourne',
      dateTimeLocal: '2026-06-21T12:00',
    });
    const summer = computeSolarPosition({
      latitude: -37.8136,
      longitude: 144.9631,
      timezone: 'Australia/Melbourne',
      dateTimeLocal: '2026-12-21T12:00',
    });

    expect(winter.elevationDeg).toBeGreaterThan(20);
    expect(winter.elevationDeg).toBeLessThan(35);
    expect(summer.elevationDeg).toBeGreaterThan(65);
    expect(summer.elevationDeg).toBeLessThan(85);
  });

  it('resolves north-clockwise azimuth into BIM y-up direction vectors', () => {
    expect(resolveSunDirection({ azimuthDeg: 0, elevationDeg: 0 })).toMatchObject({
      x: expect.closeTo(0, 6),
      y: expect.closeTo(0, 6),
      z: expect.closeTo(1, 6),
    });
    expect(resolveSunDirection({ azimuthDeg: 90, elevationDeg: 0 })).toMatchObject({
      x: expect.closeTo(1, 6),
      y: expect.closeTo(0, 6),
      z: expect.closeTo(0, 6),
    });
  });

  it('maps shadow quality and readout state for the HUD', () => {
    expect(shadowMapSizeForQuality('low')).toBe(1024);
    expect(shadowMapSizeForQuality('medium')).toBe(2048);
    expect(shadowMapSizeForQuality('high')).toBe(4096);

    const readout = buildSunStudyReadout({
      sunStudy: {
        enabled: true,
        manual: {
          azimuthDeg: 180,
          elevationDeg: -2,
        },
      },
    });
    expect(readout.belowHorizon).toBe(true);
    expect(readout.intensity).toBe(0);
  });

  it('does not change resolved sun position when only shadow quality changes', () => {
    const current = normalizeBimEnvironmentalAnalysisState({
      site: {
        trueNorthOffsetDeg: 17,
      },
      sunStudy: {
        enabled: true,
        controlMode: 'manual',
        shadowQuality: 'low',
        manual: {
          azimuthDeg: 123,
          elevationDeg: 44,
        },
      },
    });
    const before = buildSunStudyReadout(current);
    const next = patchBimEnvironmentalAnalysisState(current, {
      sunStudy: {
        shadowQuality: 'high',
      },
    });
    const after = buildSunStudyReadout(next);

    expect(after.azimuthDeg).toBe(before.azimuthDeg);
    expect(after.elevationDeg).toBe(before.elevationDeg);
    expect(next.sunStudy.manual).toEqual(current.sunStudy.manual);
    expect(next.site.trueNorthOffsetDeg).toBe(current.site.trueNorthOffsetDeg);
  });
});
