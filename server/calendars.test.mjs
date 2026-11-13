import test from 'node:test';
import assert from 'node:assert/strict';
import ICAL from 'ical.js';
import { CalendarError, CALENDAR_LIMITS, validateCalendarUrl, parseCalendar, fetchAndParseCalendar, mergeCalendars, exportCalendar } from './calendars.mjs';

const NOW = '2026-10-21T12:00:00Z';
const TUM = 'https://campus.tum.de/tumonlinej/ws/termin/ical?pStud=fictional&pToken=fake-secret-token';
const MOODLE = 'https://www.moodle.tum.de/calendar/export_execute.php?userid=123&authtoken=fake-secret-token&preset_what=all&preset_time=recentupcoming';
const wrap = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fictional test fixtures//EN', ...events, 'END:VCALENDAR', ''].join('\r\n');
const event = (uid, fields = '') => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261001T120000Z\r\n${fields}\r\nEND:VEVENT`;
const response = (body, type = 'text/calendar; charset=utf-8', extra = {}) => new Response(body, { status: 200, headers: { 'Content-Type': type, ...extra } });
const errorCode = code => error => error instanceof CalendarError && error.code === code && !error.message.includes('fake-secret-token');

// Complete, standards-shaped ICS fixture. All courses, rooms, UIDs and links are invented.
const BERLIN_FIXTURE = wrap(
  'BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin\r\nBEGIN:DAYLIGHT\r\nDTSTART:19810329T020000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nDTSTART:19961027T030000\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE',
  event('fictional-weekly@example.invalid', 'DTSTART;TZID=Europe/Berlin:20261019T100000\r\nDTEND;TZID=Europe/Berlin:20261019T113000\r\nRRULE:FREQ=WEEKLY;COUNT=5\r\nEXDATE;TZID=Europe/Berlin:20261102T100000\r\nSUMMARY:示例课程\\, A\\;B\r\nLOCATION:虚构楼\\, 101\r\nDESCRIPTION:第一行\\n第二行\\, 分号\\;反斜线\\\\\r\nURL:https://campus.tum.de/tumonline/ee/ui/course/example'),
  event('fictional-weekly@example.invalid', 'RECURRENCE-ID;TZID=Europe/Berlin:20261026T100000\r\nDTSTART;TZID=Europe/Berlin:20261026T120000\r\nDTEND;TZID=Europe/Berlin:20261026T133000\r\nSEQUENCE:2\r\nSUMMARY:改期示例\r\nLOCATION:虚构楼 202'),
  event('fictional-weekly@example.invalid', 'RECURRENCE-ID;TZID=Europe/Berlin:20261109T100000\r\nSTATUS:CANCELLED\r\nSEQUENCE:1'),
  event('fictional-all-day@example.invalid', 'DTSTART;VALUE=DATE:20261022\r\nDTEND;VALUE=DATE:20261024\r\nSUMMARY:两天活动'),
  event('fictional-utc@example.invalid', 'DTSTART:20261023T150000Z\r\nDTEND:20261023T160000Z\r\nSUMMARY:UTC meeting'),
);

test('only exact official HTTPS calendar hosts and explicit paths are accepted', () => {
  assert.deepEqual(validateCalendarUrl('tumonline', TUM), { source: 'tumonline', host: 'campus.tum.de' });
  assert.deepEqual(validateCalendarUrl('moodle', MOODLE), { source: 'moodle', host: 'www.moodle.tum.de' });
  validateCalendarUrl('moodle', MOODLE.replace('www.moodle', 'moodle'));
  for (const path of ['/tumonline/ws/termin/ical', '/tumonline/ical.cal.ical']) validateCalendarUrl('tumonline', `https://campus.tum.de${path}?pToken=fictional`);
  for (const value of [
    TUM.replace('https:', 'http:'), TUM.replace('campus.tum.de', '127.0.0.1'), TUM.replace('campus.tum.de', '[::1]'),
    TUM.replace('campus.tum.de', '2130706433'), TUM.replace('campus.tum.de', 'localhost'), TUM.replace('campus.tum.de', '169.254.169.254'),
    TUM.replace('campus.tum.de', 'campus.tum.de.evil.test'), TUM.replace('campus.tum.de', 'campus.tum.de.'), TUM.replace('campus.tum.de', 'user:pass@campus.tum.de'),
    TUM.replace('campus.tum.de', 'campus.tum.de:8443'), TUM.replace('campus.tum.de', 'campus.tum.de:443'), TUM.replace('campus.tum.de', '@campus.tum.de'), TUM + '#fragment', TUM + '#', TUM.replace('/ws/', '/%77s/'),
    TUM.replace('/ws/termin/ical', '/ee/rest/private'), 'https://campus.tum.de/tumonlinej/ws/termin/ical', TUM + 'a'.repeat(4096),
  ]) assert.throws(() => validateCalendarUrl('tumonline', value), CalendarError);
  assert.throws(() => validateCalendarUrl('moodle', TUM), CalendarError);
  assert.throws(() => validateCalendarUrl('unknown', TUM), errorCode('invalid-source'));
});

