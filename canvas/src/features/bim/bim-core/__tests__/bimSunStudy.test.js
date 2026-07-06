import { describe, expect, it } from 'vitest';
import {
  buildSunStudyReadout,
  buildSunPathSamples,
  buildSunPathGridSamples,
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
        daylightSavingTime: true,
        source: 'manual',
      },
      sunStudy: {
        enabled: false,
        controlMode: 'manual',
        showSunTracker: false,
        showSunPath: false,
        showCompass: true,
        sunPathRadius: 1,
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
        daylightSavingTime: false,
      },
      sunStudy: {
        enabled: true,
        controlMode: 'geo',
        showSkyDome: true,
        showSunTracker: true,
        showSunPath: true,
        showCompass: false,
        sunPathRadius: 3,
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
      daylightSavingTime: false,
    });
    expect(state.sunStudy).toMatchObject({
      enabled: true,
      controlMode: 'geo',
      showSkyDome: true,
      showSunTracker: true,
      showSunPath: true,
      showCompass: false,
      sunPathRadius: 3,
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
    expect(zonedDateTimeToUtcDate(
      '2026-12-05T14:30',
      'Australia/Melbourne',
      { daylightSavingTime: false },
    ).toISOString()).toBe('2026-12-05T04:30:00.000Z');
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

  it('keeps Melbourne summer morning and afternoon on opposite sides of the sun path', () => {
    const morning = computeSolarPosition({
      latitude: -37.8136,
      longitude: 144.9631,
      timezone: 'Australia/Melbourne',
      dateTimeLocal: '2026-12-21T09:00',
    });
    const noon = computeSolarPosition({
      latitude: -37.8136,
      longitude: 144.9631,
      timezone: 'Australia/Melbourne',
      dateTimeLocal: '2026-12-21T12:00',
    });
    const afternoon = computeSolarPosition({
      latitude: -37.8136,
      longitude: 144.9631,
      timezone: 'Australia/Melbourne',
      dateTimeLocal: '2026-12-21T15:00',
    });

    expect(morning.azimuthDeg).toBeGreaterThan(80);
    expect(morning.azimuthDeg).toBeLessThan(140);
    expect(noon.azimuthDeg).toBeGreaterThan(0);
    expect(noon.azimuthDeg).toBeLessThan(60);
    expect(afternoon.azimuthDeg).toBeGreaterThan(250);
    expect(afternoon.azimuthDeg).toBeLessThan(330);
  });

  it('responds to longitude, latitude, and daylight saving in geo mode', () => {
    const base = {
      latitude: -37.8136,
      longitude: 144.9631,
      timezone: 'Australia/Melbourne',
      dateTimeLocal: '2026-12-05T14:30',
    };
    const melbourne = computeSolarPosition(base);
    const furtherEast = computeSolarPosition({
      ...base,
      longitude: 150,
    });
    const furtherNorth = computeSolarPosition({
      ...base,
      latitude: -27.4698,
    });
    const standardTime = computeSolarPosition({
      ...base,
      daylightSavingTime: false,
    });

    expect(Math.abs(furtherEast.azimuthDeg - melbourne.azimuthDeg)).toBeGreaterThan(1);
    expect(Math.abs(furtherNorth.elevationDeg - melbourne.elevationDeg)).toBeGreaterThan(3);
    expect(standardTime.utcIso).toBe('2026-12-05T04:30:00.000Z');
    expect(standardTime.timezoneOffsetMinutes).toBe(600);
    expect(Math.abs(standardTime.azimuthDeg - melbourne.azimuthDeg)).toBeGreaterThan(8);
    expect(Math.abs(standardTime.elevationDeg - melbourne.elevationDeg)).toBeGreaterThan(4);
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

  it('builds selected-date sun path samples without mutating current sun settings', () => {
    const state = normalizeBimEnvironmentalAnalysisState({
      sunStudy: {
        enabled: true,
        controlMode: 'geo',
        showSunPath: true,
        geo: {
          dateTimeLocal: '2026-12-21T12:00',
        },
      },
    });
    const samples = buildSunPathSamples(state, { intervalMinutes: 60 });

    expect(samples).toHaveLength(25);
    expect(samples.some((sample) => sample.elevationDeg > 0)).toBe(true);
    expect(samples.every((sample) => sample.dateTimeLocal.startsWith('2026-12-21T'))).toBe(true);
    expect(state.sunStudy.geo.dateTimeLocal).toBe('2026-12-21T12:00');
  });

  it('builds annual sun path grid samples for month arcs and hour curves', () => {
    const state = normalizeBimEnvironmentalAnalysisState({
      sunStudy: {
        enabled: true,
        controlMode: 'geo',
        showSunPath: true,
        geo: {
          dateTimeLocal: '2026-07-05T14:30',
        },
      },
    });
    const grid = buildSunPathGridSamples(state);

    expect(grid.monthArcs).toHaveLength(12);
    expect(grid.hourCurves).toHaveLength(13);
    expect(grid.monthArcs[0].samples.length).toBeGreaterThan(20);
    expect(grid.hourCurves[0].samples.length).toBeGreaterThan(70);
    expect(grid.hourCurves.every((curve) => (
      curve.samples.every((sample) => sample.timeBasis === 'standard' && sample.daylightSavingTime === false)
    ))).toBe(true);
    expect(grid.monthArcs.every((arc) => arc.samples.every((sample) => sample.dateTimeLocal.startsWith('2026-'))))
      .toBe(true);
  });

  it('generates dense constant-hour analemma curves from the same apparent solar position maths', () => {
    const state = normalizeBimEnvironmentalAnalysisState({
      site: {
        latitude: -37.8136,
        longitude: 144.9631,
        timezone: 'Australia/Melbourne',
        daylightSavingTime: true,
      },
      sunStudy: {
        enabled: true,
        controlMode: 'geo',
        showSunPath: true,
        geo: {
          dateTimeLocal: '2026-07-05T14:30',
        },
      },
    });
    const grid = buildSunPathGridSamples(state);
    const noonCurve = grid.hourCurves.find((curve) => curve.hour === 12);
    const azimuthDeltas = noonCurve.samples.slice(1).map((sample, index) => {
      let delta = sample.azimuthDeg - noonCurve.samples[index].azimuthDeg;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      return delta;
    });
    const derivativeSignChanges = azimuthDeltas.reduce((count, delta, index, deltas) => {
      const sign = Math.sign(delta);
      if (sign === 0 || index === 0) return count;
      const previousSign = Math.sign(deltas[index - 1]);
      return previousSign !== 0 && previousSign !== sign ? count + 1 : count;
    }, 0);

    expect(noonCurve.samples.length).toBeGreaterThan(70);
    expect(derivativeSignChanges).toBeGreaterThanOrEqual(3);
    expect(Math.max(...noonCurve.samples.map((sample) => sample.elevationDeg))).toBeGreaterThan(70);
    expect(Math.min(...noonCurve.samples.map((sample) => sample.elevationDeg))).toBeLessThan(35);
  });
});
