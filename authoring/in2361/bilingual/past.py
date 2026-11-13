UPDATES={}
def put(id,question,answer,zh=None,refs=None,note=None):
 d={'questionZh':question,'answerEn':answer}
 if zh is not None:d['answer']=zh
 if refs:d['evidenceRefs']=refs
 if note:d['auditNoteEn'],d['auditNoteZh']=note
 UPDATES[id]=d

put('ss20-1-2','对于“现代神经语言模型体现了真正的人工智能”这一主张，严格给出两条支持和两条反对论据。',
'''Possible supporting arguments: (1) pretrained representations can transfer to different NLP tasks; (2) models can produce useful, context-sensitive language behavior. Possible objections: (1) fluent token prediction does not establish grounded understanding; (2) hallucinations, bias and failures of reasoning remain. This is an open discussion question: these are two example arguments on each side, not a supplied marking scheme.''',
zh='可用的支持论据：① 预训练表示可以迁移到多种 NLP 任务；② 模型能产生有用且依赖语境的语言行为。反对论据：① 流畅的 token 预测本身不能证明具有真实世界的理解；② 幻觉、偏见与推理失败仍存在。这是开放讨论题，以上严格给出两条支持和两条反对，只是参考论证，不是所附官方评分答案。',refs=[('intro',[7,11,19,35,36])])
put('ss20-1-3','写出五个词联合概率的三元语言模型近似。',r'''Without boundary markers:
\[P(w_1,\ldots,w_5)\approx P(w_1)P(w_2\mid w_1)\prod_{i=3}^{5}P(w_i\mid w_{i-2},w_{i-1}).\]
Each later word is assumed conditionally independent of the earlier history given the preceding two words. The first two factors must be retained under this convention.''',refs=[('ngram',[4,5,6])])
put('ss20-2-1','为什么在多项式朴素贝叶斯的 MAP 估计中使用 Dirichlet 先验？',
'''The Dirichlet distribution is conjugate to the multinomial likelihood. Updating it with observed word counts gives another Dirichlet distribution, so posterior estimation is tractable. In the MAP formula provided in the question, the prior contributes αᵥ−1 pseudo-counts. This is different from the αᵥ term in the posterior mean.''',refs=[('classify',[17,18])])
put('ss20-2-2','题目给定的 MAP 公式中，αᵥ 应取多少才能得到 Laplace 加一平滑？',r'''Set every \(\alpha_v=2\). Substituting into the supplied MAP expression adds 1 to each count and adds \(|V|\) to the denominator:
\[\theta_{vc}=\frac{N_{vc}+1}{N_c+|V|}.\]
The lecture explicitly uses the all-2 Dirichlet prior here. Answering α=1 would confuse this MAP formula with the posterior mean.''',refs=[('classify',[18,19])])
put('ss20-2-3','为什么朴素贝叶斯中的条件独立假设被称为“朴素”？',
'''Given the class, the model assumes that input features are conditionally independent. Real words and linguistic features are often correlated, so this simplifies away important dependencies. The assumption is conditional on the class; it is not unconditional independence between words.''',refs=[('classify',[12,14])])
put('ss20-2-4','参数 π꜀ 表示什么？',
'''π꜀=P(y=c) is the prior probability of class c. Its maximum-likelihood estimate is the proportion of training documents belonging to c. It is distinct from the class-conditional word probabilities θᵥ꜀.''',refs=[('classify',[14,15,16])])
put('ss20-2-5','使用现代 NLP 方法，如何完成商品评论的情感分类？',
'''One suitable approach is to fine-tune a pretrained contextual encoder such as BERT with a sentiment-classification head on labeled reviews. Tokenize the reviews, train on a training split, tune on validation data and evaluate on held-out data. Cross-entropy is a natural classification objective. This is a proposed solution based on the supplied model and training materials, not a unique official answer.''',
zh='一种可行方案是在带情感标签的评论上微调预训练上下文编码器（如 BERT），添加分类头。对评论分词，在训练集上学习、验证集上调参，最后在独立测试集上评估；分类可使用交叉熵损失。这是根据所附模型与训练材料整理的可行方案，并不是唯一官方答案。',refs=[('masked',[23,24]),('classify',[7,20,21,22])])
put('ss20-3-1','扩展 CKY，使它无需预先消除 A→B 一元产生式也能解析。',
'''After adding lexical or binary-rule results to a chart cell, compute its unary closure: whenever B is in the cell and A→B is a grammar rule, add A. Repeat until no new symbol is added. Record backpointers for parsing, and use a visited set to avoid looping on unary cycles. Applying unary rules only once is insufficient for longer chains.''',refs=[('parse',[35,37,38,40])])
put('ss20-3-2','只对名词短语 NP 和动词短语 VP 做 BIO 分块，需要哪些标签？',
'''The five labels are B-NP, I-NP, B-VP, I-VP and O. B starts a new chunk, I continues a chunk of the same type, and O marks a token outside the selected chunk types. This is the lecture's 2n+1 construction with n=2.''',refs=[('parse',[44,45])])
put('ss20-4-1','Kim（2014）的句子分类 CNN 为什么使用两个词向量输入通道？',
'''The multichannel model has two copies of the pretrained word vectors: one stays static and the other is fine-tuned by backpropagation. It therefore combines a stable pretrained representation with task-specific adaptation. Each filter is applied to both channels and the resulting contributions are added, as described in the original paper.''',
zh='多通道模型使用两份预训练词向量：一份保持固定，另一份通过反向传播微调，从而同时保留稳定的预训练表示和任务特定适应。原论文还说明，同一个滤波器应用于两个通道，并将对应贡献相加。当前所附神经网络课件没有完整讲解这一特定模型，因此此题依据原题点名的 Kim（2014）原论文。',refs=[('kim',[])])
put('ss20-4-2','句子 CNN 的卷积层为什么需要多个特征图？',
'''Different filters extract different local patterns; varying the window width also captures patterns spanning different numbers of words. Pooling produces a feature from each filter, and the combined features are passed to the classifier. This follows the architecture in Section 2 of Kim (2014).''',refs=[('kim',[])])
put('ss20-5-1','下载预训练 GloVe 与下载预训练 BERT，在获得的数据和使用方式上有什么区别？',
'''A static embedding resource such as GloVe provides a word-to-vector lookup. BERT provides a pretrained network (together with its tokenizer/configuration); contextual token vectors are computed by running a particular input through that network. Thus the representation of a word can change with its surrounding sentence.''',refs=[('masked',[3,5,8]),('embed',[11,23])])
put('ss20-5-2','Tag-LM 为什么把预训练递归语言模型的隐藏表示用于序列标注？',
'''The pretrained language model's hidden states encode context and can supply additional features for sequence tagging. They complement static word representations and help distinguish uses of a word in different contexts. The supplied Tag-LM slides combine forward and backward LSTM language-model representations with a sequence-tagging network.''',refs=[('masked',[33,34,36])])
put('ss20-5-3','为什么句子级任务需要双向上下文？',
'''A word's interpretation may depend on both preceding and following words. Using both directions helps disambiguate its meaning or label; left context alone may not contain the information needed by a classification or tagging task.''',refs=[('masked',[5,6])])
put('ss20-5-4','普通 RNN 语言模型为什么存在双向性问题？BERT 如何处理？',
'''An ordinary autoregressive objective predicts a token from earlier tokens. Allowing an unrestricted bidirectional representation to expose the token being predicted would leak the target. BERT instead trains a bidirectional encoder to recover selected original tokens from corrupted inputs using masked language modeling; it is not ordinary left-to-right next-token training.''',refs=[('masked',[5,10,12])])
put('ss20-5-5','如果仍采用 RNN 语言模型，如何获得双向上下文表示？',
'''Train a left-to-right LM and a right-to-left LM separately, then combine their hidden representations for the downstream task. Each LM preserves its own directional prediction objective. The Tag-LM/ELMo slides use forward and backward LSTMs rather than a single next-token objective with unrestricted access to both sides.''',refs=[('masked',[34,37])])
put('ss20-6-1','高维情况下，点积注意力可能出现什么问题？Transformer 如何缓解？',r'''Large dot products can push softmax into a saturated regime with small gradients. With the paper's unit-variance assumptions, the dot-product variance grows with the key dimension, motivating division by \(\sqrt{d_k}\):
\[\operatorname{Attention}(Q,K,V)=\operatorname{softmax}(QK^T/\sqrt{d_k})V.\]''',refs=[('transformer',[11]),('vaswani',[])])
put('ss20-6-2','批次输入宽度固定时，如何处理比该宽度短的 Transformer 输入？',
'''Pad shorter sequences to the batch width and mask padded positions so they do not contribute as ordinary content. Ignore padding in the relevant loss or aggregation as well. The question's fixed width should be read as a batching/input-limit convention, not as a claim that attention mathematically requires every sentence to have the same length.''',refs=[('transformer',[21]),('mt',[18,19])])
put('ss20-6-3','Transformer 中使用残差连接的动机是什么？',
'''A residual connection adds the sublayer input to its output. It provides a direct path for information and gradients and makes it easier to optimize stacked blocks by learning a residual transformation. It is used together with normalization; it is not a guarantee that all optimization difficulties disappear.''',refs=[('transformer',[15,16,17])])
put('ss20-6-4','原始 Transformer 为什么使用正弦和余弦位置编码？',
'''Different sinusoidal frequencies encode positions without a learned position table. For any fixed offset, the shifted encoding can be represented by a linear transformation of each sine/cosine pair, which motivated learning relative-position relationships. The original paper also reports learned embeddings as an alternative. The current supplied slides emphasize learned absolute/relative positions, so the sinusoidal rationale is traced to the paper named by the exam.''',
zh='不同频率的正弦／余弦无需学习位置查找表即可编码位置；对固定偏移，移动后的位置编码可表示为每对正弦／余弦分量的线性变换，这为学习相对位置关系提供动机。原论文也比较了可学习位置表示。当前所附课件主要展示可学习的绝对／相对位置，所以本题“为什么使用三角函数”的依据是试题点名的 Transformer 原论文，不能把现有课件当作该理由的原文。',refs=[('vaswani',[]),('transformer',[25,26])])
put('ss20-6-5','Transformer 如何使多个注意力头以不同方式关注输入？',
'''Each head has its own learned Q, K and V projection matrices, allowing it to represent different relations and subspaces. The outputs are concatenated and projected back. The standard architecture gives heads the capacity to specialize; it does not impose a hard constraint guaranteeing that every head will behave differently.''',refs=[('transformer',[10,12,13])])
put('ss20-7-1','只知道 Alice 的公开文章时，Bob 如何判断匿名文章是否可能由她撰写？',
'''Treat this as authorship verification rather than ordinary supervised multiclass attribution. Build a representation of Alice's known writing using stylistic features or document embeddings, then compare the anonymous post with that reference distribution. With no examples from other authors, a one-class or similarity-based method is a possible proposal. Similarity is evidence, not proof of identity. No dedicated solution to this open application question was supplied.''',refs=[('classify',[5,6]),('embed',[18])],note=('The supplied materials support text features and document similarity, but do not supply an authorship-verification marking scheme. This is an application proposal.','资料支持文本特征与文档相似度，但没有提供作者验证的评分答案；这里是应用方案。'))
put('ss20-7-2','如何把文章改写成含义相近、但较少暴露作者风格的文本？',
'''Frame the task as paraphrasing or style transfer: generate alternative wording while preserving the message, then assess semantic preservation and the amount of stylistic change. An encoder–decoder model is one possible implementation. Rewriting can alter facts and does not guarantee anonymity. This is a proposed use of the supplied generation machinery, not a supplied task-specific reference solution.''',refs=[('rnn',[44,45,47]),('mt',[4,5])],note=('This open application is not directly answered by the provided slides; the encoder–decoder material is background, not an official solution.','所附课件没有直接回答这道开放应用题；编码器—解码器内容是背景依据，不是官方解答。'))