test('Berlin timezone, DST, EXDATE, overrides, cancellation, all-day and UTC work together', () => {
  const result = parseCalendar('tumonline', BERLIN_FIXTURE, { now: NOW });
  assert.equal(result.coverage.start, '2026-10-18T22:00:00.000Z');
  const recurring = result.events.filter(item => item.occurrence.includes('T08:00:00') || item.occurrence.includes('T09:00:00'));
  assert.equal(recurring.length, 3);
  assert.equal(recurring[0].start, '2026-10-19T08:00:00.000Z');
  assert.equal(recurring[1].start, '2026-10-26T11:00:00.000Z');
  assert.equal(recurring[1].occurrence, '2026-10-26T09:00:00.000Z');
  assert.equal(recurring[1].title, '改期示例');
  assert.equal(recurring[2].start, '2026-11-16T09:00:00.000Z');
  assert.ok(!result.events.some(item => item.start.startsWith('2026-11-02') || item.start.startsWith('2026-11-09')));
  assert.equal(result.events.find(item => item.allDay).end, '2026-10-24');
  assert.equal(result.events.find(item => item.title === 'UTC meeting').start, '2026-10-23T15:00:00.000Z');
  assert.equal(recurring[0].description, '第一行\n第二行, 分号;反斜线\\');
});

test('TZID Europe/Berlin works without VTIMEZONE and floating dates have an explicit warning', () => {
  const body = wrap(event('no-zone', 'DTSTART;TZID=Europe/Berlin:20261026T100000\r\nDTEND;TZID=Europe/Berlin:20261026T110000\r\nSUMMARY:Fallback'), event('floating', 'DTSTART:20261027T100000\r\nDTEND:20261027T110000\r\nSUMMARY:Floating'));
  const result = parseCalendar('tumonline', body, { now: NOW });
  assert.equal(result.events[0].start, '2026-10-26T09:00:00.000Z');
  assert.equal(result.events[1].start, '2026-10-27T09:00:00.000Z');
  assert.deepEqual(result.warnings, ['floating-times-use-Europe/Berlin']);
});

test('custom embedded VTIMEZONE is local to its calendar, with unknown zones rejected', () => {
  const zone = 'BEGIN:VTIMEZONE\r\nTZID:Fixture/Fixed\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0300\r\nTZOFFSETTO:+0300\r\nEND:STANDARD\r\nEND:VTIMEZONE';
  const body = wrap(zone, event('custom', 'DTSTART;TZID=Fixture/Fixed:20261026T100000\r\nDTEND;TZID=Fixture/Fixed:20261026T110000'));
  assert.equal(parseCalendar('tumonline', body, { now: NOW }).events[0].start, '2026-10-26T07:00:00.000Z');
  assert.throws(() => parseCalendar('tumonline', body.replace(zone, ''), { now: NOW }), errorCode('unsupported-timezone'));
  const utcAlias = wrap(event('alias', 'DTSTART;TZID=Etc/UTC:20261026T100000\r\nDTEND;TZID=Etc/UTC:20261026T110000'));
  assert.equal(parseCalendar('tumonline', utcAlias, { now: NOW }).events[0].start, '2026-10-26T10:00:00.000Z');
});

