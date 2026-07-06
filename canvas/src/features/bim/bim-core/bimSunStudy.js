export const BIM_ENVIRONMENTAL_ANALYSIS_SCHEMA_VERSION = 1;

export const BIM_SUN_STUDY_CONTROL_MODES = ['manual', 'geo'];
export const BIM_SUN_STUDY_SHADOW_QUALITIES = ['low', 'medium', 'high'];
export const BIM_CUSTOM_SITE_PRESET_ID = 'custom';

export const BIM_SITE_PRESETS = [
  {
    id: 'melbourne',
    label: 'Melbourne',
    latitude: -37.8136,
    longitude: 144.9631,
    timezone: 'Australia/Melbourne',
    daylightSavingTime: true,
  },
  {
    id: 'sydney',
    label: 'Sydney',
    latitude: -33.8688,
    longitude: 151.2093,
    timezone: 'Australia/Sydney',
    daylightSavingTime: true,
  },
  {
    id: 'brisbane',
    label: 'Brisbane',
    latitude: -27.4698,
    longitude: 153.0251,
    timezone: 'Australia/Brisbane',
    daylightSavingTime: false,
  },
  {
    id: 'hobart',
    label: 'Hobart',
    latitude: -42.8821,
    longitude: 147.3272,
    timezone: 'Australia/Hobart',
    daylightSavingTime: true,
  },
  {
    id: 'adelaide',
    label: 'Adelaide',
    latitude: -34.9285,
    longitude: 138.6007,
    timezone: 'Australia/Adelaide',
    daylightSavingTime: true,
  },
  {
    id: 'perth',
    label: 'Perth',
    latitude: -31.9523,
    longitude: 115.8613,
    timezone: 'Australia/Perth',
    daylightSavingTime: false,
  },
  {
    id: 'canberra',
    label: 'Canberra',
    latitude: -35.2809,
    longitude: 149.13,
    timezone: 'Australia/Sydney',
    daylightSavingTime: true,
  },
  {
    id: 'darwin',
    label: 'Darwin',
    latitude: -12.4634,
    longitude: 130.8456,
    timezone: 'Australia/Darwin',
    daylightSavingTime: false,
  },
  {
    id: 'london',
    label: 'London',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
    daylightSavingTime: true,
  },
  {
    id: 'new-york',
    label: 'New York',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
    daylightSavingTime: true,
  },
  {
    id: 'paris',
    label: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    timezone: 'Europe/Paris',
    daylightSavingTime: true,
  },
  {
    id: 'shanghai',
    label: 'Shanghai',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
    daylightSavingTime: false,
  },
  {
    id: 'mumbai',
    label: 'Mumbai',
    latitude: 19.076,
    longitude: 72.8777,
    timezone: 'Asia/Kolkata',
    daylightSavingTime: false,
  },
  {
    id: 'singapore',
    label: 'Singapore',
    latitude: 1.3521,
    longitude: 103.8198,
    timezone: 'Asia/Singapore',
    daylightSavingTime: false,
  },
];

export const BIM_MELBOURNE_SITE_PRESET = BIM_SITE_PRESETS[0];

function createCustomSitePresetId(label, index = 0) {
  const slug = String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return `custom-${slug || 'site'}${index > 0 ? `-${index}` : ''}`;
}

export function normalizeBimCustomSitePresets(customPresets = []) {
  if (!Array.isArray(customPresets)) return [];
  const usedIds = new Set(BIM_SITE_PRESETS.map((preset) => preset.id));
  return customPresets
    .map((preset, index) => {
      const label = String(preset?.label ?? '').trim();
      if (!label) return null;
      let id = String(preset?.id ?? '').trim() || createCustomSitePresetId(label, index);
      if (usedIds.has(id)) id = createCustomSitePresetId(label, index + 1);
      while (usedIds.has(id)) id = createCustomSitePresetId(label, usedIds.size);
      usedIds.add(id);
      const timezone = String(preset?.timezone ?? DEFAULT_SITE.timezone).trim() || DEFAULT_SITE.timezone;
      return {
        id,
        label,
        latitude: clampNumber(preset?.latitude, -90, 90, DEFAULT_SITE.latitude),
        longitude: clampNumber(preset?.longitude, -180, 180, DEFAULT_SITE.longitude),
        timezone,
        daylightSavingTime: preset?.daylightSavingTime === true,
      };
    })
    .filter(Boolean);
}

