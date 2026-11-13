import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, checkProject } from './check-project.mjs';

checkProject();
const source = path.join(projectRoot, 'public');
const target = path.resolve(projectRoot, 'dist');
if (path.dirname(target) !== projectRoot || path.basename(target) !== 'dist') throw Error('Refusing an output directory outside this project.');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
const allowed = ['index.html', 'login.html', 'auth.js', 'auth.css', 'manifest.webmanifest', 'icons'];
for (const relative of allowed) {
  const from = path.join(source, relative);
  if (!fs.existsSync(from)) throw Error('Missing login-preview asset: ' + relative);
  fs.cpSync(from, path.join(target, relative), { recursive: true });
}
const index = fs.readFileSync(path.join(target, 'index.html'), 'utf8');
if (!/auth\.js/.test(index) || /(?:src|href)\s*=\s*["'][^"']*(?:data\.js|pwa\.js|app\.js|sw\.js)/i.test(index)) throw Error('Static preview entry must be the login page, not a protected account or legacy app shell.');
console.log('Built login-introduction-only preview in dist/: no timetable, NLP bank, service worker, backend or account data.');