test('dedup chooses newer SEQUENCE, cancelled masters disappear, UIDs stay opaque and stable', () => {
  const fields = 'DTSTART:20261026T100000Z\r\nDTEND:20261026T110000Z';
  const body = wrap(event('private-person@example.invalid', fields + '\r\nSUMMARY:old\r\nSEQUENCE:1'), event('private-person@example.invalid', fields + '\r\nSUMMARY:new\r\nSEQUENCE:2'), event('cancel', fields + '\r\nSTATUS:CANCELLED'));
  const first = parseCalendar('tumonline', body, { now: NOW });
  const second = parseCalendar('tumonline', body, { now: '2026-10-22T12:00:00Z' });
  assert.equal(first.events.length, 1); assert.equal(first.events[0].title, 'new');
  assert.equal(first.events[0].id, second.events[0].id);
  assert.ok(!JSON.stringify(first).includes('private-person'));
  const moodle = parseCalendar('moodle', body, { now: NOW });
  assert.equal(moodle.events[0].kind, 'deadline');
  assert.equal(mergeCalendars(first, first, moodle).length, 2);
  assert.equal(first.events.length, 1);
});

test('cancellation feed and orphan cancelled overrides never create events', () => {
  const body = wrap(event('cancel', 'RECURRENCE-ID:20261026T100000Z\r\nSTATUS:CANCELLED'));
  assert.equal(parseCalendar('tumonline', body, { now: NOW }).events.length, 0);
  assert.equal(parseCalendar('tumonline', BERLIN_FIXTURE.replace('VERSION:2.0', 'VERSION:2.0\r\nMETHOD:CANCEL'), { now: NOW }).events.length, 0);
});

test('moved occurrence keeps its original ID, including explicit overrides of an EXDATE', () => {
  const master = event('move', 'DTSTART:20261019T100000Z\r\nDTEND:20261019T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nEXDATE:20261026T100000Z\r\nSUMMARY:Original');
  const override = event('move', 'RECURRENCE-ID:20261026T100000Z\r\nDTSTART:20261027T100000Z\r\nDTEND:20261027T110000Z\r\nSUMMARY:Moved');
  const before = parseCalendar('tumonline', wrap(master.replace('\r\nEXDATE:20261026T100000Z', '')), { now: NOW });
  const after = parseCalendar('tumonline', wrap(master, override), { now: NOW });
  assert.equal(after.events.length, 2);
  assert.equal(before.events[1].id, after.events[1].id);
  assert.equal(after.events[1].start, '2026-10-27T10:00:00.000Z');
});

test('window includes this week and at most the coming 180 days', () => {
  const body = wrap(event('daily', 'DTSTART:20261001T100000Z\r\nDTEND:20261001T110000Z\r\nRRULE:FREQ=DAILY\r\nSUMMARY:Daily'));
  const result = parseCalendar('tumonline', body, { now: NOW });
  assert.equal(result.events[0].start, '2026-10-19T10:00:00.000Z');
  assert.ok(result.events.length <= 187);
  assert.ok(result.events.every(item => item.start >= result.coverage.start && item.start < result.coverage.end));
  const horizonDay = result.coverage.end.slice(0, 10).replaceAll('-', '');
  const allDay = parseCalendar('tumonline', wrap(event('horizon', `DTSTART;VALUE=DATE:${horizonDay}\r\nSUMMARY:Last day`)), { now: NOW });
  assert.equal(allDay.events.length, 1);
});

test('monthly/yearly rules and explicit RDATE use bounded expansion', () => {
  const body = wrap(
    event('monthly', 'DTSTART:20261020T100000Z\r\nDTEND:20261020T110000Z\r\nRRULE:FREQ=MONTHLY;BYMONTHDAY=20;COUNT=3\r\nSUMMARY:Monthly'),
    event('yearly', 'DTSTART:20261022T100000Z\r\nDTEND:20261022T110000Z\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=22;COUNT=2\r\nSUMMARY:Yearly'),
    event('rdate', 'DTSTART:20261023T100000Z\r\nDTEND:20261023T110000Z\r\nRDATE:20261024T100000Z,20261025T100000Z\r\nEXDATE:20261024T100000Z\r\nSUMMARY:RDATE'),
  );
  const result = parseCalendar('tumonline', body, { now: NOW });
  assert.equal(result.events.filter(item => item.title === 'Monthly').length, 3);
  assert.equal(result.events.filter(item => item.title === 'Yearly').length, 1);
  assert.deepEqual(result.events.filter(item => item.title === 'RDATE').map(item => item.start.slice(0, 10)), ['2026-10-23', '2026-10-25']);
});

