import ICAL from 'ical.js';

// Web-platform APIs only: this module also runs in a Cloudflare Worker.
export const CALENDAR_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, events: 1500, steps: 10000, timeoutMs: 10000, days: 180 });
const SOURCES = new Set(['tumonline', 'moodle']);
const TUM_PATHS = new Set(['/tumonlinej/ws/termin/ical', '/tumonline/ws/termin/ical', '/tumonline/ical.cal.ical']);
const MOODLE_HOSTS = new Set(['moodle.tum.de', 'www.moodle.tum.de']);
const SECRET_KEY = /token|secret|password|signature|(?:^|_)auth|(?:^|_)key|^sig$/i;
const DAY = 86400000;
const encoder = new TextEncoder();
const BERLIN = `BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin\r\nBEGIN:DAYLIGHT\r\nDTSTART:19810329T020000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nDTSTART:19961027T030000\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE`;

export class CalendarError extends Error {
  constructor(code, message) { super(message); this.name = 'CalendarError'; this.code = code; }
}
function fail(code, message) { throw new CalendarError(code, message); }
function checkSource(source) { if (!SOURCES.has(source)) fail('invalid-source', 'Choose TUMonline or Moodle.'); }

function subscriptionUrl(source, value) {
  checkSource(source);
  if (typeof value !== 'string' || value.length > 4096 || !value || /[\s\\#\u0000-\u001f\u007f]/u.test(value)) fail('invalid-url', 'Use the original HTTPS calendar subscription URL.');
  let url;
  try { url = new URL(value); } catch { fail('invalid-url', 'Use a valid calendar subscription URL.'); }
  const authority = value.match(/^https:\/\/([^/?#]+)/iu)?.[1] ?? '';
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || authority.includes('@') || /:\d+$/u.test(authority) || /%/u.test(url.pathname)) fail('invalid-url', 'Use an HTTPS calendar URL without credentials, a port or a fragment.');
  const allowed = source === 'tumonline'
    ? url.hostname === 'campus.tum.de' && TUM_PATHS.has(url.pathname)
    : MOODLE_HOSTS.has(url.hostname) && url.pathname === '/calendar/export_execute.php';
  if (!allowed || !url.search || url.search.length > 3072) fail('unsupported-url', 'This calendar host or path is not supported. Copy the official personal calendar export link.');
  return url;
}

/** Validate without returning any bearer secret. Never send the submitted URL to a client or a log. */
export function validateCalendarUrl(source, value) {
  const url = subscriptionUrl(source, value);
  return { source, host: url.hostname };
}

function secretScrubber(feedUrl) {
  let secrets = [];
  if (feedUrl) {
    const parsed = new URL(feedUrl);
    secrets = [feedUrl, ...[...parsed.searchParams].filter(([key, value]) => SECRET_KEY.test(key) && value.length >= 3).flatMap(([, value]) => [value, encodeURIComponent(value)])];
  }
  return value => {
    let text = String(value ?? '');
    for (const secret of secrets) text = text.split(secret).join('[private calendar link removed]');
    return text.replace(/https?:\/\/[^\s<>"']+/giu, candidate => {
      try {
        const url = new URL(candidate);
        if (/export_execute\.php|\/ws\/termin\/ical|ical\.cal\.ical/iu.test(url.pathname) || [...url.searchParams.keys()].some(key => SECRET_KEY.test(key))) return '[private calendar link removed]';
      } catch { /* A malformed link is plain text, never a clickable URL. */ }
      return candidate;
    });
  };
}
function plain(value, limit, scrub = String) {
  const text = scrub(value ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '').replace(/<\s*(?:br|\/p|\/div)\s*\/?\s*>/giu, '\n').replace(/<[^>]*>/gu, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').replace(/\r\n?/gu, '\n');
  return Array.from(text).slice(0, limit).join('').trim();
}
function officialEventUrl(value, scrub = String) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/u.test(value) || scrub(value) !== value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !(url.hostname === 'tum.de' || url.hostname.endsWith('.tum.de'))) return null;
    if (/export_execute\.php|\/ws\/termin\/ical|ical\.cal\.ical/iu.test(url.pathname) || [...url.searchParams.keys()].some(key => SECRET_KEY.test(key)) || SECRET_KEY.test(url.hash)) return null;
    return url.href;
  } catch { return null; }
}

// Stable opaque identifiers for event identity, not an authentication/security primitive.
function stableId(value) {
  let a = 0x811c9dc5, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  for (const byte of encoder.encode(value)) {
    a = Math.imul(a ^ byte, 16777619); b = Math.imul(b ^ byte, 2246822519);
    c = Math.imul(c ^ byte, 3266489917); d = Math.imul(d ^ byte, 668265263);
  }
  return [a, b, c, d].map(word => (word >>> 0).toString(16).padStart(8, '0')).join('');
}

function validateRule(value, timezone = false) {
  if (value.length > 512) fail('unsupported-recurrence', 'This calendar has a recurrence rule that exceeds the supported limits.');
  const parts = Object.create(null);
  for (const item of value.toUpperCase().split(';')) {
    const pair = item.split('=');
    if (pair.length !== 2 || parts[pair[0]] !== undefined) fail('unsupported-recurrence', 'This calendar contains an unsupported recurrence rule.');
    parts[pair[0]] = pair[1];
  }
  const allowed = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST']);
  if (Object.keys(parts).some(key => !allowed.has(key)) || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(parts.FREQ)) fail('unsupported-recurrence', 'Only bounded daily, weekly, monthly and yearly calendar rules are supported.');
  if (timezone && parts.FREQ !== 'YEARLY') fail('unsupported-timezone', 'This calendar contains an unsupported timezone rule.');
  const interval = parts.INTERVAL === undefined ? 1 : Number(parts.INTERVAL);
  if (!/^\d+$/u.test(String(interval)) || interval < 1 || interval > 366) fail('unsupported-recurrence', 'This calendar contains an unsupported recurrence interval.');
  if (parts.COUNT && (!/^\d+$/u.test(parts.COUNT) || Number(parts.COUNT) < 1 || Number(parts.COUNT) > CALENDAR_LIMITS.steps)) fail('recurrence-limit', 'This calendar recurrence exceeds the supported limit.');
  if (parts.UNTIL && !/^\d{8}(?:T\d{6}Z?)?$/u.test(parts.UNTIL)) fail('invalid-calendar', 'This calendar contains an invalid recurrence end.');
  if (parts.WKST && !/^(MO|TU|WE|TH|FR|SA|SU)$/u.test(parts.WKST)) fail('invalid-calendar', 'This calendar contains an invalid week start.');
  for (const key of ['BYDAY', 'BYMONTHDAY', 'BYMONTH']) if (parts[key] && parts[key].split(',').length > 12) fail('recurrence-limit', 'This calendar recurrence has too many alternatives.');
  const days = parts.BYDAY?.split(',') ?? [];
  if (days.some(day => !/^(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)$/u.test(day))) fail('invalid-calendar', 'This calendar contains an invalid weekday rule.');
  if ((parts.FREQ === 'DAILY' || parts.FREQ === 'WEEKLY') && days.some(day => /\d/u.test(day))) fail('unsupported-recurrence', 'This calendar contains an unsupported weekday rule.');
  if (parts.FREQ === 'DAILY' && days.length && interval !== 1) fail('unsupported-recurrence', 'Daily weekday filters require an interval of one.');
  const monthDays = parts.BYMONTHDAY?.split(',').map(Number) ?? [];
  const months = parts.BYMONTH?.split(',').map(Number) ?? [];
  if (monthDays.some(day => !Number.isInteger(day) || day === 0 || Math.abs(day) > 31) || months.some(month => !Number.isInteger(month) || month < 1 || month > 12)) fail('invalid-calendar', 'This calendar contains an invalid month rule.');
  // Reject combinations that can make one library iterator.next() scan without a useful bound.
  if ((parts.FREQ === 'DAILY' || parts.FREQ === 'WEEKLY') && (monthDays.length || months.length)
    || parts.FREQ === 'MONTHLY' && (months.length || (monthDays.length && days.length))
    || parts.FREQ === 'YEARLY' && (days.length && monthDays.length || days.length && (months.length !== 1 || days.length !== 1 || !/^[+-]?[1-4](MO|TU|WE|TH|FR|SA|SU)$/u.test(days[0])))) {
    if (!(timezone && parts.FREQ === 'YEARLY' && months.length === 1 && days.length === 1 && /^[+-]?[1-5](MO|TU|WE|TH|FR|SA|SU)$/u.test(days[0]) && !monthDays.length)) fail('unsupported-recurrence', 'This calendar contains a complex recurrence rule that is not supported safely.');
  }
  if (parts.FREQ === 'YEARLY' && monthDays.length && months.length && !months.some(month => monthDays.some(day => Math.abs(day) <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]))) fail('invalid-calendar', 'This calendar recurrence cannot occur.');
  if (timezone && (interval !== 1 || months.length !== 1 || days.length > 1 || monthDays.length > 1)) fail('unsupported-timezone', 'This calendar contains an unsupported timezone rule.');
}

function preflight(text) {
  if (typeof text !== 'string' || encoder.encode(text).byteLength > CALENDAR_LIMITS.bytes) fail('calendar-too-large', 'The calendar exceeds the 2 MiB limit.');
  const clean = text.replace(/^\uFEFF/u, '').trim();
  if (!/^BEGIN:VCALENDAR\r?\n/iu.test(clean) || !/\r?\nEND:VCALENDAR$/iu.test(clean) || /<!DOCTYPE|<html\b/iu.test(clean)) fail('not-calendar', 'The source returned a login page or a non-calendar response.');
  const lines = clean.replace(/\r\n[ \t]|\n[ \t]/gu, '').split(/\r?\n/u);
  if (lines.length > 30000 || lines.some(line => line.length > 16384)) fail('calendar-too-large', 'This calendar exceeds the supported structure limits.');
  const stack = []; let events = 0, components = 0, recurrenceDates = 0;
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (/^(DTSTART|DTEND|RECURRENCE-ID|RDATE|EXDATE)[;:]/u.test(upper)) {
      const values = upper.slice(upper.indexOf(':') + 1).split(',');
      for (const value of values) {
        if (!/^\d{8}(?:T\d{6}Z?)?$/u.test(value)) fail('invalid-calendar', 'A calendar entry contains an unsupported date value.');
        const year = Number(value.slice(0, 4)), month = Number(value.slice(4, 6)), day = Number(value.slice(6, 8));
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day || value.length > 8 && (Number(value.slice(9, 11)) > 23 || Number(value.slice(11, 13)) > 59 || Number(value.slice(13, 15)) > 59)) fail('invalid-calendar', 'A calendar entry contains an invalid date value.');
      }
    }
    if (/^TZOFFSET(?:FROM|TO):/u.test(upper)) {
      const value = upper.slice(upper.indexOf(':') + 1);
      if (!/^[+-]\d{4}(?:\d{2})?$/u.test(value) || Number(value.slice(1, 3)) > 23 || Number(value.slice(3, 5)) > 59 || Number(value.slice(5, 7)) > 59) fail('unsupported-timezone', 'This calendar contains an invalid timezone offset.');
    }
    if (upper.startsWith('BEGIN:')) {
      const name = upper.slice(6); stack.push(name); components++;
      if (stack.length > 6 || components > 5000) fail('calendar-too-large', 'This calendar exceeds the supported structure limits.');
      if (name === 'VEVENT' && ++events > CALENDAR_LIMITS.events) fail('event-limit', 'This source contains more than 1500 calendar entries.');
    } else if (upper.startsWith('END:')) {
      if (stack.pop() !== upper.slice(4)) fail('invalid-calendar', 'This calendar has invalid component boundaries.');
    } else if (/^RRULE[;:]/u.test(upper)) {
      validateRule(upper.slice(upper.indexOf(':') + 1), stack.includes('VTIMEZONE'));
    } else if (/^EXRULE[;:]/u.test(upper) || /^RECURRENCE-ID[^:]*;RANGE=/u.test(upper) && !/;RANGE=THISANDFUTURE(?:;|:)/u.test(upper)) {
      fail('unsupported-recurrence', 'This calendar contains an unsupported recurrence exception.');
    } else if (/^(RDATE|EXDATE)[;:]/u.test(upper)) {
      recurrenceDates += upper.split(',').length;
      if (recurrenceDates > 3000 || /;VALUE=PERIOD[;:]/u.test(upper)) fail('recurrence-limit', 'This calendar contains too many or unsupported recurrence dates.');
    } else if (/^DTSTART[;:]/u.test(upper) && stack.includes('VTIMEZONE')) {
      const year = Number(upper.slice(upper.indexOf(':') + 1, upper.indexOf(':') + 5));
      if (!Number.isInteger(year) || year < 1600 || year > 2100) fail('unsupported-timezone', 'This calendar contains an unsupported timezone date.');
    }
  }
  if (stack.length) fail('invalid-calendar', 'This calendar has incomplete component boundaries.');
  return clean;
}

