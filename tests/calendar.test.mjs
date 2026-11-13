import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { projectRoot } from '../scripts/check-project.mjs';

test('deadline export preserves Unicode, stable IDs, timezone and reminder boundaries', () => {
  const context = { URL };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'public/tasks.js'), 'utf8'), context);
  const now = '2030-01-01T00:00:00Z';
  const tasks = [
    { id: 'example-1', title: 'Example, deadline; ' + '中英题目'.repeat(35), courseId: 'example-course', dueAt: '2030-01-03T23:59:00+01:00', note: 'First line\nSecond line', url: 'https://example.org/task/1', dueEstimated: true },
    { id: 'processed', title: 'Handled', dueAt: '2030-01-04T00:00:00Z' },
    { id: 'unknown', title: 'Unknown time' },
    { id: 'past', title: 'Past', dueAt: '2029-12-01T00:00:00Z' }
  ];
  const options = { now, stamp: now, processedIds: ['processed'], courses: [{ id: 'example-course', title: 'Example course' }] };
  const calendar = context.MOODLE_TASKS.buildCalendar(tasks, options);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(calendar.includes('DTSTART:20300103T225900Z\r\nDTEND:20300103T230000Z'));
  assert.ok(calendar.includes('TRIGGER:-P1D') && calendar.includes('TRIGGER:-PT2H'));
  assert.ok(calendar.includes('【预计】'));
  assert.ok(!calendar.replace(/\r\n/g, '').includes('\n'));
  for (const line of calendar.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  const uid = calendar.match(/^UID:(.+)$/m)?.[1];
  assert.equal(uid, context.MOODLE_TASKS.buildCalendar(tasks, { ...options, stamp: '2030-01-02T00:00:00Z' }).match(/^UID:(.+)$/m)?.[1]);
  assert.equal(context.MOODLE_TASKS.validDueAt('2030-02-30T10:00:00Z'), null);
  assert.equal(context.MOODLE_TASKS.validDueAt('2030-01-03'), null);
});
