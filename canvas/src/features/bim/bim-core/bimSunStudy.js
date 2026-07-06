export const BIM_ENVIRONMENTAL_ANALYSIS_SCHEMA_VERSION = 1;

export const BIM_SUN_STUDY_CONTROL_MODES = ['manual', 'geo'];
export const BIM_SUN_STUDY_SHADOW_QUALITIES = ['low', 'medium', 'high'];

const DEFAULT_SITE = {
  latitude: -37.8136,
  longitude: 144.9631,
  timezone: 'Australia/Melbourne',
  trueNorthOffsetDeg: 0,
  source: 'manual',
};

const DEFAULT_SUN_STUDY = {
  enabled: false,
  controlMode: 'manual',
  showSkyDome: false,
  showSunTracker: false,
  shadowsEnabled: true,
  shadowQuality: 'medium',
  groundReceiverEnabled: true,
  manual: {
    azimuthDeg: 215,
    elevationDeg: 35,
  },
  geo: {
    dateTimeLocal: '2026-07-05T14:30',
  },
  animation: {
    enabled: false,
    playbackSpeedHoursPerSecond: 1,
    persistWhilePlaying: false,
  },
};

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeDateTimeLocal(value, fallback = DEFAULT_SUN_STUDY.geo.dateTimeLocal) {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text;
  return fallback;
}

export function normalizeBimSiteState(site = {}) {
  const timezone = String(site?.timezone ?? DEFAULT_SITE.timezone).trim();
  return {
    latitude: clampNumber(site?.latitude, -90, 90, DEFAULT_SITE.latitude),
    longitude: clampNumber(site?.longitude, -180, 180, DEFAULT_SITE.longitude),
    timezone: timezone || DEFAULT_SITE.timezone,
    trueNorthOffsetDeg: clampNumber(
      site?.trueNorthOffsetDeg,
      -180,
      180,
      DEFAULT_SITE.trueNorthOffsetDeg,
    ),
    source: ['manual', 'ifcSite', 'imported'].includes(site?.source) ? site.source : DEFAULT_SITE.source,
  };
}

export function normalizeBimSunStudyState(sunStudy = {}) {
  const manual = sunStudy?.manual && typeof sunStudy.manual === 'object' ? sunStudy.manual : {};
  const geo = sunStudy?.geo && typeof sunStudy.geo === 'object' ? sunStudy.geo : {};
  const animation = sunStudy?.animation && typeof sunStudy.animation === 'object' ? sunStudy.animation : {};
  return {
    enabled: sunStudy?.enabled === true,
    controlMode: BIM_SUN_STUDY_CONTROL_MODES.includes(sunStudy?.controlMode)
      ? sunStudy.controlMode
      : DEFAULT_SUN_STUDY.controlMode,
    showSkyDome: sunStudy?.showSkyDome === true,
    showSunTracker: sunStudy?.showSunTracker === true,
    shadowsEnabled: sunStudy?.shadowsEnabled !== false,
    shadowQuality: BIM_SUN_STUDY_SHADOW_QUALITIES.includes(sunStudy?.shadowQuality)
      ? sunStudy.shadowQuality
      : DEFAULT_SUN_STUDY.shadowQuality,
    groundReceiverEnabled: sunStudy?.groundReceiverEnabled !== false,
    manual: {
      azimuthDeg: clampNumber(manual.azimuthDeg, 0, 360, DEFAULT_SUN_STUDY.manual.azimuthDeg),
      elevationDeg: clampNumber(manual.elevationDeg, -5, 90, DEFAULT_SUN_STUDY.manual.elevationDeg),
    },
    geo: {
      dateTimeLocal: normalizeDateTimeLocal(geo.dateTimeLocal),
    },
    animation: {
      enabled: animation.enabled === true,
      playbackSpeedHoursPerSecond: clampNumber(
        animation.playbackSpeedHoursPerSecond,
        0.1,
        24,
        DEFAULT_SUN_STUDY.animation.playbackSpeedHoursPerSecond,
      ),
      persistWhilePlaying: animation.persistWhilePlaying === true,
    },
  };
}