test('THISANDFUTURE applies changes and cancelled ranges without reading missing DTSTART', () => {
  const master = event('range', 'DTSTART:20261019T100000Z\r\nDTEND:20261019T110000Z\r\nRRULE:FREQ=WEEKLY;COUNT=5\r\nSUMMARY:Original');
  const move = event('range', 'RECURRENCE-ID;RANGE=THISANDFUTURE:20261026T100000Z\r\nDTSTART:20261026T120000Z\r\nDTEND:20261026T130000Z\r\nSUMMARY:Moved');
  const cancel = event('range', 'RECURRENCE-ID;RANGE=THISANDFUTURE:20261109T100000Z\r\nSTATUS:CANCELLED');
  const result = parseCalendar('tumonline', wrap(master, move, cancel), { now: NOW });
  assert.equal(result.events.length, 3);
  assert.equal(result.events[2].start, '2026-11-02T12:00:00.000Z');
  assert.equal(result.events[2].title, 'Moved');
});

test('spring DST keeps a recurring Berlin local class at the same wall-clock time', () => {
  const body = wrap(event('spring', 'DTSTART;TZID=Europe/Berlin:20270322T100000\r\nDTEND;TZID=Europe/Berlin:20270322T110000\r\nRRULE:FREQ=WEEKLY;COUNT=3'));
  const result = parseCalendar('tumonline', body, { now: '2027-03-24T12:00:00Z' });
  assert.deepEqual(result.events.map(item => item.start), ['2027-03-22T09:00:00.000Z', '2027-03-29T08:00:00.000Z', '2027-04-05T08:00:00.000Z']);
});

test('a non-recurring event retains its UID when its time changes', () => {
  const body = wrap(event('single', 'DTSTART:20261026T100000Z\r\nDTEND:20261026T110000Z'));
  const before = parseCalendar('tumonline', body, { now: NOW });
  const after = parseCalendar('tumonline', body.replaceAll('20261026', '20261027'), { now: NOW });
  assert.equal(before.events[0].id, after.events[0].id);
  assert.notEqual(before.events[0].start, after.events[0].start);
});

