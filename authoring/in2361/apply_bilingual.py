from pathlib import Path
import json, runpy, re, os
ROOT=Path(__file__).resolve().parent
DATA=ROOT/'content.json'
data=json.loads(DATA.read_text(encoding='utf-8'))
updates={}
for name in ['past','mock','practice']:
 updates.update(runpy.run_path(str(ROOT/'bilingual'/f'{name}.py'))['UPDATES'])
assert set(updates)=={q['id'] for q in data['questions']},'Bilingual coverage must match all stable IDs'

files={
 'intro':'1_Introduction.pdf','tokens':'2_WordsAndTokens.pdf','ngram':'3_N-gramLangageModels.pdf',
 'classify':'4_LogisticRegressionAndTextClassification.pdf','embed':'5_Embeddings.pdf','nn':'6_NeuralNetworks.pdf',
 'llm':'7_LargeLanguageModels.pdf','transformer':'8_Transformers.pdf','masked':'9_MaskedLMs.pdf',
 'post':'10_PostTraining_InstructionTuning_Alignment_andTestTimeCompute.pdf','ir':'11_IRandRAG.pdf',
 'mt':'12_MachineTranslation.pdf','rnn':'13_RNNsAndLSTMs.pdf','tag':'17_SequenceLabelingforPOSAndNER.pdf',
 'parse':'18_ConstituencyGrammarsAndConstituencyParsing.pdf','ie':'20_InformationExtractionRelationsEventsAndTime.pdf',
 'srl':'21_SemanticRoleLabeling.pptx','sentiment':'22_LexiconsForSentimentAffectAndConnotation.pdf',
 'coref':'23_CoreferenceResolution.pdf','discourse':'24_DiscourseCoherence.pdf',
 'mock':'mockExamWS21_with_solution.pdf',
}
papers={
 'kim':('Kim (2014), Section 2','https://aclanthology.org/D14-1181.pdf'),
 'glove':('GloVe (2014), Section 3','https://aclanthology.org/D14-1162.pdf'),
 'vaswani':('Attention Is All You Need, Sections 3.2 / 3.5','https://arxiv.org/html/1706.03762v7'),
}
special={
 'mock21-3-2':('MEMMs are unidirectional recursive computations which only function from left to right.','MEMM 是只按从左到右方向运行的单向递归计算。'),
 'mock21-7-3':('estimate precision by sampling the output and labelling the sample','对输出抽样并标注样本，估计 precision。'),
 'mock21-9-5':('negatively proportional to their overall occurrence in the corpus such as raising word counts to a fractional power','与在语料中的总出现次数呈负比例，例如把词频取分数次幂。'),
}
evidence_requests=set()
for q in data['questions']:
 u=dict(updates[q['id']]);refs=u.pop('evidenceRefs',[]);q.update(u)
 q.pop('answerHtml',None)
 if q['id']=='ws21-3-2':q['answerKind']='derived'
 if q['id']=='practice-P04':q['question']='What test-time prompting approaches are explicitly covered in the supplied slides, and what are their limits?'
 if q['id']=='ss20-1-2':q['evidenceRefs']=[('intro',[7,11,19,36])];refs=q.pop('evidenceRefs')
 if q['id']=='ss20-7-2':refs=[('rnn',[44,45,47])]
 if q['id']=='ss20-6-2':refs=[('transformer',[21])]
 q['sourceEvidence']=[]
 for alias,pages in refs:
  if alias in papers:
   title,url=papers[alias];q['sourceEvidence'].append({'kind':'primary-paper','title':title,'url':url,'pages':[]})
   continue
  name=files[alias]
  e={'kind':'provided-solution' if alias=='mock' else 'provided-slides','file':name,'pages':pages,'links':[]}
  if alias=='mock':
   e['title']='Solution Suggestions · '+', '.join('p.'+str(p) for p in pages)
   e['links']=[{'label':'p.'+str(p),'url':'sources/mock21-solutions.pdf#page='+str(p)} for p in pages]
  elif name.endswith('.pdf'):
   e['title']=name
   for p in pages:
    filename=Path(name).stem+f'-p{p}.webp'
    e['links'].append({'label':'p.'+str(p),'url':'sources/evidence/'+filename})
    evidence_requests.add((name,p,filename))
  else:
   e['title']=name+' · slides '+', '.join(map(str,pages))
  q['sourceEvidence'].append(e)
 if q['id'] in special:q['sourceExcerptEn'],q['sourceExcerptZh']=special[q['id']]
 q['sourceReview']={'date':'2026-11-13','status':'unresolved' if q['answerKind']=='review' else 'checked-against-listed-materials','provenance':'provided-solution-paraphrase' if q['kind']=='mock' else 'reference-derivation' if q['kind']=='exam' else 'lecture-derived-practice'}
 assert q['questionZh'] and q['answerEn'] and q['answer'] and q['sourceEvidence'],q['id']

dest=ROOT/'dist/sources/evidence';dest.mkdir(parents=True,exist_ok=True)
import pypdfium2 as pdfium
by_file={}
for name,page,filename in sorted(evidence_requests):by_file.setdefault(name,[]).append((page,filename))
for name,pages in by_file.items():
 document_path=Path(os.environ.get('NLP_LECTURES_DIR', ROOT/'private-materials'))/name
 if not document_path.exists():
  if all((dest/f).exists() for _,f in pages):continue
  raise FileNotFoundError(document_path)
 doc=pdfium.PdfDocument(str(document_path))
 for page,filename in pages:
  assert 1<=page<=len(doc),(name,page)
  if not (dest/filename).exists():doc[page-1].render(scale=1.5).to_pil().save(dest/filename,quality=88)

data['contentRevision']='2026-11-13-bilingual-source-review'
data['languages']=['en','zh-CN']
data['reviewSummary']={'questions':len(data['questions']),'bilingual':len(updates),'sourcePageImages':len(evidence_requests),'unresolvedIds':[q['id'] for q in data['questions'] if q['answerKind']=='review']}
DATA.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'bilingual/source-review.json').write_text(json.dumps({'revision':data['contentRevision'],'summary':data['reviewSummary'],'questions':[{k:q[k] for k in ['id','sourceReview','sourceEvidence']} for q in data['questions']]},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(data['reviewSummary'],ensure_ascii=False))
