import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { checkProject, projectRoot } from '../scripts/check-project.mjs';

test('public starter contains no timetable/account snapshot and keeps all bilingual evidence', () => {
  const result = checkProject();
  assert.equal(result.personalCourses, 0);
  assert.equal(result.personalTasks, 0);
  assert.equal(result.nlpQuestions, 91);
  assert.ok(result.evidenceReferences > 0);
});

test('legacy NLP backup remains compatible without importing unknown records', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'public/courses/in2361/core.js'), 'utf8'), context);
  const baseline = JSON.parse(fs.readFileSync(path.join(projectRoot, 'authoring/in2361/stable-ids.json'), 'utf8'));
  const id = baseline[0];
  const backup = { format: 'nlp-study-backup', version: 1, course: 'IN2361', items: { [id]: { reviewed: true, wrong: true, note: 'Existing note', draft: 'Existing answer', schedule: { repetitions: 2, interval: 6, ease: 2.5, due: 2000000000000, last: 1999481600000 } }, unknown: { reviewed: true } } };
  const restored = context.NLP_CORE.sanitize(backup, baseline);
  assert.equal(restored[id].note, 'Existing note');
  assert.equal(restored[id].draft, 'Existing answer');
  assert.equal(restored[id].schedule.interval, 6);
  assert.equal(restored.unknown, undefined);
  assert.throws(() => context.NLP_CORE.sanitize({ ...backup, course: 'OTHER' }, baseline));
});
