# NLP 双语题库编辑

编辑 content.json，保留 91 个题目 ID；成对维护 question/questionZh、answer/answerEn，并保留 sourceEvidence、sourceReview、auditNoteEn/Zh、sourceExcerptEn/Zh 等来源与审核字段。

在整个网站包根目录运行 node authoring/in2361/rebuild.mjs。它调用当前双语 renderer，校验 ID、两种语言、公式和证据图后更新 public/courses/in2361/data.js。预览题目、解析及来源链接后重新发布。现有文字、公式编辑只需 Node.js，KaTeX 与许可证已随包提供。

也可在作者目录运行 node render_math.cjs，但它只生成 authoring/in2361/dist/data.js，不会自动更新网站。通常使用 rebuild.mjs。

apply_bilingual.py 与 bilingual/ 保留了整批双语更新及 UI 补丁的原始维护工具，不是常规编辑的必要步骤。apply_bilingual.py 会覆盖 content.json 中对应的人工编辑，还依赖 Python、pypdfium2、由 NLP_LECTURES_DIR 配置的原课件目录（默认 private-materials/，不随仓库提供）。当前目录没有原始 PDF，不能在任意机器直接重生成资料页。已有 148 张证据图位于网站 public/courses/in2361/sources/evidence/；新增证据页需另行提供有权使用的资料、生成图片并更新引用。

上游 bilingual/verify.py 依赖未随包提供的旧版基线和原始 PDF，不适合作为此包的独立检查命令。rebuild.mjs 提供无需原 PDF 的基本校验。不要用首次整理脚本 build_content.py 回填旧内容；该脚本未打包。已迁移页面具备双语 UI，无需重跑 bilingual/apply_ui.py。

更多重建、发布及记录迁移说明见 ../../docs/maintenance.md。新增课程另设编号、目录、稳定 ID、存储键和备份格式，不要覆盖 IN2361。