function dateString(time) { return `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`; }
function isoTime(time) { return time.isDate ? dateString(time) : new Date(time.toUnixTime() * 1000).toISOString(); }
function windowFor(now) {
  const date = new Date(now ?? Date.now());
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2090) fail('invalid-date', 'Use a valid current date.');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = key => Number(parts.find(item => item.type === key).value);
  const local = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  const startDate = local.toISOString().slice(0, 10);
  const zone = new ICAL.Timezone(new ICAL.Component(ICAL.parse(BERLIN)));
  const startTime = ICAL.Time.fromDateTimeString(`${startDate}T00:00:00`); startTime.zone = zone;
  return { start: new Date(startTime.toUnixTime() * 1000).toISOString(), end: new Date(date.getTime() + CALENDAR_LIMITS.days * DAY).toISOString(), startDate, now: date.toISOString() };
}
function rank(component) {
  return [Number(component.getFirstPropertyValue('sequence') ?? 0), String(component.getFirstPropertyValue('last-modified') ?? component.getFirstPropertyValue('dtstamp') ?? '')];
}
function newer(a, b) { const ar = rank(a), br = rank(b); return ar[0] > br[0] || ar[0] === br[0] && ar[1] >= br[1]; }
function cancelled(event) { return String(event.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'; }

/** Parse an uploaded snapshot or a fetched calendar. It never performs network or storage operations. */
export function parseCalendar(source, text, opts = {}) {
  checkSource(source);
  const cleaned = preflight(text);
  const coverage = windowFor(opts.now);
  const scrub = secretScrubber(opts.feedUrl);
  try {
    const calendar = new ICAL.Component(ICAL.parse(cleaned));
    if (calendar.name !== 'vcalendar') fail('not-calendar', 'The response is not an iCalendar file.');
    const warnings = [];
    const zones = calendar.getAllSubcomponents('vtimezone');
    if (zones.length > 16 || zones.reduce((sum, zone) => sum + zone.getAllSubcomponents().length, 0) > 64 || zones.some(zone => zone.getAllSubcomponents().length > 32 || zone.getAllSubcomponents().some(part => !['standard', 'daylight'].includes(part.name) || part.getAllProperties('rrule').length > 1))) fail('unsupported-timezone', 'This calendar has too many or unsupported timezone definitions.');
    if (!zones.some(zone => zone.getFirstPropertyValue('tzid') === 'Europe/Berlin')) calendar.addSubcomponent(new ICAL.Component(ICAL.parse(BERLIN)));
    const berlin = calendar.getTimeZoneByID('Europe/Berlin');
    const millis = time => {
      if (!time.isDate) return time.toUnixTime() * 1000;
      const midnight = time.clone(); midnight.isDate = false; midnight.zone = berlin;
      return midnight.toUnixTime() * 1000;
    };
    const groups = new Map();
    for (const component of calendar.getAllSubcomponents('vevent')) {
      const uid = component.getFirstPropertyValue('uid');
      if (typeof uid !== 'string' || !uid || uid.length > 1024) fail('invalid-calendar', 'Every calendar entry must have a bounded stable UID.');
      if (component.getAllProperties('rrule').length > 1) fail('unsupported-recurrence', 'Multiple recurrence rules on one event are not supported.');
      for (const name of ['dtstart', 'dtend', 'recurrence-id', 'rdate', 'exdate']) {
        for (const property of component.getAllProperties(name)) {
          if (property.type === 'period') fail('unsupported-recurrence', 'Period-valued recurrence dates are not supported.');
          const tzid = property.getParameter('tzid');
          if (tzid && !calendar.getTimeZoneByID(tzid) && !['UTC', 'Etc/UTC', 'GMT'].includes(tzid)) fail('unsupported-timezone', 'A calendar timezone definition is missing.');
          for (const time of property.getValues()) {
            if (!(time instanceof ICAL.Time) || time.year < 1970 || time.year > 2100) fail('invalid-calendar', 'A calendar entry has an unsupported date.');
            if (time.month < 1 || time.month > 12 || time.day < 1 || time.day > ICAL.Time.daysInMonth(time.month, time.year) || time.hour < 0 || time.hour > 23 || time.minute < 0 || time.minute > 59 || time.second < 0 || time.second > 60) fail('invalid-calendar', 'A calendar entry has an invalid date or time.');
            if (!time.isDate && ['UTC', 'Etc/UTC', 'GMT'].includes(tzid)) time.zone = ICAL.Timezone.utcTimezone;
            else if (!time.isDate && time.zone === ICAL.Timezone.localTimezone) {
              time.zone = berlin;
              if (!warnings.includes('floating-times-use-Europe/Berlin')) warnings.push('floating-times-use-Europe/Berlin');
            }
          }
        }
      }
      // An explicit bound also caps the library's search for an impossible yearly date.
      for (const property of component.getAllProperties('rrule')) {
        const rule = property.getFirstValue();
        const until = ICAL.Time.fromDateTimeString(coverage.end.slice(0, 19) + 'Z');
        if (!rule.until || rule.until.compare(until) > 0) rule.until = until;
      }
      const recurrence = component.getFirstPropertyValue('recurrence-id');
      const key = recurrence ? isoTime(recurrence) : 'master';
      if (!groups.has(uid)) groups.set(uid, new Map());
      const group = groups.get(uid), previous = group.get(key);
      if (!previous || newer(component, previous)) group.set(key, component);
    }
    const events = new Map(); let steps = 0;
    const emit = (uid, event, detail, occurrence, master = event, single = false) => {
      if (cancelled(event)) return;
      const start = detail.startDate, end = detail.endDate;
      if (!start || !end || start.isDate !== end.isDate) fail('invalid-calendar', 'A calendar entry has an invalid start or end.');
      const startValue = isoTime(start), endValue = isoTime(end);
      if (endValue < startValue || !start.isDate && Date.parse(endValue) - Date.parse(startValue) > 366 * DAY) fail('invalid-calendar', 'A calendar entry has an invalid duration.');
      const startMillis = millis(start), endMillis = millis(end);
      const rangeStart = Date.parse(coverage.start), rangeEnd = Date.parse(coverage.end);
      if (startMillis >= rangeEnd || (endMillis > startMillis ? endMillis <= rangeStart : startMillis < rangeStart)) return;
      const value = name => event.component.getFirstPropertyValue(name) ?? master.component.getFirstPropertyValue(name);
      const occurrenceValue = isoTime(occurrence);
      const id = stableId(`${source}\u0000${uid}\u0000${single ? 'single' : occurrenceValue}`);
      events.set(id, {
        id, source, title: plain(value('summary') || 'Untitled calendar event', 300, scrub),
        location: plain(value('location'), 500, scrub), description: plain(value('description'), 2000, scrub),
        url: officialEventUrl(value('url'), scrub), kind: source === 'moodle' ? 'deadline' : 'class',
        allDay: start.isDate, start: startValue, end: endValue, occurrence: occurrenceValue,
      });
      if (events.size > CALENDAR_LIMITS.events) fail('event-limit', 'This source expands to more than 1500 events in the supported period.');
    };
    if (String(calendar.getFirstPropertyValue('method') ?? '').toUpperCase() !== 'CANCEL') {
      for (const [uid, group] of groups) {
        const masterComponent = group.get('master');
        const overrides = [...group].filter(([key]) => key !== 'master').map(([, component]) => component);
        if (!masterComponent) {
          for (const component of overrides) {
            const event = new ICAL.Event(component, { exceptions: [] });
            if (!cancelled(event)) emit(uid, event, { startDate: event.startDate, endDate: event.endDate }, event.recurrenceId);
          }
          continue;
        }
        const master = new ICAL.Event(masterComponent, { strictExceptions: true, exceptions: overrides });
        if (cancelled(master)) continue;
        if (!master.startDate) fail('invalid-calendar', 'A calendar entry is missing its start date.');
        const emitMasterOccurrence = occurrence => {
          // A cancellation may legally omit DTSTART/DTEND. Do not ask the library to
          // calculate its endDate before checking its status.
          const direct = group.get(isoTime(occurrence));
          if (direct && String(direct.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') return;
          const rangeKey = master.findRangeException(occurrence);
          if (!direct && rangeKey && cancelled(master.exceptions[rangeKey])) return;
          const detail = master.getOccurrenceDetails(occurrence);
          emit(uid, detail.item, detail, occurrence, master);
        };
        if (master.isRecurring()) {
          // Fail quickly for extremely old dense series, before spending the entire
          // step budget merely skipping history outside the requested window.
          for (const property of masterComponent.getAllProperties('rrule')) {
            const rule = property.getFirstValue();
            const cutoff = Math.min(Date.parse(coverage.start), rule.until ? rule.until.toUnixTime() * 1000 : Infinity);
            const elapsedDays = Math.max(0, (cutoff - master.startDate.toUnixTime() * 1000) / DAY);
            const days = rule.parts.BYDAY?.length ?? 0;
            const estimate = rule.freq === 'DAILY'
              ? days ? Math.max(0, Math.floor(elapsedDays / 7) - 1) * days : Math.max(0, Math.floor(elapsedDays / rule.interval) - 1)
              : rule.freq === 'WEEKLY' ? Math.max(0, Math.floor(elapsedDays / (7 * rule.interval)) - 1) * Math.max(1, days) : 0;
            if (Math.min(estimate, rule.count || Infinity) > CALENDAR_LIMITS.steps - steps) fail('recurrence-limit', 'This calendar exceeds the recurrence expansion limit.');
          }
          // ICAL.js 2.2.1's RDATE-only iterator does not yield DTSTART unless it is
          // repeated in RDATE. RFC recurrence sets still include DTSTART.
          if (masterComponent.hasProperty('rdate') && !masterComponent.hasProperty('rrule')) {
            const excluded = masterComponent.getAllProperties('exdate').some(property => property.getValues().some(time => isoTime(time) === isoTime(master.startDate)));
            if (!excluded) emitMasterOccurrence(master.startDate);
          }
          const iterator = master.iterator(); let occurrence;
          while ((occurrence = iterator.next())) {
            if (++steps > CALENDAR_LIMITS.steps) fail('recurrence-limit', 'This calendar exceeds the recurrence expansion limit.');
            // UTC boundary comparison, including date-only events, before serializing any output.
            if (millis(occurrence) >= Date.parse(coverage.end)) break;
            emitMasterOccurrence(occurrence);
          }
          // Explicit overrides can move into the window, or replace an EXDATE'd occurrence.
          for (const component of overrides) {
            const event = new ICAL.Event(component, { exceptions: [] });
            if (!cancelled(event) && !event.modifiesFuture()) emit(uid, event, { startDate: event.startDate, endDate: event.endDate }, event.recurrenceId, master);
          }
        } else {
          emit(uid, master, { startDate: master.startDate, endDate: master.endDate }, master.startDate, master, true);
        }
      }
    }
    return { source, events: [...events.values()].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)), coverage: { start: coverage.start, end: coverage.end }, fetchedAt: coverage.now, warnings };
  } catch (error) {
    if (error instanceof CalendarError) throw error;
    fail('invalid-calendar', 'The calendar could not be parsed safely.');
  }
}

async function boundedBody(response, signal) {
  const length = response.headers.get('content-length');
  if (length && Number(length) > CALENDAR_LIMITS.bytes) fail('calendar-too-large', 'The calendar exceeds the 2 MiB limit.');
  if (!response.body?.getReader) fail('not-calendar', 'The source returned no readable calendar.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  const cancel = () => { try { void reader.cancel().catch(() => {}); } catch { /* Only generic upstream errors are surfaced. */ } };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      if (signal.aborted) fail('calendar-timeout', 'The calendar source did not respond in time.');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CALENDAR_LIMITS.bytes) fail('calendar-too-large', 'The calendar exceeds the 2 MiB limit.');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('invalid-calendar', 'The calendar must use valid UTF-8 text.'); }
  } finally {
    signal.removeEventListener('abort', cancel);
    if (signal.aborted || size > CALENDAR_LIMITS.bytes) cancel();
    reader.releaseLock();
  }
}

/** Caller supplies per-user storage/encryption. This function never logs or returns feed URLs. */
export async function fetchAndParseCalendar(source, value, opts = {}) {
  const url = subscriptionUrl(source, value);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timeoutMs = Math.max(1, Math.min(CALENDAR_LIMITS.timeoutMs, Number(opts.timeoutMs) || CALENDAR_LIMITS.timeoutMs));
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new CalendarError('calendar-timeout', 'The calendar source did not respond in time.')); }, timeoutMs); });
  const work = async () => {
    const response = await fetchImpl(url.href, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { Accept: 'text/calendar, application/ics;q=0.9' }, signal: controller.signal });
    if (response.status !== 200 || response.redirected) fail('source-unavailable', 'The calendar source is unavailable or requires a new subscription link.');
    if (response.url && response.url !== url.href) fail('source-unavailable', 'The calendar source redirected to a different address.');
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!['text/calendar', 'application/ics', 'application/icalendar', 'text/x-vcalendar', 'application/octet-stream'].includes(type)) fail('not-calendar', 'The source returned a login page or a non-calendar response.');
    const text = await boundedBody(response, controller.signal);
    if (controller.signal.aborted) fail('calendar-timeout', 'The calendar source did not respond in time.');
    return parseCalendar(source, text, { now: opts.now, feedUrl: url.href });
  };
  try { return await Promise.race([work(), timeout]); }
  catch (error) {
    if (error instanceof CalendarError) throw error;
    if (controller.signal.aborted) fail('calendar-timeout', 'The calendar source did not respond in time.');
    fail('source-unavailable', 'The calendar source could not be retrieved. Try a new official subscription link.');
  } finally { clearTimeout(timer); controller.abort(); }
}