export function normalizeBimEnvironmentalAnalysisState(environmentalAnalysis = {}) {
  const source = environmentalAnalysis && typeof environmentalAnalysis === 'object'
    ? environmentalAnalysis
    : {};
  return {
    schemaVersion: BIM_ENVIRONMENTAL_ANALYSIS_SCHEMA_VERSION,
    site: normalizeBimSiteState(source.site),
    sunStudy: normalizeBimSunStudyState(source.sunStudy),
    lightingAnalysis: {
      schemaVersion: BIM_ENVIRONMENTAL_ANALYSIS_SCHEMA_VERSION,
      enabled: source.lightingAnalysis?.enabled === true,
    },
    heatAnalysis: {
      schemaVersion: BIM_ENVIRONMENTAL_ANALYSIS_SCHEMA_VERSION,
      enabled: source.heatAnalysis?.enabled === true,
    },
  };
}

export function patchBimEnvironmentalAnalysisState(environmentalAnalysis, patch = {}) {
  const current = normalizeBimEnvironmentalAnalysisState(environmentalAnalysis);
  return normalizeBimEnvironmentalAnalysisState({
    ...current,
    ...patch,
    site: {
      ...current.site,
      ...(patch.site ?? {}),
    },
    sunStudy: {
      ...current.sunStudy,
      ...(patch.sunStudy ?? {}),
      manual: {
        ...current.sunStudy.manual,
        ...(patch.sunStudy?.manual ?? {}),
      },
      geo: {
        ...current.sunStudy.geo,
        ...(patch.sunStudy?.geo ?? {}),
      },
      animation: {
        ...current.sunStudy.animation,
        ...(patch.sunStudy?.animation ?? {}),
      },
    },
    lightingAnalysis: {
      ...current.lightingAnalysis,
      ...(patch.lightingAnalysis ?? {}),
    },
    heatAnalysis: {
      ...current.heatAnalysis,
      ...(patch.heatAnalysis ?? {}),
    },
  });
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MS_PER_MINUTE = 60 * 1000;

export function normalizeDegrees(degrees) {
  const numeric = Number(degrees);
  if (!Number.isFinite(numeric)) return 0;
  return ((numeric % 360) + 360) % 360;
}

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86400000);
}

function formatPartsInTimeZone(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function partsToUtcMs(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0);
}

function timeZoneOffsetMinutes(date, timezone) {
  try {
    const parts = formatPartsInTimeZone(date, timezone);
    return (partsToUtcMs(parts) - date.getTime()) / MS_PER_MINUTE;
  } catch {
    return 0;
  }
}

export function zonedDateTimeToUtcDate(dateTimeLocal, timezone) {
  const normalized = normalizeDateTimeLocal(dateTimeLocal);
  const [datePart, timePart] = normalized.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const localParts = { year, month, day, hour, minute, second: 0 };
  let utcMs = partsToUtcMs(localParts);

  for (let index = 0; index < 4; index += 1) {
    const offset = timeZoneOffsetMinutes(new Date(utcMs), timezone);
    const nextUtcMs = partsToUtcMs(localParts) - offset * MS_PER_MINUTE;
    if (Math.abs(nextUtcMs - utcMs) < 1) break;
    utcMs = nextUtcMs;
  }

  return new Date(utcMs);
}

export function computeSolarPosition({
  latitude,
  longitude,
  timezone,
  dateTimeLocal,
}) {
  const utcDate = zonedDateTimeToUtcDate(dateTimeLocal, timezone);
  const offsetMinutes = timeZoneOffsetMinutes(utcDate, timezone);
  const localParts = formatPartsInTimeZone(utcDate, timezone);
  const minutes = localParts.hour * 60 + localParts.minute + localParts.second / 60;
  const gamma = (2 * Math.PI / 365) * (
    dayOfYear(utcDate) - 1 + (minutes - 720) / 1440
  );
  const equationOfTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );
  const declination = (
    0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma)
  );
  const timeOffset = equationOfTime + 4 * Number(longitude) - offsetMinutes;
  const trueSolarTime = ((minutes + timeOffset) % 1440 + 1440) % 1440;
  const hourAngleDeg = trueSolarTime / 4 < 0
    ? trueSolarTime / 4 + 180
    : trueSolarTime / 4 - 180;
  const latitudeRad = Number(latitude) * DEG_TO_RAD;
  const hourAngleRad = hourAngleDeg * DEG_TO_RAD;
  const cosZenith = Math.sin(latitudeRad) * Math.sin(declination)
    + Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngleRad);
  const zenithRad = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const elevationDeg = 90 - zenithRad * RAD_TO_DEG;
  const azimuthRad = Math.atan2(
    Math.sin(hourAngleRad),
    Math.cos(hourAngleRad) * Math.sin(latitudeRad) - Math.tan(declination) * Math.cos(latitudeRad),
  );
  const azimuthDeg = normalizeDegrees(azimuthRad * RAD_TO_DEG + 180);

  return {
    azimuthDeg,
    elevationDeg,
    utcDate,
    utcIso: utcDate.toISOString(),
    timezoneOffsetMinutes: offsetMinutes,
  };
}

