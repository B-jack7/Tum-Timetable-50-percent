from pathlib import Path
import json,re,itertools
ROOT=Path(__file__).resolve().parent.parent
data=json.loads((ROOT/'content.json').read_text(encoding='utf-8'))
old=json.loads((ROOT.parent/'nlp-reference/content-before-bilingual.json').read_text(encoding='utf-8-sig'))
assert [q['id'] for q in data['questions']]==[q['id'] for q in old['questions']]
rendered=json.loads((ROOT/'dist/data.js').read_text(encoding='utf-8').removeprefix('window.NLP_DATA=').strip().removesuffix(';'))
for q in rendered['questions']:
 assert all(q.get(k) for k in ['question','questionZh','answer','answerEn','answerHtml','answerEnHtml','sourceEvidence']),q['id']
 for source in q['sourceEvidence']:
  for link in source.get('links',[]):
   assert (ROOT/'dist'/link['url'].split('#')[0]).is_file(),(q['id'],link)
 assert 'katex-error' not in q['answerEnHtml'],q['id']
assert [q['id'] for q in data['questions'] if q['answerKind']=='review']==['ws21-1-4']
# Independently enumerate rooted arborescences for the supplied dependency graph.
edges=[('root','Solve',11),('Solve','the',6),('Solve','exam',8),('exam','the',8),('the','exam',9)]
trees=[]
for chosen in itertools.product(*[[e for e in edges if e[1]==node] for node in ['Solve','the','exam']]):
 parent={b:a for a,b,w in chosen}
 for node in parent:
  seen=set()
  while node!='root' and node not in seen:seen.add(node);node=parent[node]
  if node!='root':break
 else:trees.append((sum(e[2] for e in chosen),chosen))
assert max(trees)[0]==27
print('PASS: 91 unchanged IDs, bilingual answers and formulas, source links, unresolved flag; independently checked dependency tree optimum 27.')