export function createBimCustomSitePreset({
  label,
  latitude,
  longitude,
  timezone,
  daylightSavingTime,
} = {}, existingPresets = []) {
  const normalizedExisting = normalizeBimCustomSitePresets(existingPresets);
  const usedIds = new Set([
    ...BIM_SITE_PRESETS.map((preset) => preset.id),
    ...normalizedExisting.map((preset) => preset.id),
  ]);
  let id = createCustomSitePresetId(label);
  let index = 1;
  while (usedIds.has(id)) {
    id = createCustomSitePresetId(label, index);
    index += 1;
  }
  return {
    id,
    label: String(label ?? '').trim() || 'Custom site',
    latitude: clampNumber(latitude, -90, 90, DEFAULT_SITE.latitude),
    longitude: clampNumber(longitude, -180, 180, DEFAULT_SITE.longitude),
    timezone: String(timezone ?? DEFAULT_SITE.timezone).trim() || DEFAULT_SITE.timezone,
    daylightSavingTime: daylightSavingTime === true,
  };
}

export function findBimSitePreset(presetId, customPresets = []) {
  return BIM_SITE_PRESETS.find((preset) => preset.id === presetId)
    ?? normalizeBimCustomSitePresets(customPresets).find((preset) => preset.id === presetId)
    ?? null;
}

const DEFAULT_SITE = {
  ...BIM_MELBOURNE_SITE_PRESET,
  presetId: BIM_MELBOURNE_SITE_PRESET.id,
  trueNorthOffsetDeg: 0,
  daylightSavingTime: BIM_MELBOURNE_SITE_PRESET.daylightSavingTime,
  customPresets: [],
  source: 'manual',
};

