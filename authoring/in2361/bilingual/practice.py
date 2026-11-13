UPDATES={}
def put(number,question,answer,zh=None,refs=None,note=None):
 d={'questionZh':question,'answerEn':answer}
 if zh is not None:d['answer']=zh
 if refs:d['evidenceRefs']=refs
 if note:d['auditNoteEn'],d['auditNoteZh']=note
 UPDATES['practice-'+number]=d

put('P01','预训练与有监督指令微调 SFT 有何区别？',
'''Pretraining learns a language-model objective from large-scale text. Supervised instruction tuning uses instruction–response examples to adapt that model toward task-following behavior. The supplied post-training slides contrast pretraining with instruction-tuning data and application-specific supervision.''',refs=[('post',[4,5,6]),('intro',[21,22])])
put('P02','比较奖励模型＋PPO 对齐与 DPO。',
'''The supplied RL-PPO route learns a reward model from preference data and then optimizes a language-model policy while controlling deviation from a reference model. DPO uses a direct preference objective on chosen/rejected response pairs rather than a separate explicit reward-model/PPO optimization loop. Both still depend on the quality of the preference data.''',refs=[('post',[17,18,19,20,21])])
put('P03','对齐训练为什么要约束模型接近参考策略？',
'''Optimizing only the preference reward can push the policy too far from the pretrained/reference model. A closeness constraint, commonly expressed through KL regularization, balances reward improvement against policy drift and loss of pretrained behavior. The supplied slide motivates this by catastrophic forgetting and staying close to the pretrained LM.''',refs=[('post',[20])])
put('P04','课件给出的 test-time compute／推理时方法有哪些？有什么局限？',
'''The supplied slides explicitly introduce few-shot prompting and chain-of-thought prompting as test-time approaches: use demonstrations or intermediate reasoning in the prompt/output to guide the answer. Their effectiveness depends on the task and model; more generated reasoning is not itself evidence of correctness. The provided slides do not establish that any particular verification/search scheme will always improve results.''',
zh='所附课件明确列出 few-shot prompting 与 chain-of-thought prompting：通过示例或中间推理引导回答。效果依赖任务和模型，更长的推理本身并不是答案正确的证据。原课件没有确立任何特定验证器／搜索方法都必然提高结果的结论。',refs=[('post',[24,25,26])])
put('P05','描述一个基本的检索增强生成 RAG 流程。',
'''Retrieve relevant passages for a question and condition the generator on those passages together with the question. An implementation typically indexes documents first, optionally reranks retrieved results, and then constructs the generation context. The supplied slides also discuss multi-hop retrieval and limits such as retrieval scope and data quality.''',refs=[('ir',[15,16,17,18])])
put('P06','比较 BM25 词项检索与稠密向量检索。',
'''BM25 uses lexical matches with term-frequency saturation and document-length normalization. Dense retrieval compares learned query/document representations and can mitigate vocabulary mismatch. The supplied slides describe both lexical matching and dense-vector alternatives. Their strengths are complementary; neither is established as universally better.''',refs=[('ir',[7,12,13,14])])
put('P07','定义 Precision@k 与 Recall@k。',r'''\[P@k=\frac{\#\text{ relevant results in top }k}{k},\qquad R@k=\frac{\#\text{ relevant results in top }k}{\#\text{ all relevant results}}.\]
Recall requires a reference or justified estimate for the total number of relevant items. Keep the collection and the cutoff k fixed when comparing systems.''',refs=[('ir',[9])])
put('P08','如何分开评估 RAG 的检索环节和生成环节？',
'''Evaluate retrieval with relevance judgments and ranked-retrieval measures such as precision/recall at a cutoff. Separately evaluate whether the generated answer correctly uses the retrieved evidence and preserves its content. Distinguish failing to retrieve the needed passage from failing to use an available passage. This is an evaluation design derived from the supplied IR metrics and RAG limitations, not a past-exam solution.''',
zh='检索环节用相关性标注与按排名计算的 precision／recall 等指标评估；生成环节另行检查是否正确使用已检索证据、是否忠实于其内容。区分“没有检到需要的片段”和“片段已存在但没有正确使用”。这是根据所附 IR 指标和 RAG 局限整理的评估设计，不是历年试卷解答。',refs=[('ir',[9,17,18])])
put('P09','语义角色标注与句法依存分析有什么区别？',
'''Dependency parsing describes syntactic relations, whereas semantic role labeling assigns roles to a predicate's participants, such as Agent and Theme. Those roles can generalize across different surface realizations, including changes in grammatical subject/object positions. The supplied SRL slides explicitly connect semantic properties with syntactic realization and discuss diathesis alternations.''',refs=[('srl',[3,4,6])])
put('P10','为什么共指消解不能只匹配相同字符串？',
'''Coreference resolution finds mentions referring to the same real-world entity. A name, a description and a pronoun may corefer despite different wording; identical names can also refer to different entities. Context, agreement and semantic compatibility are needed to decide which mentions belong to the same cluster.''',refs=[('coref',[3,4,5,15])])
put('P11','词汇重复与篇章连贯有什么区别？',
'''Lexical overlap is only one possible cue. The supplied discourse slides also discuss coherence relations such as reason/elaboration and continuity of salient entities. Repetition alone does not establish a coherent discourse, and sentences can be connected by meaningful discourse relations without repeating the same words.''',refs=[('discourse',[3,5,6])])
put('P12','对比 masked language modeling 与 causal language modeling。',
'''A masked LM recovers selected original tokens from corrupted input using bidirectional context. A causal LM predicts the next token from its preceding context, supporting left-to-right autoregressive generation. The relevant distinction is the training objective and attention visibility, not a universal restriction of all downstream applications.''',refs=[('masked',[5,7,10,12]),('llm',[3,4])])
put('P13','为什么训练／测试数据污染会使大模型评测产生误导？',
'''A benchmark must test data independent of training. If benchmark questions or answers entered pretraining, a high score may reflect exposure or memorization rather than generalization to new cases. The lecture explicitly warns about pretraining contamination and emphasizes knowing the training data. Data separation and deduplication are appropriate evaluation checks.''',refs=[('intro',[36])])
put('P14','为什么较高的 n-gram 重叠分数不足以证明翻译质量高？',
'''Surface overlap does not fully measure meaning: correct paraphrases can use different words, while an output with many matching words can still mishandle a crucial fact or negation. The supplied slides list limitations of overlap metrics, including lack of synonym awareness. Use additional semantic/adequacy assessment and suitable human judgment when needed.''',refs=[('mt',[38,40,42])])
