import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),course=path.resolve(here,'../../public/courses/in2361');
const baseline=JSON.parse(fs.readFileSync(path.join(here,'stable-ids.json'),'utf8'));
const run=spawnSync(process.execPath,['render_math.cjs'],{cwd:here,stdio:'inherit'});
if(run.error)throw run.error;
if(run.status!==0)process.exit(run.status||1);
const generated=path.join(here,'dist/data.js');
const data=JSON.parse(fs.readFileSync(generated,'utf8').replace(/^window\.NLP_DATA=/,'').trim().replace(/;$/,''));
if(data.course!=='IN2361'||JSON.stringify(data.questions.map(q=>q.id))!==JSON.stringify(baseline))throw Error('Keep the existing 91 stable IDs to preserve progress.');
for(const q of data.questions){
 for(const field of ['question','questionZh','answer','answerEn','answerHtml','answerEnHtml'])if(!q[field])throw Error('Missing '+field+': '+q.id);
 if(!q.sourceEvidence?.length)throw Error('Missing sourceEvidence: '+q.id);
 if(/katex-error/.test(q.answerHtml+q.answerEnHtml))throw Error('Invalid formula: '+q.id);
 for(const entry of q.sourceEvidence)for(const link of entry.links||[]){
  if(!String(link.url).startsWith('sources/evidence/'))continue;
  const asset=path.resolve(course,decodeURIComponent(link.url.split('#')[0]));
  if(!asset.startsWith(path.join(course,'sources/evidence')+path.sep)||!fs.existsSync(asset))throw Error('Missing evidence image: '+link.url);
 }
}
if(!fs.existsSync(path.join(course,'index.html')))throw Error('Keep authoring/ and public/ at the project root.');
fs.copyFileSync(generated,path.join(course,'data.js'));
console.log('Updated public/courses/in2361/data.js: '+data.questions.length+' bilingual questions. Preview and redeploy the static website.');
