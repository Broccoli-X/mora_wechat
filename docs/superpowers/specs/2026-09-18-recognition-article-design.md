# 识记学习·新增「学文章」类型设计

日期:2026-09-18
状态:设计定稿(待实现)

## 需求

网页端「识记练习录入」已新增第四科**学文章**(mora `ee68f5e` 新增学科、`33bc6f5` 支持整篇存一条,
服务端 `valid_batch`/`batch_row_out` 同步支持):家长把一篇课文按「一行一段」或「整篇存一条」录入,
小程序端识记学习模块目前只认三科(hanzi/words/image),article 批次会被 `normalizeBrief` 静默丢弃。
本期把小程序端对齐:列表能看到学文章批次、批次页能按段浏览、禅模式能逐段认读。

## 数据口径(与网页端 lib/recognition-core.js 及服务端同源)

- KINDS 增 `{ id:'article', name:'学文章', subject:'语文/英语', icon:'📄', main:'#2b57d6' }`,
  排在识图之后;列表按 KINDS 顺序自动多出「学文章」节,节头科目文案「语文/英语」。
- 条目形状:`{ text: "一段原文" }` ——**没有 answer/extra/img**,换行照原样保留;
  单条上限 `TEXT_MAX = 2000` 字(一段或整篇存一条都放得下)。
- 批次:标题**可不填**(显示名取首条原文开头);`lang: 'zh'|'en'`(语文/英语,记在批次上);
  服务端概要接口(`batch_row_out`)额外返回 `preview`(首条 text/face 前 20 字,专为无标题文章列表页显示)。
- 客户端仍只做「能不能渲染」与长度保护,不复刻服务端字面校验(2026-09-11 事故决定不变):
  空串 text 丢弃;超 2000 截断(纯防御,服务端本就拒收);`lang` 非 zh/en 一律按 zh。

## 设计决定(用户已确认)

1. **禅模式长文:自适应字号 + 卡内可滚动**——短段大字、长文中字;超过一屏卡内上下滚读,
   左右滑仍是换段;**不翻面**(无答案可藏)。否掉「全部缩进一屏」(2000 字缩到看不清)与
   「整篇拆成多屏」(打破一条=一张,序号与批次页对不上)。
2. **批次页网格:单列宽卡 + 段号预览**——行首「第 N 段」色标 + 原文前 48 字预览
   (换行压成空格、超长省略),点卡进禅模式读全文。
3. **列表页无标题批次:取首条原文开头当显示名**——用服务端 `preview`,与网页端 displayName
   同口径;没有 preview 再兜底「未命名」。

## 实现(utils/recognition.js)

- `TEXT_MAX = 2000`、`PREVIEW_MAX = 48`(网格卡预览长度)。
- `normalizeItem` 加 article 分支(在 words 分支之前):`text` 原样保留(含换行),
  空→null,超长 `slice(0, TEXT_MAX)`;返回 `{ text }`。
- `normalizeBrief`:article 允许 title 空;保留 `preview`(clean 至 20 字,服务端给多少收多少)
  与 `lang`(zh/en 之外按 zh)。KIND_IDS 含 article 后,旧缓存无影响(旧缓存不可能有 article 批次),
  **缓存键不换版本**,照走 `mora-recognition-batch-v2`。
- `titleOf()`:title → 无标题取 preview(列表)/首条 text(整批)前 12 字加「…」→ 「未命名」,
  与网页端 `displayName` 同口径;`sections` 与 `batchView` 统一补 `dispTitle`,
  列表卡、批次页导航标题(`wx.setNavigationBarTitle`)、禅模式顶部胶囊三处自动一致。
- `itemView`(article):`flip:false`、`paraNo = i+1`、`preview`(前 48 字、`/\s+/g`→空格、超长省略;
  展示以样式两行 line-clamp 省略为准,48 字只是字段上限)、
  `text`(全文)、字号档 `artFs`:≤40 字 `lg` / ≤150 字 `md` / 其余 `sm`(可滚动档);
  无 answer/extra/labelA/labelB。
- 单位字段 `unit`(article→「段」,其余→「条」):`batchView` 与 `sections` 都补,
  列表卡「N 段」、批次头「共 N 段」、开始按钮文案页面直接取用,页面不自己拼。
- `batchView`(article):补 `langText`(zh→语文 / en→英语),头部语种胶囊直接取用。

## 页面

- **列表页**:副标题「识汉字 / 学英语 / 识图」补「学文章」;学文章批次卡标题用 `dispTitle`。
- **批次页**:`grid-article` 单列宽卡(识汉字 3 列 / 学英语·识图 2 列 / **学文章 1 列**)——
  行首「第 N 段」色标 + 两行预览;头部加语种胶囊(📄 学文章 · 语文/英语);
  开始按钮文案 article 为「▶ 开始学习(共 N 段)」,其余「🔀 开始认读(N 张)」不变。
- **禅模式**:rcCard 模板加 article 分支——全文 `text`(pre-wrap 保留段落换行),
  `sm` 档包 scroll-view 卡内上下滚动;`flip:false` 走不翻面路径,点卡片无操作;
  hint 无「点卡片看意思」:多段「← 左滑下一段 · 右滑上一段 →」、单段「这篇只有一段」。
  换段动效/奇偶异名重放/轻震动**全部复用现有类名**,不加新动画类(cards-css 契约不动)。

## 手势与滚动共存

禅模式手势绑在最外层(bindtouchstart/touchend),长文在 scroll-view 里竖向滚动时
touch 事件照常冒泡:换卡要求横向为主且 |dx|>48,翻面要求 |dx|≤24 且 |dy|≤24,
竖滚(dy 为主、dx 小)两者都不命中,互不干扰。

## 错误处理

空 text 条目丢、未知学科照旧丢;权限门(ensurePerm('recognition'))、404(批次已删)、
离线缓存、深链路径全部不变。截断只发生在超 2000 字的防御性场景(服务端不会给出这种数据)。

## 测试

- `tests/recognition.test.js` 增:KINDS 四科口径(article 与网页端逐字同源)、article 清洗
  (空丢/超长截 2000/换行保留/未知学科丢)、无标题 brief 收下并带 preview/lang(非 zh/en 按 zh)、
  titleOf 三级兜底(标题/首条前 12 字+…/未命名)、itemView(不翻面/段号/预览 48 字省略/字号档)、
  batchView(langText/unit/dispTitle)、sections 四节与「语文/英语」文案、条/段单位;
  现有 27 用例不动全绿。
- `tests/recognition-pages.test.js` 增:列表学文章节与无标题显示名兜底、批次页单列+段号+语种胶囊+
  按钮文案、禅模式文章卡(不翻面/换段循环/hint 文案/竖滚不误触换卡);
  现有 14 用例不动全绿。
- `tests/cards-css.test.js` 无需改动(不加新动画类)。

## 不做

翻面(无答案可藏)、⭐ 掌握标记与进度上报(与三科同口径,服务端 MODULES 白名单不含 recognition)、
录音跟读、按 lang 分流展示(批次头一枚语种胶囊已够,课文/跟读/考题按语种取用是网页端消费方的事)。
