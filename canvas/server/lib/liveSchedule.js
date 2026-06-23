const WEEKDAY = new Map([
  ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 7],
]);

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { weekday: WEEKDAY.get(values.weekday), hour: Number(values.hour), minute: Number(values.minute) };
}

export function nextLiveRunAt({ scheduleMode, preferredTimeLocal, timezone }, after = new Date()) {
  if (scheduleMode === 'manual') return null;
  if (!['daily', 'weekly'].includes(scheduleMode)) throw new Error('Invalid schedule mode');
  const match = String(preferredTimeLocal || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Preferred time must use HH:MM');
  const targetHour = Number(match[1]);
  const targetMinute = Number(match[2]);
  if (targetHour > 23 || targetMinute > 59) throw new Error('Preferred time must use HH:MM');
  const start = new Date(Math.ceil((after.getTime() + 60_000) / 60_000) * 60_000);
  const maxMinutes = 8 * 24 * 60;
  for (let offset = 0; offset <= maxMinutes; offset += 1) {
    const candidate = new Date(start.getTime() + offset * 60_000);
    const local = localParts(candidate, timezone);
    if (local.hour === targetHour && local.minute === targetMinute
      && (scheduleMode === 'daily' || local.weekday === 1)) return candidate;
  }
  throw new Error('Could not calculate next live run');
}