put('ws21-1-2','解释正则表达式 o+u?h|a+h+|hm+ 的三个分支，并说明一种可能用途。',
'''The alternatives match: (1) one or more o's, an optional u, then h; (2) one or more a's followed by one or more h's; (3) h followed by one or more m's. Examples are oh, oouh, aahh and hmmm. A plausible purpose is recognizing interjections or hesitation sounds. Without anchors, a match may also be a substring of a longer string.''',refs=[('tokens',[9,10,11])])
put('ws21-1-3','对 Heaps 定律 |V|=kN^β，解释两组参数 β=0.99,k=1 与 β=0.71,k=80 可能对应何种文档。',
'''β≈1 means almost linear vocabulary growth: the sequence has little repetition and could be unusually diverse, for example a list of distinct names or identifiers. β≈0.7 is consistent with the sublinear growth discussed for ordinary language. These are plausible interpretations, not uniquely identifiable document types. The scale k also depends on corpus length and tokenization.''',
zh='β 接近 1 表示词汇规模几乎线性增长，重复很少，可能是高度多样的词序列，例如不同姓名或标识符列表。β 约 0.7 与课件讨论的自然语言次线性增长相符。这些只是合理解释，拟合参数不能唯一确定文档类型；k 还受语料长度和分词方式影响。',refs=[('tokens',[16,17])])
put('ws21-1-4','对 Java JDK 类库源码拟合 Heaps 定律时，给出 β 的合理猜测和理由。',
'''A numerical reference answer is not established by the supplied materials. Repeated keywords and syntax can reduce vocabulary growth, whereas user-defined class/method identifiers and retained comments introduce new types. Therefore the estimate depends on tokenization and corpus scope. State those assumptions and justify the expected growth; do not treat an unsupported numerical value as a verified answer.''',
zh='所附资料没有确立此题的数值标准答案。重复的关键字和语法符号会减缓词汇增长，类／方法标识符以及保留的注释又会引入新词类型，因此 β 依赖分词与语料范围。应先说明假设，再论证预期增长；这里不把缺乏依据的具体数值当成已核实答案。',refs=[('tokens',[16,17])])
put('ws21-1-5','无句首／句尾标记时，四词序列的三元近似具体引入什么条件独立性？',r'''\[P(w_1,w_2,w_3,w_4)\approx P(w_1)P(w_2\mid w_1)P(w_3\mid w_1,w_2)P(w_4\mid w_2,w_3).\]
The nontrivial truncation is \(w_4\perp w_1\mid(w_2,w_3)\). The initial factors retain all available history.''',refs=[('ngram',[4,5,6])])
put('ws21-2-1','在 Church–Gale 的两半语料实验中，第二半“恰好出现 n 次的 bigram 数量”这一列预计是什么样？',
'''For equally sized halves sampled from the same underlying source, their count-of-counts distributions should be approximately similar, not exactly equal. This is different from tracking the particular bigrams that occurred n times in the first half and measuring their mean count in the second half. The latter comparison motivates discounting; it is not the second half's own count-of-counts column.''',refs=[('ngram',[19])])
put('ws21-2-2','生成式与判别式分类器分别怎样分解联合概率 P(x,y|θ)？',r'''A generative classifier models \(P(x,y\mid\theta)=P(y\mid\theta)P(x\mid y,\theta)\). A discriminative classifier directly models \(P(y\mid x,\theta)\); a joint factorization may be written \(P(x)P(y\mid x,\theta)\), but modeling P(x) is not its classification objective.''',refs=[('classify',[3,14])])
put('ws21-2-3','只给出并解释一项逻辑回归相对朴素贝叶斯的优势。',
'''Logistic regression does not require the Naïve Bayes conditional-independence assumption for the input features. It can learn discriminative weights for correlated features instead of multiplying their class-conditional evidence as if independent. This is the advantage explicitly contrasted on the supplied classifier-comparison slide.''',refs=[('classify',[12])])
put('ws21-2-4','为什么不能直接把 skip-gram 的点积替换为 t/Σt 与 c/Σc 之间的 Jensen–Shannon 散度？只给一条反对理由。',
'''The normalized vectors in the proposal are not guaranteed to be probability distributions: learned embedding components may be negative, and their sum may even be zero. Jensen–Shannon divergence requires valid probability distributions. Merely dividing arbitrary embedding coordinates by their sum does not satisfy that requirement.''',refs=[('embed',[16,25,27])])
put('ws21-3-1','补全 “the girl kisses Daniel” 的 CCG 推导中三个缺失类别。',r'''The missing categories are (*1)=NP/N, (*2)=(S\NP)/NP, and (*3)=S/(S\NP). First “the girl” becomes NP by forward application. Type-raise it to S/(S\NP), compose with “kisses” to obtain S/NP, and apply to “Daniel” to obtain S.''',refs=[('parse',[26,27,28])])
put('ws21-3-2','根据原图的 A* CCG agenda，用 aᵢ、bᵢ、cᵢ 写出 w、x、y、z。',r'''Using the supplied lecture's inside-cost plus best-outside-supertag heuristic:
\[x=a_1+b_1+c_1,\quad z=a_1+b_2+c_1,\quad y=a_2+b_1+c_1,\quad w=a_1+b_1+c_3.\]
The goal requires Bayern:NP (cost a₂), while the “Bayern beats:N” candidate uses beats:N (b₂). The alternative Schalke category is scored with c₃. Its printed [0,1] span label is inconsistent with its position; the corresponding lecture example has the same labeling issue, but its displayed cost confirms this interpretation.''',
zh=r'''依照所附课件“内部代价＋区间外最优 supertag 代价”的规则：
\[x=a_1+b_1+c_1,\quad z=a_1+b_2+c_1,\quad y=a_2+b_1+c_1,\quad w=a_1+b_1+c_3.\]
最终句子需要 Bayern 取 NP，代价为 a₂；“Bayern beats:N” 候选需要 beats 取 N，代价为 b₂；Schalke 的另一个词法类别使用 c₃。原图把 Schalke 的跨度印成 [0,1]，与词序不符；所附课件的对应例图也有这一标签问题，但图中列出的代价支持上述解释。这是对原课件示例的符号替换推导，不冒称原卷官方评分答案。''',refs=[('parse',[57,59,60,61])])
put('ws21-3-3','为什么要细分动词短语的次范畴框架，尤其在训练统计句法分析器时？',
'''Verbs differ in the complements they license: intransitive, transitive, ditransitive and other frames. Distinguishing those frames lets a grammar/parser represent verb-specific structural preferences rather than licensing every complement pattern for every verb. The lecture explicitly notes that not every verb supports all subcategorization frames.''',refs=[('parse',[16,17])])
put('ws21-4-1','对于 k=guitar、engine、wheel、saddle，排列 P(k|car)/P(k|bike) 的合理大小顺序。',
'''The intended qualitative analogy is: saddle is much more associated with bike, engine with car, while guitar is not diagnostic of either and wheel is associated with both. Thus a₄ < a₁≈a₃ < a₂ is a reasonable semantic ordering. No corpus counts are provided, so the middle terms should not be asserted as exactly equal. This applies the probability-ratio motivation in the original GloVe paper.''',refs=[('glove',[])])
put('ws21-4-2','为什么把向量内积与共现概率的对数关联起来具有直觉意义？',
'''Taking logarithms compresses the large range of co-occurrence probabilities and turns ratios into differences, which can be represented by linear relations between vectors. More strongly associated word pairs can then have larger inner products. The expression in the exam is a simplified motivation: the full GloVe model uses log co-occurrence counts, biases and a weighted least-squares objective.''',refs=[('glove',[])])
put('ws21-4-3','不用上下文嵌入时，静态词向量怎样表示一词多义？为什么不实用？',
'''One could assign a separate vector to each word sense. However, occurrences must then be assigned to senses, requiring a sense inventory and word-sense disambiguation. Building and maintaining that distinction is difficult, and mistakes propagate. An ordinary single static vector instead conflates multiple senses; contextual encoders address the representation problem by conditioning on the occurrence's context.''',refs=[('embed',[3,4]),('masked',[3,5])])
put('ws21-4-4','为什么 LSTM 门使用逐元素 Hadamard 乘积，而不是内积或外积？',
'''A gate controls each state coordinate separately, so elementwise multiplication retains the vector shape and scales each memory component independently. An inner product produces a scalar; an outer product produces a matrix. Neither performs the coordinate-wise gating shown in the supplied LSTM update.''',refs=[('rnn',[40,41])])
put('ws21-5-1','混合词级／字符级神经机器翻译方法，各给一条支持与反对论据。',
'''Pro: a character component can handle rare or unseen word forms and morphological variation, while word-level units keep common words compact. Con: character processing produces longer sequences and a hybrid model adds computation/architectural complexity. Give one on each side as requested. The supplied vocabulary slides support the trade-off, but no task-specific official solution is provided.''',refs=[('tokens',[20,21,24]),('mt',[15,16,17,18])])
put('ws21-5-2','词表变得很大时，标准词级 softmax 有什么问题？',
'''The output layer must score and normalize over a large vocabulary, increasing parameters and per-step computation. A fixed word vocabulary also cannot directly emit a word outside it. Subwords, output approximations and pointer/copy mechanisms address different parts of this problem.''',refs=[('nn',[16,17]),('mock',[33])])
put('ws21-5-3','指针网络与基本注意力机制有什么共同点？',
'''Both score input/context positions and normalize those scores into a position distribution. Ordinary attention commonly uses it to form a weighted representation; a pointer model uses that distribution to choose or copy an input position as output. This common attention-based selection is shown in the supplied pointer-sentinel solution.''',refs=[('mock',[33]),('rnn',[49,50,51])])
put('ws21-5-4','多头注意力与 Kim（2014）的多滤波器 CNN，有何一项相似和一项不同？',
'''Similarity: several heads/filters extract complementary features that are combined downstream. Difference: attention weights depend on pairwise relations in the current input and may connect distant positions; a convolutional filter applies learned shared weights to a local window. This is a comparison of the two supplied/named architectures, not a statement that they perform the same operation.''',refs=[('transformer',[10,12,13]),('kim',[])])
put('ws21-6-1','为什么 BERT 不能直接当作标准自回归生成式语言模型？',
'''BERT's masked-LM objective recovers selected corrupted tokens using bidirectional context. It does not directly define the left-to-right next-token conditionals used by an ordinary autoregressive generator. Generation must not rely on future tokens that have not yet been produced, so a different objective or generation procedure is needed.''',refs=[('masked',[5,7,10,12])])
put('ws21-6-2','把 BERT 用作编码器、GPT 用作解码器，对 seq2seq 为什么可能有用？',
'''A bidirectional encoder can represent the complete source text; a causal decoder generates the target from its existing prefix and attends to the source through cross-attention. This combines source understanding and autoregressive generation. Newly introduced cross-attention and any dimensional adapters must be trained; joining two pretrained checkpoints alone is not sufficient.''',refs=[('masked',[5,7]),('mt',[22,23,26,28])])
put('ws21-6-3','如何训练并使用上述 BERT—GPT 系统做生成式摘要？',
'''Train on source-document/summary pairs. Encode the document and train the decoder to predict each next gold summary token from its prefix, using teacher forcing and token-level cross-entropy. At inference, provide the document and a start token, then generate autoregressively until termination. This adapts the source–target training procedure in the supplied encoder–decoder slides to summarization; it is not an official model recipe.''',refs=[('rnn',[45,47,48]),('mt',[22,23])])