const DEFAULT_SUN_STUDY = {
  enabled: false,
  controlMode: 'manual',
  showSkyDome: false,
  showSunTracker: false,
  showSunPath: false,
  showCompass: true,
  sunPathRadius: 1,
  shadowsEnabled: true,
  shadowQuality: 'medium',
  shadowOpacity: 0.22,
  shadowColor: '#000000',
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

function normalizeHexColor(value, fallback) {
  const text = String(value ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text.toLowerCase()}`;
  return fallback;
}

export function normalizeBimSiteState(site = {}) {
  const customPresets = normalizeBimCustomSitePresets(site?.customPresets);
  const timezone = String(site?.timezone ?? DEFAULT_SITE.timezone).trim();
  const hasExplicitPresetId = site?.presetId != null;
  const preset = findBimSitePreset(site?.presetId, customPresets)
    ?? (!hasExplicitPresetId && timezone === BIM_MELBOURNE_SITE_PRESET.timezone
      ? BIM_MELBOURNE_SITE_PRESET
      : null);
  const resolvedTimezone = preset?.timezone ?? (timezone || DEFAULT_SITE.timezone);
  const lockedPreset = preset != null;
  return {
    presetId: preset?.id ?? BIM_CUSTOM_SITE_PRESET_ID,
    customPresets,
    latitude: lockedPreset
      ? preset.latitude
      : clampNumber(site?.latitude, -90, 90, DEFAULT_SITE.latitude),
    longitude: lockedPreset
      ? preset.longitude
      : clampNumber(site?.longitude, -180, 180, DEFAULT_SITE.longitude),
    timezone: resolvedTimezone,
    trueNorthOffsetDeg: clampNumber(
      site?.trueNorthOffsetDeg,
      -180,
      180,
      DEFAULT_SITE.trueNorthOffsetDeg,
    ),
    daylightSavingTime: lockedPreset
      ? preset.daylightSavingTime === true
      : site?.daylightSavingTime !== false,
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
    showSunPath: sunStudy?.showSunPath === true,
    showCompass: sunStudy?.showCompass !== false,
    sunPathRadius: clampNumber(sunStudy?.sunPathRadius, 0.25, 5, DEFAULT_SUN_STUDY.sunPathRadius),
    shadowsEnabled: sunStudy?.shadowsEnabled !== false,
    shadowQuality: BIM_SUN_STUDY_SHADOW_QUALITIES.includes(sunStudy?.shadowQuality)
      ? sunStudy.shadowQuality
      : DEFAULT_SUN_STUDY.shadowQuality,
    shadowOpacity: clampNumber(sunStudy?.shadowOpacity, 0, 1, DEFAULT_SUN_STUDY.shadowOpacity),
    shadowColor: normalizeHexColor(sunStudy?.shadowColor, DEFAULT_SUN_STUDY.shadowColor),
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

function dateTimeLocalDatePart(dateTimeLocal) {
  return normalizeDateTimeLocal(dateTimeLocal).split('T')[0];
}

function selectedYear(dateTimeLocal) {
  return Number(dateTimeLocalDatePart(dateTimeLocal).slice(0, 4)) || 2026;
}

function dateTimeLocalForDateMinute(year, month, day, minuteOfDay) {
  const clamped = Math.min(1439, Math.max(0, Math.round(Number(minuteOfDay) || 0)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dateTimeLocalForMinute(dateTimeLocal, minuteOfDay) {
  const [year, month, day] = dateTimeLocalDatePart(dateTimeLocal).split('-').map(Number);
  return dateTimeLocalForDateMinute(year, month, day, minuteOfDay);
}

function dateTimeLocalForYearDayMinute(year, dayIndex, minuteOfDay) {
  const date = new Date(Date.UTC(year, 0, 1 + dayIndex, 12, 0, 0));
  return dateTimeLocalForDateMinute(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    minuteOfDay,
  );
}

function daysInYear(year) {
  return Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000);
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

function parseDateTimeLocalParts(dateTimeLocal) {
  const normalized = normalizeDateTimeLocal(dateTimeLocal);
  const [datePart, timePart] = normalized.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return { year, month, day, hour, minute, second: 0 };
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

function standardTimeZoneOffsetMinutes(year, timezone) {
  const janOffset = timeZoneOffsetMinutes(new Date(Date.UTC(year, 0, 1, 12, 0, 0)), timezone);
  const julOffset = timeZoneOffsetMinutes(new Date(Date.UTC(year, 6, 1, 12, 0, 0)), timezone);
  return Math.min(janOffset, julOffset);
}

function effectiveTimeZoneOffsetMinutes(date, timezone, { daylightSavingTime = true } = {}) {
  if (daylightSavingTime) return timeZoneOffsetMinutes(date, timezone);
  return standardTimeZoneOffsetMinutes(date.getUTCFullYear(), timezone);
}

export function zonedDateTimeToUtcDate(dateTimeLocal, timezone, { daylightSavingTime = true } = {}) {
  const localParts = parseDateTimeLocalParts(dateTimeLocal);
  let utcMs = partsToUtcMs(localParts);

  for (let index = 0; index < 4; index += 1) {
    const offset = effectiveTimeZoneOffsetMinutes(new Date(utcMs), timezone, { daylightSavingTime });
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
  daylightSavingTime = true,
}) {
  const utcDate = zonedDateTimeToUtcDate(dateTimeLocal, timezone, { daylightSavingTime });
  const offsetMinutes = effectiveTimeZoneOffsetMinutes(utcDate, timezone, { daylightSavingTime });
  const localParts = parseDateTimeLocalParts(dateTimeLocal);
  const minutes = localParts.hour * 60 + localParts.minute + localParts.second / 60;
  const julianDay = utcDate.getTime() / 86400000 + 2440587.5;
  const julianCentury = (julianDay - 2451545) / 36525;
  const geomMeanLongSun = normalizeDegrees(
    280.46646 + julianCentury * (36000.76983 + julianCentury * 0.0003032),
  );
  const geomMeanAnomalySun = 357.52911 + julianCentury * (35999.05029 - 0.0001537 * julianCentury);
  const eccentricityEarthOrbit = 0.016708634
    - julianCentury * (0.000042037 + 0.0000001267 * julianCentury);
  const sunEquationOfCenter = Math.sin(geomMeanAnomalySun * DEG_TO_RAD)
      * (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury))
    + Math.sin(2 * geomMeanAnomalySun * DEG_TO_RAD) * (0.019993 - 0.000101 * julianCentury)
    + Math.sin(3 * geomMeanAnomalySun * DEG_TO_RAD) * 0.000289;
  const sunTrueLong = geomMeanLongSun + sunEquationOfCenter;
  const omega = 125.04 - 1934.136 * julianCentury;
  const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);
  const meanObliqEcliptic = 23 + (
    26 + (
      21.448 - julianCentury * (46.815 + julianCentury * (0.00059 - julianCentury * 0.001813))
    ) / 60
  ) / 60;
  const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos(omega * DEG_TO_RAD);
  const declination = Math.asin(
    Math.sin(obliqCorr * DEG_TO_RAD) * Math.sin(sunAppLong * DEG_TO_RAD),
  );
  const y = Math.tan((obliqCorr / 2) * DEG_TO_RAD) ** 2;
  const equationOfTime = 4 * RAD_TO_DEG * (
    y * Math.sin(2 * geomMeanLongSun * DEG_TO_RAD)
    - 2 * eccentricityEarthOrbit * Math.sin(geomMeanAnomalySun * DEG_TO_RAD)
    + 4 * eccentricityEarthOrbit * y
      * Math.sin(geomMeanAnomalySun * DEG_TO_RAD)
      * Math.cos(2 * geomMeanLongSun * DEG_TO_RAD)
    - 0.5 * y * y * Math.sin(4 * geomMeanLongSun * DEG_TO_RAD)
    - 1.25 * eccentricityEarthOrbit * eccentricityEarthOrbit
      * Math.sin(2 * geomMeanAnomalySun * DEG_TO_RAD)
  );
  const trueSolarTime = ((minutes + equationOfTime + 4 * Number(longitude) - offsetMinutes) % 1440 + 1440) % 1440;
  const hourAngleDeg = trueSolarTime / 4 < 0
    ? trueSolarTime / 4 + 180
    : trueSolarTime / 4 - 180;
  const latitudeRad = Number(latitude) * DEG_TO_RAD;
  const hourAngleRad = hourAngleDeg * DEG_TO_RAD;
  const cosZenith = Math.sin(latitudeRad) * Math.sin(declination)
    + Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngleRad);
  const zenithDeg = Math.acos(Math.min(1, Math.max(-1, cosZenith))) * RAD_TO_DEG;
  const solarElevation = 90 - zenithDeg;
  const refractionCorrection = solarElevation > 85
    ? 0
    : solarElevation > 5
      ? (
        58.1 / Math.tan(solarElevation * DEG_TO_RAD)
        - 0.07 / Math.tan(solarElevation * DEG_TO_RAD) ** 3
        + 0.000086 / Math.tan(solarElevation * DEG_TO_RAD) ** 5
      ) / 3600
      : solarElevation > -0.575
        ? (
          1735 + solarElevation * (
            -518.2 + solarElevation * (
              103.4 + solarElevation * (-12.79 + solarElevation * 0.711)
            )
          )
        ) / 3600
        : (-20.772 / Math.tan(solarElevation * DEG_TO_RAD)) / 3600;
  const elevationDeg = solarElevation + refractionCorrection;
  const azimuthDenominator = Math.cos(latitudeRad) * Math.sin((90 - solarElevation) * DEG_TO_RAD);
  const azimuthAngleDeg = Math.abs(azimuthDenominator) > 0.001
    ? Math.acos(Math.min(1, Math.max(-1, (
      (Math.sin(latitudeRad) * Math.cos((90 - solarElevation) * DEG_TO_RAD) - Math.sin(declination))
      / azimuthDenominator
    )))) * RAD_TO_DEG
    : null;
  const azimuthDeg = azimuthAngleDeg == null
    ? latitude > 0 ? 180 : 0
    : hourAngleDeg > 0
      ? normalizeDegrees(azimuthAngleDeg + 180)
      : normalizeDegrees(540 - azimuthAngleDeg);

  return {
    azimuthDeg,
    elevationDeg,
    utcDate,
    utcIso: utcDate.toISOString(),
    timezoneOffsetMinutes: offsetMinutes,
    daylightSavingTime,
    algorithm: 'meeus-noaa-apparent-v1',
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
      daylightSavingTime: state.site.daylightSavingTime,
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
    daylightSavingTime: null,
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
    algorithm: sun.algorithm ?? (state.sunStudy.controlMode === 'geo' ? 'meeus-noaa-apparent-v1' : 'manual'),
    daylightSavingTime: sun.daylightSavingTime,
  };
}

export function buildSunPathSamples(environmentalAnalysis = {}, { intervalMinutes = 30 } = {}) {
  const state = normalizeBimEnvironmentalAnalysisState(environmentalAnalysis);
  const step = Math.min(120, Math.max(5, Math.round(Number(intervalMinutes) || 30)));
  const samples = [];
  for (let minute = 0; minute <= 1440; minute += step) {
    const dateTimeLocal = dateTimeLocalForMinute(state.sunStudy.geo.dateTimeLocal, Math.min(minute, 1439));
    const solar = computeSolarPosition({
      latitude: state.site.latitude,
      longitude: state.site.longitude,
      timezone: state.site.timezone,
      dateTimeLocal,
      daylightSavingTime: state.site.daylightSavingTime,
    });
    samples.push({
      minuteOfDay: Math.min(minute, 1439),
      dateTimeLocal,
      azimuthDeg: solar.azimuthDeg,
      elevationDeg: solar.elevationDeg,
      belowHorizon: solar.elevationDeg <= 0,
      daylightSavingTime: solar.daylightSavingTime,
    });
  }
  return samples;
}

function isSampleBelowHorizon(sample, horizonElevationDeg) {
  const elevation = Number(sample?.elevationDeg);
  if (Number.isFinite(elevation)) return elevation <= horizonElevationDeg;
  return sample?.belowHorizon === true;
}

function interpolateAzimuthDeg(fromAzimuthDeg, toAzimuthDeg, t) {
  const from = normalizeDegrees(fromAzimuthDeg);
  const delta = ((normalizeDegrees(toAzimuthDeg) - from + 540) % 360) - 180;
  return normalizeDegrees(from + delta * t);
}

function interpolateHorizonSample(fromSample, toSample, horizonElevationDeg, belowHorizon) {
  const fromElevation = Number(fromSample?.elevationDeg);
  const toElevation = Number(toSample?.elevationDeg);
  const denominator = toElevation - fromElevation;
  const rawT = Math.abs(denominator) > 0.000001
    ? (horizonElevationDeg - fromElevation) / denominator
    : 0.5;
  const t = Math.min(1, Math.max(0, rawT));
  return {
    ...(t < 0.5 ? fromSample : toSample),
    azimuthDeg: interpolateAzimuthDeg(fromSample?.azimuthDeg, toSample?.azimuthDeg, t),
    elevationDeg: horizonElevationDeg,
    belowHorizon,
    horizonCrossing: true,
  };
}

export function splitSunPathSamplesByHorizon(
  samples = [],
  { belowHorizon = false, horizonElevationDeg = 0 } = {},
) {
  const segments = [];
  let segment = [];
  samples.forEach((sample, index) => {
    const previous = index > 0 ? samples[index - 1] : null;
    const sampleMatches = isSampleBelowHorizon(sample, horizonElevationDeg) === belowHorizon;
    const previousMatches = previous
      ? isSampleBelowHorizon(previous, horizonElevationDeg) === belowHorizon
      : false;

    if (previous && sampleMatches !== previousMatches) {
      const crossing = interpolateHorizonSample(previous, sample, horizonElevationDeg, belowHorizon);
      if (sampleMatches) {
        segment = [crossing];
      } else if (segment.length > 0) {
        segment.push(crossing);
        if (segment.length > 1) segments.push(segment);
        segment = [];
      }
    }

    if (sampleMatches) segment.push(sample);
  });
  if (segment.length > 1) segments.push(segment);
  return segments;
}

export function buildSunPathGridSamples(environmentalAnalysis = {}) {
  const state = normalizeBimEnvironmentalAnalysisState(environmentalAnalysis);
  const year = selectedYear(state.sunStudy.geo.dateTimeLocal);
  const totalDays = daysInYear(year);
  const monthArcs = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return {
      id: `month-${month}`,
      month,
      samples: buildSunPathSamples({
        ...state,
        sunStudy: {
          ...state.sunStudy,
          geo: {
            dateTimeLocal: dateTimeLocalForDateMinute(year, month, 21, 12 * 60),
          },
        },
      }, { intervalMinutes: 30 }),
    };
  });

  const hourCurves = [];
  for (let hour = 6; hour <= 18; hour += 1) {
    const samples = [];
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 5) {
      const dateTimeLocal = dateTimeLocalForYearDayMinute(year, dayIndex, hour * 60);
      const solar = computeSolarPosition({
        latitude: state.site.latitude,
        longitude: state.site.longitude,
        timezone: state.site.timezone,
        dateTimeLocal,
        daylightSavingTime: false,
      });
      samples.push({
        dayIndex,
        hour,
        dateTimeLocal,
        azimuthDeg: solar.azimuthDeg,
        elevationDeg: solar.elevationDeg,
        belowHorizon: solar.elevationDeg <= 0,
        daylightSavingTime: solar.daylightSavingTime,
        timeBasis: 'standard',
      });
    }
    if ((totalDays - 1) % 5 !== 0) {
      const dateTimeLocal = dateTimeLocalForYearDayMinute(year, totalDays - 1, hour * 60);
      const solar = computeSolarPosition({
        latitude: state.site.latitude,
        longitude: state.site.longitude,
        timezone: state.site.timezone,
        dateTimeLocal,
        daylightSavingTime: false,
      });
      samples.push({
        dayIndex: totalDays - 1,
        hour,
        dateTimeLocal,
        azimuthDeg: solar.azimuthDeg,
        elevationDeg: solar.elevationDeg,
        belowHorizon: solar.elevationDeg <= 0,
        daylightSavingTime: solar.daylightSavingTime,
        timeBasis: 'standard',
      });
    }
    hourCurves.push({ id: `hour-${hour}`, hour, samples });
  }

  return { monthArcs, hourCurves };
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
