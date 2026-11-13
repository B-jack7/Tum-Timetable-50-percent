from pathlib import Path
import sys,re
ROOT=Path(__file__).resolve().parent.parent
target=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'dist'
p=target/'app.js';s=p.read_text(encoding='utf-8-sig')
if 'function bilingualAnswer(q)' in s:
 if '${bilingualAnswer(q)}</details>' in s[s.index(' function questionCard(q,'):]:
  print('Bilingual UI already applied');sys.exit(0)
 # Repair an early patch that matched the helper rather than the question card.
 a=s.index(' function bilingualAnswer(q)');b=s.index(' function questionCard(q,',a)
 s=s[:a]+(ROOT/'bilingual/ui-functions.js').read_text(encoding='utf-8')+'\n'+s[b:]
 start=s.index('<div class="answer-text">${q.answerHtml',s.index(' function questionCard(q,'))
 end=s.index('</details>',start)
 s=s[:start]+'${bilingualAnswer(q)}'+s[end:]
 p.write_text(s,encoding='utf-8');print('Repaired bilingual answer rendering');sys.exit(0)
def replace(old,new):
 global s
 assert old in s,repr(old)
 s=s.replace(old,new)
replace('${q.title} ${q.question} ${q.answer} ${q.tags.join', '${q.title} ${q.question} ${q.questionZh} ${q.answer} ${q.answerEn} ${q.tags.join')
replace(' function questionCard(q,',(ROOT/'bilingual/ui-functions.js').read_text(encoding='utf-8')+'\n function questionCard(q,')
start=s.index('<div class="answer-text">${q.answerHtml',s.index(' function questionCard(q,'))
end=s.index('</details>',start)
s=s[:start]+'${bilingualAnswer(q)}'+s[end:]
replace('<p class="question-text" lang="en">${esc(q.question)}</p>','<p class="question-text answer-en" lang="en">${esc(q.question)}</p><p class="question-text question-translation answer-zh" lang="zh-CN">${esc(q.questionZh)}</p>')
replace('展开中文解析与自评要点','展开中英双语解析 / Show answer')
replace('参考所附解答 · 中文整理与校核','参考所附解答 · 双语整理与校核')
replace('英文题干、中文解析和可追溯的资料来源。','中英双语题目与解析，逐题核对原资料。')
replace('两道缺少可靠标准解的题标为','缺少可靠数值答案的题标为')
replace('中文整理会提示','双语整理会提示')
replace(' const D=window.NLP_DATA,C=window.NLP_CORE,$=s=>document.querySelector(s);',' const D=window.NLP_DATA,C=window.NLP_CORE,$=s=>document.querySelector(s);\n let answerLanguage="both";try{const saved=localStorage.getItem("nlp-answer-language-v2");if(["both","en","zh"].includes(saved))answerLanguage=saved;}catch{}')
replace('+selections()+', '+answerLanguageControl()+selections()+')
replace('<div class="deck-options">','${answerLanguageControl()}<div class="deck-options">')
replace("document.title=$('#page-label').textContent", "syncAnswerLanguage();document.title=$('#page-label').textContent")
replace(" document.addEventListener('input',", " document.addEventListener('change',e=>{if(e.target.matches('[data-answer-language]')){answerLanguage=e.target.value;try{localStorage.setItem('nlp-answer-language-v2',answerLanguage);}catch{}syncAnswerLanguage();}});\n document.addEventListener('input',")
p.write_text(s,encoding='utf-8')
css=target/'style.css'
if 'NLP BILINGUAL SOURCE REVIEW v2' not in css.read_text(encoding='utf-8-sig'):
 with css.open('a',encoding='utf-8') as f:f.write('\n'+(ROOT/'bilingual/bilingual.css').read_text(encoding='utf-8'))
index=target/'index.html';html=index.read_text(encoding='utf-8-sig')
html=re.sub(r'(style\.css|data\.js|core\.js|app\.js)(?:\?v=[^"\s]+)?',r'\1?v=20261113-bilingual',html)
index.write_text(html,encoding='utf-8')
print('Applied bilingual UI to '+str(target))
