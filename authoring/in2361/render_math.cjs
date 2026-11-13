const fs=require('node:fs'),path=require('node:path');
const katex=require('./tools/katex.js');
const data=JSON.parse(fs.readFileSync('content.json','utf8'));
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let formulaCount=0;
function render(text){
 let previous=0,parts=[];
 const re=/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
 for(const m of text.matchAll(re)){
  parts.push(esc(text.slice(previous,m.index)).replace(/\n/g,'<br>'));
  parts.push(katex.renderToString(m[1]??m[2],{displayMode:m[1]!==undefined,throwOnError:true,trust:false,output:'htmlAndMathml'}));
  previous=m.index+m[0].length;formulaCount++;
 }
 parts.push(esc(text.slice(previous)).replace(/\n/g,'<br>'));
 return parts.join('');
}
for(const q of data.questions){
 if(!q.answerEn||!q.questionZh||!q.sourceEvidence?.length)throw Error('Incomplete bilingual source review: '+q.id);
 q.answerHtml=render(q.answer);q.answerEnHtml=render(q.answerEn);
 for(const field of ['auditNoteEn','auditNoteZh','sourceExcerptEn','sourceExcerptZh'])if(q[field])q[field+'Html']=render(q[field]);
}
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/data.js','window.NLP_DATA='+JSON.stringify(data)+';\n');
console.log(JSON.stringify({questions:data.questions.length,formulas:formulaCount,math:'prerendered'}));
