UPDATES={}
def put(id,question,answer,zh=None,refs=None,note=None):
 d={'questionZh':question,'answerEn':answer}
 if zh is not None:d['answer']=zh
 if refs:d['evidenceRefs']=refs
 if note:d['auditNoteEn'],d['auditNoteZh']=note
 UPDATES[id]=d

put('mock21-1-1','写出六个词联合概率的三元语言模型近似。',r'''With no boundary markers:
\[P(w_1,\ldots,w_6)\approx P(w_1)P(w_2\mid w_1)\prod_{i=3}^{6}P(w_i\mid w_{i-2},w_{i-1}).\]
If start symbols are used instead, state that convention and condition the initial positions accordingly.''',refs=[('mock',[3]),('ngram',[5,6])])
put('mock21-1-2','用三元近似代替完整历史条件概率，解决了什么问题？',
'''The number of possible full histories grows combinatorially, leaving very few observations for many sequences. Restricting the history reduces sparse counts and makes probability estimates more reliable. This is the reason given in the supplied Solution Suggestions.''',refs=[('mock',[3])])
put('mock21-1-3','三元近似之后还存在什么问题？给出一种解决方法。',
'''Unseen trigrams still receive zero probability under unsmoothed maximum likelihood, making a sentence containing one have probability zero. Smoothing allocates some probability mass to unseen events. The supplied solution mentions Laplace smoothing and also accepts backoff, interpolation or absolute discounting.''',refs=[('mock',[3])])
put('mock21-2-1','对于 old:7、older:3、finest:9、lowest:4，给出 BPE 初始化及频数。',
'''Split each word into characters and add one end-of-word symbol per word occurrence. Weighted symbol counts are: o=14, l=14, d=10, e=16, r=3, f=9, i=9, n=9, s=13, t=13, w=4, and </w>=23. The word frequencies, not merely the four distinct word types, determine the counts.''',refs=[('mock',[5])])
put('mock21-2-2','执行五轮 BPE 合并；选中的相邻对频数低于 2 时停止。',
'''The supplied solution uses these five merges: e+s→es (13), es+t→est (13), est+</w>→est</w> (13), o+l→ol (10), and ol+d→old (10). None of these counts falls below 2. Recompute adjacent-pair counts after each merge; tied highest-frequency pairs require a tie-breaking rule, so different valid intermediate segmentations are possible.''',refs=[('mock',[6])])
put('mock21-3-1','为三元 HMM 的词性转移概率加入加权低阶估计，并说明如何估计各概率。',r'''Use the transition estimate
\[\lambda_3\hat P(t_i\mid t_{i-2},t_{i-1})+\lambda_2\hat P(t_i\mid t_{i-1})+\lambda_1\hat P(t_i),\]
with nonnegative weights summing to 1. Estimate each component by its n-gram count divided by its context count. For example, the trigram term is C(tᵢ₋₂,tᵢ₋₁,tᵢ)/C(tᵢ₋₂,tᵢ₋₁). Retain the emission and termination factors in the HMM objective.''',refs=[('mock',[8]),('ngram',[18])],note=('The sheet calls this weighted backoff; its displayed formula is a linear interpolation of all three orders.','原题称为 weighted backoff，但所附公式实际是三个阶数的线性插值。'))
put('mock21-3-2','给出 MEMM 词性标注的一项主要缺点，并说明替代架构。',
'''The supplied solution emphasizes left-to-right recursive labeling: a later word can change the interpretation of an earlier label, and it proposes a CRF or a multi-pass MEMM. A standard additional distinction is that MEMMs normalize locally, while a linear-chain CRF normalizes over label sequences, addressing label bias.''',
zh='所附解答重点强调从左到右的递归标注：后文可能改变前面标签的解释，因此提出 CRF 或多遍 MEMM。另一个标准结构区别是 MEMM 局部归一化，而线性链 CRF 对标签序列全局归一化，可缓解 label bias。',refs=[('mock',[9]),('tag',[23,24,25])],note=('The original statement should not be read as saying every MEMM is forbidden from using future observed words: that depends on its features. Directional label dependencies and global normalization are different issues.','不能把原解读成“所有 MEMM 都禁止使用未来观测词”；这取决于特征设计。标签依赖方向与是否全局归一化是不同问题。'))
put('mock21-4','补全给定 CKY 表的 [0,5] 单元，列出产生式和子单元位置。',
'''There are three S derivations, three VP derivations and one X2 derivation:
S₁, VP, X2 ← Verb[0,1] NP[1,5];
S₂, VP ← VP[0,3] PP[3,5];
S₃, VP ← X2[0,3] PP[3,5].
These are the seven backpointer alternatives shown by the supplied grammar and solution. S₁/S₂/S₃ distinguish derivations of S, not different grammar symbols. Likewise VP has three alternatives.''',
zh='共得到 S 的三条推导、VP 的三条推导及 X2 的一条推导：\nS₁、VP、X2 ← Verb[0,1] NP[1,5]；\nS₂、VP ← VP[0,3] PP[3,5]；\nS₃、VP ← X2[0,3] PP[3,5]。\n这七条回溯选择可在原题文法与配套解答图中逐项核对。S₁／S₂／S₃ 区分 S 的推导方式，不是三个不同的文法符号；VP 同样应保留三条回溯。',refs=[('mock',[10,11])])
put('mock21-5-1','只用函数应用完成 “You prefer that cake” 的 CCG 推导。',r'''Combine that:NP/N with cake:N by forward application to obtain NP. Combine prefer:(S\NP)/NP with that NP to obtain S\NP. Finally combine You:NP with S\NP by backward application to obtain S. This matches the three applications drawn in the supplied solution.''',refs=[('mock',[13])])
put('mock21-5-2','用函数应用、类型提升和组合，完成 “We flew IcelandAir to Geneva and SwissAir to London” 的推导。',
'''Build the two coordinated fragments “IcelandAir to Geneva” and “SwissAir to London” with the same raised/composed category, so each can combine with the shared predicate. Coordinate those fragments, apply the result to “flew” to form a VP, and then combine with “We” to obtain S. The source's full annotated derivation is provided below; its crucial device is type raising of NP/PP arguments rather than function application alone.''',refs=[('mock',[14])])
put('mock21-6','使用 Chu–Liu/Edmonds 算法求原图的最大生成依存树，并展示权重调整。',
'''Choose the highest incoming edge for each non-root node: root→Solve (11), exam→the (8), the→exam (9). The last two form a cycle. Subtract each chosen incoming weight from the other edges entering that node. In particular Solve→exam becomes 8−9=−1, whereas Solve→the becomes 6−8=−2. Contract the cycle, choose the better incoming connection through exam, then expand and remove the conflicting cycle edge. The final tree is root→Solve (11), Solve→exam (8), exam→the (8), with total original score 27.''',
zh='各非根节点先选最高分入边：root→Solve（11）、exam→the（8）、the→exam（9），后两条构成环。对每个节点的入边减去该节点已选入边权重；例如 Solve→exam 变成 8−9=−1，而 Solve→the 变成 6−8=−2。收缩环后选择较好的、经 exam 进入环的连接，再展开并删除冲突的环内入边。最终树为 root→Solve（11）、Solve→exam（8）、exam→the（8），原始权重和为 27。',refs=[('mock',[15,16,17,18,19,20])])
put('mock21-7-1','为什么 BIO 命名实体识别适合序列标注，而非逐词独立分类？',
'''Entities occupy spans, so neighboring labels provide important information about whether a token begins, continues or lies outside an entity. A sequence-labeling model can represent these dependencies and predict coherent span boundaries rather than treating every label independently. This is the motivation given by the supplied NER solution.''',refs=[('mock',[22]),('tag',[17])])
put('mock21-7-2','半监督关系抽取中的 bootstrapping 如何从种子学习新规则？',
'''Start from known seed tuples or patterns. Find their contexts in unlabeled text, induce patterns, use those patterns to discover new relation tuples, and iterate. Assign confidence to candidate patterns/tuples and filter unreliable ones to limit semantic drift. This follows the supplied solution and the relation-extraction slides.''',refs=[('mock',[22]),('ie',[15,16,17])])
put('mock21-7-3','无监督开放关系抽取可能遇到什么问题？如何估计表现？',
'''The supplied solution warns that self-reinforcing extraction can propagate and multiply errors. It proposes manually labeling sampled extracted relations and comparing estimated precision at different output sizes. The lecture similarly describes the size/precision comparison as an indirect recall assessment.''',
zh='所附解答指出，自我强化的抽取过程可能传播并放大错误。它建议人工标注抽取结果的样本，并比较不同输出规模下的 precision。课件也把这种“输出规模—precision”比较描述为对 recall 的间接评估。',refs=[('mock',[22]),('ie',[23])],note=('A precision sample drawn only from extracted results does not supply the denominator for numerical recall. Direct recall estimation needs an annotated reference set or another justified estimate of all relevant relations. Keep that distinction when using the source’s informal wording.','仅从已抽取结果中抽样，只能直接估计 precision，不能给出数值 recall 的分母。直接估计 recall 需要标注参考集或对全部相关关系的合理估计；原材料的间接说法应与标准数值召回率区分。'))
put('mock21-8-1','写出加一平滑的情感朴素贝叶斯词概率估计，并说明训练数据和目的。',r'''For vocabulary V and class c:
\[\hat\theta_{vc}=\frac{N_{vc}+1}{\sum_u N_{uc}+|V|}.\]
Count words in class-labeled documents and estimate class priors. The conditional-independence assumption makes these class-conditional word counts sufficient for this model. Smoothing avoids zero probabilities for words unseen in a class.''',refs=[('mock',[23]),('classify',[18,19])],note=('The mock sheet labels the smoothed estimate MLE. Strictly, it is not the unsmoothed multinomial MLE; the supplied lecture derives add-one smoothing as MAP with αᵥ=2.','模拟卷沿用 MLE 标记，但加一后的估计不是未平滑多项分布的 MLE；所附课件以 αᵥ=2 的 MAP 推导加一平滑。'))
put('mock21-8-2','描述 SentProp 情感词典归纳算法，并说明少量种子可能带来的问题。',
'''Construct a nearest-neighbor graph over word embeddings, select positive and negative seed words, and propagate their polarities by random walks. A word's raw positive/negative scores reflect visits from the corresponding seeds; normalize the scores. Too few or poorly spread seeds leave low-confidence regions, and opposite-polarity words can be close in embedding space. Repeating with varied seeds gives a variability/confidence estimate in the lecture.''',refs=[('mock',[23]),('sentiment',[11,12])])
put('mock21-9-1','给出词频 tf、逆文档频率 idf 及 TF–IDF 矩阵元素的公式。',r'''The supplied solution uses
\[tf_{t,d}=count(t,d),\quad idf_t=\log_{10}(N/df_t),\quad w_{t,d}=tf_{t,d}\,idf_t.\]
N is the number of documents and dfₜ counts documents containing t. Other TF scalings or IDF smoothings exist, but these are the conventions printed in this solution.''',refs=[('mock',[25]),('embed',[17])])
put('mock21-9-2','稀疏词表示有哪些问题？列出两项。',
'''(1) Vocabulary-sized representations have high dimensionality and can make modeling/processing expensive. (2) Distinct coordinates do not directly capture semantic similarity between different but related words. The lecture contrasts these problems with dense lower-dimensional embeddings. Sparse storage can reduce memory use; high dimensionality does not mean every zero must be stored.''',refs=[('mock',[25]),('embed',[23])])
put('mock21-9-3','用上下文学习词表示，依赖的核心假设是什么？',
'''The distributional hypothesis: words occurring in similar contexts tend to have similar meanings. Representing a word through its contextual distribution therefore provides semantic information. Contextual embeddings additionally allow the representation of a particular occurrence to depend on that occurrence's context.''',refs=[('mock',[25]),('embed',[10,11]),('masked',[3])])
put('mock21-9-4','skip-gram 中的负采样是什么？为什么采用它？',
'''For an observed word–context pair, sample a small number of noise pairs and train a binary distinction between observed and sampled pairs. Only a few embeddings need to be updated per training case, avoiding the full-vocabulary normalization cost of the original softmax objective. The supplied slides formulate this as a logistic classification objective; it is a replacement training objective, not an exact full-softmax probability computation.''',refs=[('mock',[26]),('embed',[24,25,26,27])])
put('mock21-9-5','如何选择负采样分布，使常见词不至于过度主导样本？',r'''Use a flattened frequency distribution, as in the supplied skip-gram slides:
\[P_n(w)=\frac{f(w)^{0.75}}{\sum_u f(u)^{0.75}}.\]
Compared with sampling directly from f(w), the fractional exponent increases rare words' relative share and reduces the dominance of frequent words. It does not make frequent words less likely than rare words.''',refs=[('mock',[26]),('embed',[26])],note=('The mock solution says “negatively proportional” but then suggests a fractional power. Those are not equivalent: f(w)^0.75 is increasing in f(w). The formula and relative-flattening explanation above follow the lecture.','模拟解答写了 negatively proportional，又建议使用分数幂，两者并不等价：f(w)^0.75 仍随词频增加。这里的公式及“相对变平”解释以所附课件为准。'))
put('mock21-10-1','写出带间隔的排序 hinge loss。',r'''For a positive candidate x⁺, a negative candidate x⁻ and margin m>0:
\[L=\max\{0,m-s(x^+)+s(x^-)\}.\]
The loss is zero once the positive score exceeds the negative score by at least m. The supplied solution uses unit margin. If scores are distances rather than similarities, reverse the corresponding ordering.''',refs=[('mock',[28])])
put('mock21-10-2','举一个适合排序 hinge loss 的 NLP 任务，并说明原因。',
'''The supplied solution gives neural information extraction: score correct relation tuples above incorrect ones. The objective directly encourages the desired ordering rather than requiring an independently calibrated class probability for every candidate. Information retrieval ranking is another compatible example, but one explained example is enough.''',
zh='所附解答给出的例子是神经信息抽取：希望正确关系元组得分高于错误元组。排序损失直接鼓励这种相对顺序，而不要求对每个候选分别得到校准的类别概率。信息检索排序也是相容的例子，但按题意说明一个即可。',refs=[('mock',[28])])
put('mock21-10-3','解释 NLP CNN 中的池化，并举动态分区池化适用的任务。',
'''Pooling aggregates a collection of local features into a more compact representation; max pooling retains the strongest activation in a region. The supplied solution suggests scientific-paper classification, pooling separately over sections such as related work, methods and results because these regions have different roles. Do not identify every pooling operation with max pooling: that is the example used here.''',
zh='池化把一组局部特征聚合为更紧凑的表示，例如最大池化保留区域内最强的激活。所附解答举的是科研论文分类：对 related work、methods、results 等不同作用的章节分别池化。不要把所有池化都等同于最大池化；这里仅按原解所举例子说明。',refs=[('mock',[28])])
put('mock21-10-4','LSTM 相对普通 RNN 的主要改进是什么？遗忘门怎样发挥作用？',r'''LSTMs use a separate cell state and gates to regulate memory flow, helping with vanishing gradients and long-range dependencies. The update is
\[c_t=f_t\odot c_{t-1}+i_t\odot\tilde c_t.\]
The forget gate fₜ scales how much old memory is retained; the input gate controls the new contribution. Forgetting reduces old-state components rather than literally overwriting every component with new input.''',refs=[('mock',[29]),('rnn',[38,39,40,41])])
put('mock21-10-5','RNN 语言模型相对固定窗口神经模型，有哪两项优势？',
'''It can condition on a variable-length history rather than a fixed-size input window, and it shares the same recurrent parameters across time steps, so increasing sequence length does not require new position-specific parameters. Practical memory of distant history is still limited by training and state capacity.''',refs=[('mock',[29]),('rnn',[8,9])])
put('mock21-11-1','原图中的 RNN encoder–decoder 存在什么信息瓶颈？',
'''The decoder receives source information through a single final encoder state, which must summarize the entire input. This fixed-size bottleneck can lose details, particularly for long sequences, and the final state can favor more recent inputs. The supplied solution identifies this as the bottleneck problem.''',refs=[('mock',[31]),('rnn',[49])])
put('mock21-11-2','如何用注意力缓解上述瓶颈？写出公式并解释归一化作用。（原卷误标为 1.2。）',r'''For decoder state sₜ and encoder states hᵢ, compute scores and a context:
\[e_{ti}=s_t^Th_i,\quad\alpha_{ti}=\operatorname{softmax}_i(e_{ti}),\quad c_t=\sum_i\alpha_{ti}h_i.\]
The decoder can use a different weighted combination of all encoder states at each step. Softmax turns scores into nonnegative weights summing to 1 and emphasizes relatively relevant states. It is a soft weighting, not a hard selection of only the highest-scoring state.''',refs=[('mock',[31]),('rnn',[49,50,51])])
put('mock21-12-1','为什么将词表 softmax RNN 与指针模型混合用于语言建模？',
'''The softmax branch can generate a vocabulary word even when it is not in the recent context. The pointer branch can reproduce rare or out-of-vocabulary words that do occur in the input/context, but cannot copy an absent word. Mixing the two uses contextual copying when appropriate and backs off to vocabulary prediction otherwise. This is the distinction explicitly made on the supplied solution page.''',refs=[('mock',[33])])
put('mock21-12-2','Pointer Sentinel 模型中的混合门如何决定？',r'''Extend the pointer attention logits z by the sentinel score qᵀs, where s is learned. After one softmax, the mass on the sentinel is the vocabulary gate:
\[a=\operatorname{softmax}([z;q^Ts]),\qquad g=a_{L+1}.\]
The other entries allocate mass to context positions. A small g favors copying; a large g favors the vocabulary softmax. The supplied solution motivates this as letting the pointer mechanism itself decide when to defer.''',
zh=r'''在指针注意力分数 z 后添加 sentinel 分数 qᵀs，其中 s 为可学习向量，再统一 softmax：
\[a=\operatorname{softmax}([z;q^Ts]),\qquad g=a_{L+1}.\]
sentinel 所获得的概率质量 g 是词表分支的混合门；其余项对应上下文位置。g 小时偏向复制，g 大时偏向词表 softmax。所附解答强调，让指针机制自己决定何时退回词表预测。这里用 L 表示上下文位置数，避免与词表大小 V 混淆。''',refs=[('mock',[33])],note=('The source explains peaky versus flat pointer scores as intuition. A flat z alone does not mathematically guarantee a large gate: qᵀs is also involved.','原解把尖峰／平坦分数作为直觉说明；仅凭 z 平坦并不能数学保证 g 大，还取决于 qᵀs。'))
put('mock21-13-1','多头注意力的作用是什么？单个头可能有什么局限？',
'''Multiple learned projections allow several attention patterns/subspaces to be represented in parallel and then combined. A single head has only one attention distribution per query at that layer and can have difficulty representing different simultaneous relations. This is the motivation in the supplied solution and lecture; specialization is possible, not guaranteed for every head.''',refs=[('mock',[35]),('transformer',[12,13])])
put('mock21-13-2','Transformer 解码器做什么？为什么需要因果掩码？',
'''The decoder generates target tokens from their existing prefix and uses cross-attention to the encoder output. A causal mask prevents a target position from attending to future target tokens, avoiding answer leakage during training and matching autoregressive inference. Keep masked self-attention separate from encoder–decoder cross-attention.''',refs=[('mock',[35]),('mt',[23,28])])