/** Deduplicate within each source; identical-looking events from different sources stay separate. */
export function mergeCalendars(...inputs) {
  const events = new Map();
  for (const input of inputs) for (const event of Array.isArray(input) ? input : input?.events ?? []) {
    checkSource(event.source);
    if (!/^[a-f0-9]{32}$/u.test(event.id)) fail('invalid-event', 'A normalized calendar event has an invalid ID.');
    events.set(`${event.source}:${event.id}`, { ...event });
  }
  if (events.size > CALENDAR_LIMITS.events * 2) fail('event-limit', 'The combined calendar exceeds the supported event limit.');
  return [...events.values()].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

function escapeText(value) { return String(value).replace(/\\/gu, '\\\\').replace(/\r\n?|\n/gu, '\\n').replace(/,/gu, '\\,').replace(/;/gu, '\\;'); }
function foldLine(value) {
  const lines = []; let line = '', bytes = 0;
  for (const character of value) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) { lines.push(line); line = ' '; bytes = 1; }
    line += character; bytes += length;
  }
  lines.push(line); return lines.join('\r\n');
}
function exportTime(value, allDay) {
  if (allDay) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('invalid-event', 'A calendar event has an invalid date.');
    return value.replace(/-/gu, '');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail('invalid-event', 'A calendar event has an invalid time.');
  return date.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

/** Export expanded occurrences; no feed URL, raw UID, user ID or session information is included. */
export function exportCalendar(input, opts = {}) {
  const events = mergeCalendars(input);
  const stamp = exportTime(opts.now ?? new Date().toISOString(), false);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TUM Timetable//Private Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(plain(opts.name || 'TUM Timetable', 100))}`];
  for (const event of events) {
    const scrub = secretScrubber();
    const title = plain(event.title || 'Untitled calendar event', 300, scrub);
    const start = exportTime(event.start, event.allDay), end = exportTime(event.end, event.allDay);
    if (end < start) fail('invalid-event', 'A calendar event has an invalid duration.');
    lines.push('BEGIN:VEVENT', `UID:${event.source}-${event.id}@tum-timetable.invalid`, `DTSTAMP:${stamp}`, `DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${start}`);
    if (end > start) lines.push(`DTEND${event.allDay ? ';VALUE=DATE' : ''}:${end}`);
    lines.push(`SUMMARY:${escapeText(title)}`, `CATEGORIES:${event.source === 'moodle' ? 'Moodle deadline' : 'TUMonline'}`);
    if (event.location) lines.push(`LOCATION:${escapeText(plain(event.location, 500, scrub))}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(plain(event.description, 2000, scrub))}`);
    const url = officialEventUrl(event.url, scrub); if (url) lines.push(`URL:${url}`);
    if (opts.reminders === true || opts.reminders === 'deadlines' && event.source === 'moodle') for (const trigger of ['-P1D', '-PT2H']) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${escapeText(title)}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export const exportIcs = exportCalendar;