test('recurrence and timezone bombs are refused before expansion', () => {
  const fields = 'DTSTART:20261001T100000Z\r\nDTEND:20261001T110000Z';
  for (const rule of ['FREQ=SECONDLY', 'FREQ=DAILY;BYSECOND=1,2,3', 'FREQ=DAILY;COUNT=999999', 'FREQ=DAILY;INTERVAL=7;BYDAY=TU', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30']) assert.throws(() => parseCalendar('tumonline', wrap(event('bomb', fields + '\r\nRRULE:' + rule)), { now: NOW }), CalendarError);
  assert.throws(() => parseCalendar('tumonline', wrap(event('old', fields.replaceAll('20261001', '19700101') + '\r\nRRULE:FREQ=DAILY')), { now: NOW }), errorCode('recurrence-limit'));
  const zoneBomb = 'BEGIN:VTIMEZONE\r\nTZID:Bomb\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nRRULE:FREQ=MINUTELY\r\nEND:STANDARD\r\nEND:VTIMEZONE';
  assert.throws(() => parseCalendar('tumonline', wrap(zoneBomb), { now: NOW }), errorCode('unsupported-recurrence'));
});

test('per-source event count, descriptions and structural limits are bounded', () => {
  const fields = 'DTSTART:20261026T100000Z\r\nDTEND:20261026T110000Z';
  const body = wrap(event('long', fields + '\r\nDESCRIPTION:' + '中文'.repeat(1400)));
  assert.equal(Array.from(parseCalendar('moodle', body, { now: NOW }).events[0].description).length, 2000);
  const tooMany = wrap(...Array.from({ length: 1501 }, (_, index) => event(`uid-${index}`, fields)));
  assert.throws(() => parseCalendar('moodle', tooMany, { now: NOW }), errorCode('event-limit'));
  assert.throws(() => parseCalendar('moodle', wrap(event('x', fields + '\r\nDESCRIPTION:' + 'x'.repeat(CALENDAR_LIMITS.bytes))), { now: NOW }), errorCode('calendar-too-large'));
  assert.throws(() => parseCalendar('moodle', wrap(event('invalid-date', fields.replaceAll('20261026', '20260230'))), { now: NOW }), errorCode('invalid-calendar'));
});

test('fetch is an anonymous no-store GET with no redirects and no cookies or authorization', async () => {
  let call;
  const result = await fetchAndParseCalendar('tumonline', TUM, { now: NOW, fetchImpl: async (url, options) => { call = { url, options }; return response(BERLIN_FIXTURE); } });
  assert.equal(call.options.redirect, 'manual'); assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.cache, 'no-store');
  assert.equal(call.options.method, 'GET'); assert.deepEqual(Object.keys(call.options.headers), ['Accept']);
  assert.equal(result.events.length, 5);
  assert.ok(!JSON.stringify(result).includes('fake-secret-token'));
});

test('upstream HTML, missing/misleading MIME, redirects, bad UTF-8 and status failures are refused', async () => {
  const responses = [response('<!doctype html><html>Login</html>', 'text/html'), response('<html>Login</html>'), response(BERLIN_FIXTURE, 'application/json'), new Response(BERLIN_FIXTURE, { status: 503, headers: { 'Content-Type': 'text/calendar' } }), new Response(new Uint8Array([0xff, 0xfe]), { headers: { 'Content-Type': 'text/calendar' } })];
  for (const sourceResponse of responses) await assert.rejects(fetchAndParseCalendar('tumonline', TUM, { now: NOW, fetchImpl: async () => sourceResponse }), CalendarError);
  await assert.rejects(fetchAndParseCalendar('tumonline', TUM, { fetchImpl: async () => { throw new TypeError('redirect to fake-secret-token'); } }), errorCode('source-unavailable'));
  const redirected = response(BERLIN_FIXTURE); Object.defineProperty(redirected, 'redirected', { value: true });
  await assert.rejects(fetchAndParseCalendar('tumonline', TUM, { fetchImpl: async () => redirected }), errorCode('source-unavailable'));
  let requests = 0;
  await assert.rejects(fetchAndParseCalendar('tumonline', TUM, { fetchImpl: async (url, options) => {
    requests++;
    assert.equal(url, TUM);
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://outside.example.invalid/calendar' } });
  } }), errorCode('source-unavailable'));
  assert.equal(requests, 1, 'a redirect must be rejected without making a second request');
});

test('content-length and streamed bodies are limited after decompression', async () => {
  await assert.rejects(fetchAndParseCalendar('tumonline', TUM, { fetchImpl: async () => response(BERLIN_FIXTURE, 'text/calendar', { 'Content-Length': String(CALENDAR_LIMITS.bytes + 1) }) }), errorCode('calendar-too-large'));
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(CALENDAR_LIMITS.bytes)); controller.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
  await assert.rejects(fetchAndParseCalendar('tumonline', TUM, { fetchImpl: async () => response(stream) }), errorCode('calendar-too-large'));
  assert.equal(cancelled, true);
});

test('timeout covers fetch and body reading and returns only a generic error', async () => {
  let signal;
  await assert.rejects(fetchAndParseCalendar('tumonline', TUM, { timeoutMs: 10, fetchImpl: async (_, options) => { signal = options.signal; return new Promise(() => {}); } }), errorCode('calendar-timeout'));
  assert.equal(signal.aborted, true);
  let bodyCancelled = false;
  const stream = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { bodyCancelled = true; } });
  await assert.rejects(fetchAndParseCalendar('tumonline', TUM, { timeoutMs: 10, fetchImpl: async () => response(stream) }), errorCode('calendar-timeout'));
  assert.equal(bodyCancelled, true);
});