export function resolveSunFromEnvironmentalState(environmentalAnalysis = {}) {
  const state = normalizeBimEnvironmentalAnalysisState(environmentalAnalysis);
  if (state.sunStudy.controlMode === 'geo') {
    const solar = computeSolarPosition({
      latitude: state.site.latitude,
      longitude: state.site.longitude,
      timezone: state.site.timezone,
      dateTimeLocal: state.sunStudy.geo.dateTimeLocal,
    });
    return {
      ...solar,
      trueNorthOffsetDeg: state.site.trueNorthOffsetDeg,
    };
  }
  return {
    azimuthDeg: state.sunStudy.manual.azimuthDeg,
    elevationDeg: state.sunStudy.manual.elevationDeg,
    trueNorthOffsetDeg: state.site.trueNorthOffsetDeg,
    utcIso: null,
    timezoneOffsetMinutes: null,
  };
}

export function resolveSunDirection({
  azimuthDeg,
  elevationDeg,
  trueNorthOffsetDeg = 0,
} = {}) {
  const azimuthRad = normalizeDegrees(Number(azimuthDeg) + Number(trueNorthOffsetDeg)) * DEG_TO_RAD;
  const elevationRad = Number(elevationDeg) * DEG_TO_RAD;
  const horizontal = Math.cos(elevationRad);
  return {
    x: Math.sin(azimuthRad) * horizontal,
    y: Math.sin(elevationRad),
    z: Math.cos(azimuthRad) * horizontal,
  };
}

export function resolveSunIntensity({ elevationDeg, enabled = true } = {}) {
  if (!enabled) return 0;
  const elevation = Number(elevationDeg);
  if (!Number.isFinite(elevation) || elevation <= 0) return 0;
  return Math.min(4.5, Math.max(0.2, 0.8 + Math.sin(elevation * DEG_TO_RAD) * 3.1));
}

export function shadowMapSizeForQuality(quality) {
  if (quality === 'high') return 4096;
  if (quality === 'low') return 1024;
  return 2048;
}

export function buildSunStudyReadout(environmentalAnalysis = {}) {
  const state = normalizeBimEnvironmentalAnalysisState(environmentalAnalysis);
  const sun = resolveSunFromEnvironmentalState(state);
  return {
    azimuthDeg: sun.azimuthDeg,
    elevationDeg: sun.elevationDeg,
    utcIso: sun.utcIso,
    belowHorizon: sun.elevationDeg <= 0,
    intensity: resolveSunIntensity({
      elevationDeg: sun.elevationDeg,
      enabled: state.sunStudy.enabled,
    }),
  };
}

export function configureDirectionalShadowCamera(light, bounds = {}, quality = 'medium') {
  if (!light?.shadow?.camera) return;
  const camera = light.shadow.camera;
  const radius = Math.max(1, Number(bounds.radius) || 10);
  const size = radius * 1.35;
  camera.left = -size;
  camera.right = size;
  camera.top = size;
  camera.bottom = -size;
  camera.near = 0.1;
  camera.far = Math.max(100, radius * 6);
  camera.updateProjectionMatrix();
  const mapSize = shadowMapSizeForQuality(quality);
  if (light.shadow.mapSize.x !== mapSize || light.shadow.mapSize.y !== mapSize) {
    light.shadow.map?.dispose?.();
    light.shadow.map = null;
    light.shadow.mapPass?.dispose?.();
    light.shadow.mapPass = null;
    light.shadow.mapSize.set(mapSize, mapSize);
  }
  light.shadow.bias = -0.00035;
  light.shadow.normalBias = 0.018;
}
