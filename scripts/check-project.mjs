import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const parseBank = text => JSON.parse(text.replace(/^\uFEFF/, '').replace(/^window\.(?:NLP_DATA|TIMETABLE_DATA)\s*=\s*/, '').trim().replace(/;$/, ''));
export function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(directory, item.name)) : [path.join(directory, item.name)]);
}
export function checkProject() {
  const publicDir = path.join(projectRoot, 'public');
  const files = walk(publicDir);
  const forbidden = /(?:^|\/)(?:\.git|\.openai|node_modules|server|private|authoring)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:pdf|pem|key|p12|pfx|sqlite|db|ics)$/i;
  for (const file of files) {
    const relative = path.relative(publicDir, file).split(path.sep).join('/');
    if (forbidden.test(relative)) throw Error('Private or excluded file in public/: ' + relative);
  }
  const initial = parseBank(fs.readFileSync(path.join(publicDir, 'data.js'), 'utf8'));
  if (!Array.isArray(initial.courses) || initial.courses.length !== 0 || initial.moodle !== null) throw Error('The public starter must not contain personal timetable records or Moodle tasks.');
  const courseDir = path.join(publicDir, 'courses/in2361');
  const bank = parseBank(fs.readFileSync(path.join(courseDir, 'data.js'), 'utf8'));
  const stableIds = JSON.parse(fs.readFileSync(path.join(projectRoot, 'authoring/in2361/stable-ids.json'), 'utf8'));
  if (bank.questions.length !== 91 || JSON.stringify(bank.questions.map(q => q.id)) !== JSON.stringify(stableIds)) throw Error('NLP stable IDs changed.');
  let evidenceReferences = 0;
  for (const q of bank.questions) {
    for (const field of ['question', 'questionZh', 'answer', 'answerEn', 'answerHtml', 'answerEnHtml']) if (!q[field]) throw Error('Missing bilingual field: ' + q.id + '.' + field);
    if (!q.sourceEvidence?.length || /katex-error/.test(q.answerHtml + q.answerEnHtml)) throw Error('Invalid source or math content: ' + q.id);
    for (const source of q.sourceEvidence) for (const link of source.links || []) {
      if (!String(link.url).startsWith('sources/evidence/')) continue;
      const asset = path.resolve(courseDir, decodeURIComponent(link.url.split('#')[0]));
      if (!asset.startsWith(path.join(courseDir, 'sources/evidence') + path.sep) || !fs.existsSync(asset)) throw Error('Missing evidence image: ' + link.url);
      evidenceReferences++;
    }
  }
  return { publicFiles: files.length, personalCourses: 0, personalTasks: 0, nlpQuestions: bank.questions.length, evidenceReferences };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(checkProject(), null, 2));