test('token-bearing URLs are removed from all display fields and only official safe event links survive', async () => {
  const fields = 'DTSTART:20261026T100000Z\r\nDTEND:20261026T110000Z\r\nSUMMARY:fake-secret-token\r\nDESCRIPTION:private ' + MOODLE + '\r\nLOCATION:fake-secret-token\r\nURL:' + MOODLE;
  const result = await fetchAndParseCalendar('moodle', MOODLE, { now: NOW, fetchImpl: async () => response(wrap(event('secret', fields))) });
  assert.ok(!JSON.stringify(result).includes('fake-secret-token')); assert.equal(result.events[0].url, null);
  for (const url of ['https://evil.test/a', 'http://moodle.tum.de/a', 'https://user:pass@moodle.tum.de/a', 'https://moodle.tum.de:444/a', 'https://moodle.tum.de/a?authtoken=another-secret']) {
    const item = parseCalendar('moodle', wrap(event('link', fields.replace('URL:' + MOODLE, 'URL:' + url))), { now: NOW }).events[0]; assert.equal(item.url, null);
  }
  const valid = parseCalendar('moodle', wrap(event('link', 'DTSTART:20261026T100000Z\r\nDTEND:20261026T110000Z\r\nURL:https://www.moodle.tum.de/mod/assign/view.php?id=42')), { now: NOW });
  assert.equal(valid.events[0].url, 'https://www.moodle.tum.de/mod/assign/view.php?id=42');
});

test('export has stable UIDs, UTF-8 75-octet CRLF folding, escaping, dates and optional DISPLAY alarms', () => {
  const result = parseCalendar('tumonline', BERLIN_FIXTURE, { now: NOW });
  result.events[0].description += '\n' + '中文🙂'.repeat(150);
  const output = exportCalendar(result, { now: NOW, reminders: true });
  assert.equal((output.match(/BEGIN:VEVENT/g) ?? []).length, 5);
  assert.equal((output.match(/ACTION:DISPLAY/g) ?? []).length, 10);
  assert.equal((output.match(/TRIGGER:-P1D/g) ?? []).length, 5);
  assert.equal((output.match(/TRIGGER:-PT2H/g) ?? []).length, 5);
  assert.ok(output.includes('DTSTART;VALUE=DATE:20261022\r\nDTEND;VALUE=DATE:20261024'));
  assert.ok(!output.replace(/\r\n/gu, '').includes('\n'));
  for (const line of output.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  const calendar = new ICAL.Component(ICAL.parse(output));
  const first = calendar.getAllSubcomponents('vevent').find(item => item.getFirstPropertyValue('summary') === '示例课程, A;B');
  assert.equal(first.getFirstPropertyValue('location'), '虚构楼, 101');
  assert.ok(first.getFirstPropertyValue('description').includes('第二行, 分号;反斜线\\'));
  const uids = output.match(/^UID:.*$/gm);
  assert.deepEqual(uids, exportCalendar(result, { now: '2026-10-22T12:00:00Z' }).match(/^UID:.*$/gm));
  assert.ok(!exportCalendar(result).includes('BEGIN:VALARM'));
  assert.ok(!output.includes('fictional-weekly@example.invalid'));
});

test('deadline-only reminders add alarms to Moodle events while retaining all classes', () => {
  const body = wrap(event('same-source-uid', 'DTSTART:20261026T100000Z\r\nDTEND:20261026T110000Z\r\nSUMMARY:Fixture event'));
  const events = mergeCalendars(parseCalendar('tumonline', body, { now: NOW }), parseCalendar('moodle', body, { now: NOW }));
  const calendar = new ICAL.Component(ICAL.parse(exportCalendar(events, { now: NOW, reminders: 'deadlines' })));
  const entries = calendar.getAllSubcomponents('vevent');
  assert.equal(entries.length, 2);
  assert.equal(entries.find(entry => entry.getFirstPropertyValue('uid').startsWith('tumonline-')).getAllSubcomponents('valarm').length, 0);
  const alarms = entries.find(entry => entry.getFirstPropertyValue('uid').startsWith('moodle-')).getAllSubcomponents('valarm');
  assert.equal(alarms.length, 2);
  assert.deepEqual(alarms.map(alarm => alarm.getFirstPropertyValue('trigger').toString()), ['-P1D', '-PT2H']);
  assert.ok(alarms.every(alarm => alarm.getFirstPropertyValue('action') === 'DISPLAY'));
  assert.equal((exportCalendar(events, { now: NOW, reminders: true }).match(/BEGIN:VALARM/gu) ?? []).length, 4);
});
