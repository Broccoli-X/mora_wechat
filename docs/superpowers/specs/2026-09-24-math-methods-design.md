# 数学方法动画课（小程序端）设计

日期：2026-09-24
状态：已确认（用户通过）

## 背景与目标

网页端 mora 有独立页面「数学方法动画课」（`math-methods.html` + `math-methods-core.js`）：
9 课算术方法动画（10以内加减·数轴跳蛙、凑十/破十/平十·口诀分块图、两位/三位数
进退位·竖式动画），交互为「选课 → 随机出题 → 数字键盘答题 → ▶ 动画演示分步讲解」，
纯前端自闭环——零服务端接口、零持久化、零积分上报。权限为独立 feature key
`math_methods`（登录门 + 家庭开通校验，服务端白名单已有）。

本设计把它移植到小程序：分类页「数学」组新增入口，完整对齐网页端交互与动画口径。

**明确不做**（与网页端边界一致）：无暂停/速度调节；无进度上报/积分/持久化；
识记学习四科（hanzi/words/image/article）不动；「口算练习」保持 dev 占位不动。

## 决策记录

| 决策点 | 选择 | 理由 |
|---|---|---|
| 入口形态 | 分类页独立功能页 | 对齐网页端架构；识记学习是服务端批次模式，与实时出题自闭环数据形态不兼容 |
| 功能范围 | 完整对齐（答题+动画） | core 算法纯函数现成，移植成本低；动画演示的使用场景就在答题流程里 |
| 动画技术 | 布局纯函数 + Canvas 2D | 弧线/箭头/虚线 canvas 原生支持（贝塞尔/setLineDash/marker 手画）；动画 rAF 插值平滑；单层无对齐问题；布局纯函数 Node 可测；项目有 share-card canvas 先例。否决 SVG base64（小程序 image 对 svg 支持不稳、换图闪烁）与纯 WXML（view 画不了弧线，核心视觉降级） |

## 文件结构

```
utils/math-methods.js       ← 网页端 math-methods-core.js 移植（CommonJS，约 200 行零 DOM 依赖）
utils/math-stage.js         ← 新增：三类舞台布局纯函数（Node 直测）
pages/math/methods.{js,wxml,wxss,json}  ← 页面四件套（目录仿 recognition 一目录多页惯例）
tests/math-methods.test.js  ← core + 布局纯函数
tests/math-pages.test.js    ← 页面接线 + 静态契约
```

同步改动：`app.json` 注册 `pages/math/methods`；`pages/category/category.js` 数学组
新增条目；`README.md` 功能清单同步。

## 一、core 算法（utils/math-methods.js）

与网页端 `math-methods-core.js` 同口径移植（两端变更需同步维护）：

- `METHODS`：9 课清单，顺序即难度顺序——line-add（10以内加法 #22b8cf）、
  line-sub（10以内减法 #fa5252）、make-ten（凑十法 #f59e0b）、break-ten（破十法
  #ef4444）、level-ten（平十法 #8b5cf6）、two-digit-add（两位数+两位数 #0ea5e9）、
  two-digit-sub（两位数-两位数 #14b8a6）、three-two-add（三位数+两位数 #2563eb）、
  three-two-sub（三位数-两位数 #ec4899）。字段：id/title/short/operator/summary/tip/color/example。
- `makeQuestion(methodId, random?)`：按每课约束随机出题（line-add 要求 a+b≤10、
  two-digit-add 要求个位和≥10 必有进位、two-digit-sub 要求 a%10<b%10 必有借位等），
  `random` 可注入便于测试（默认 Math.random）；findQuestion 最多重试 10000 次。
- `makeLineQuestion(methodId, left, right)`：线段课自定算式校验（line-add：两数
  1~9 且和≤10；line-sub：起点 1~10、步数 1~9 且不越过 0），非法返回 null。
- `buildDemoSteps(question)`：分派 lineSteps（每跳一落点 + 总结步）/
  oralSteps（凑十/破十/平十 4 步算式演变）/ additionSteps / subtractionSteps
  （逐位竖式，带 focus: ones/tens/hundreds 与 carry/borrow 标记）。
  每步 `{expression, caption, focus?, split?, at?, hop?, carry?, borrow?}`。
- `checkAnswer(question, value)`：仅收纯数字整数。
- `writeAnswerDigit(value, digit, direction, maxLength=3)` /
  `eraseAnswerDigit(value, direction)`：书写方向 high-first（高位先，右拼接）/
  ones-first（个位先，左拼接）。

## 二、舞台布局纯函数（utils/math-stage.js）

`buildStage(question)` → `{ kind, steps, maxStep, elements }`：

- `kind`：'line'（line-add/line-sub）| 'oral'（make-ten/break-ten/level-ten）|
  'place'（两位/三位加减）。
- `elements`：结构化绘制元素列表，坐标系照抄网页端 340×310 逻辑舞台
  （`structureHTML` 三函数的坐标原样搬）：
  - `block`：圆角数字色块（x/y/text/colorClass/step），colorClass ∈ sc1/sc2/sp1/
    sp2/sten/sans（网页端 .sb 配色）
  - `op`：运算符文本
  - `arc`：贝塞尔弧线（x1/y1/cx/cy/x2/y2/stroke/dash/markerColor/step）——数轴
    跳跃弧、进/借位弧
  - `line`：直线（数轴横线/刻度/竖式横线/引导虚线箭头）
  - `dot`：落点圈（数轴课）
  - `text`：SVG 侧标注文本（拆分标签等）
  - `marker`：🐸 青蛙（x/y/step，线段课，动画时按 hop 移动）
  - `caption`：底部字幕（线段课每步一张、竖式课每步一张；口诀课无独立 caption，
    说明融在 text/步骤算式里——与网页端口径一致）
- `maxStep`：线段课 = b+2（起点 step1 + 每跳 + 落定答案）、口诀课 = 6、
  竖式课 = 位数（对齐步为 step0，逐位 1..位数，答案各位的 step = digits-i
  随对应数位算出时显形——照抄网页端 placeStructure 口径）。

布局是纯数据，渲染器只负责画，两边可独立测试。

另含 `titleSegments(question, method)` 纯函数：把网页端 `updateAnimTitle` 的
innerHTML 彩色标记文案（如「💡 线段加法：小青蛙从 3 出发，往前跳 4 步，落在 7」，
数字带彩色块）拆为 `[{text, colorClass}]` 段数组，供 wxml 循环渲染，Node 直测。

## 三、页面（pages/math/methods）

### 数据与状态
data：`methodIndex`、`question`（含左右操作数/operator/answer 显示字段）、`input`、
`streak`、`writeDirection`（'high-first' 默认）、`solved`、`feedback`（文案+ok/bad 态）、
`demoVisible`、`animTitle`（带彩色标记富文本，wxml 拆段渲染）、`demoTip`（小口诀）、
`lineCustom`（线段课自定算式：a/b/op/hint/bad）、`stage`（弹窗 canvas 布局数据）、
`visibleStep`、`permDenied`。

### 交互（对齐网页端）
- **选课**：顶部 9 课胶囊横向滚动（`scroll-view`），选中态用每课主题色渐变；
  切换即 `makeQuestion` 换题并重置答题与演示。
- **题目舞台（WXML，非 canvas）**：线段/口诀课横式色块（a 蓝块 + operator +
  b 橙块 + = + 答案框）；两位/三位课竖式对齐（grid：上数蓝/下数橙/横线/答案框 +
  数位角标）。
- **答题**：数字键盘两行（1-5 / 6-0）+ ⌫退格 / ✔确认 / 🔄换题；书写顺序切换
  （高位→个位 ⇄ 个位→高位，切换清空当前答案并提示）；答对 = 绿框锁定 + streak+1 +
  键盘禁用；答错 = 红框抖动 + streak 清零 + 320ms 后恢复可输入；空答案提交提示。
- **动画演示**：题卡右上角「▶ 动画演示」常驻按钮，任何时候可点（不要求先答对）
  → 全屏弹窗（遮罩+卡片，点遮罩/×关闭），打开即自动播放：
  - canvas（`type="2d"`）wx.createSelectorQuery 取 node，dpr 缩放到 340×310 逻辑尺寸；
  - 按 `visibleStep` 过滤 elements 绘制：step ≤ visibleStep 的元素上屏，新出现的
    block/marker 做下落+淡入插值（rAF，约 400ms）——下落步级口径照抄网页端
    playAnim：线段课仅首尾步带下落、口诀课偶数步、竖式课每步；线段课青蛙 marker
    左移平滑过渡到落点 x；line/place 课每步只显当前 caption（先隐全部再显当前），
    口诀课无独立 caption——与网页端口径一致；
  - 编排：setTimeout 链，pace 线段课 560ms/步、其余 800ms/步；「🔁 再看一遍」重播；
  - 关闭弹窗 / 换题 / 选课 / onUnload 均 clearAnim 清 timer 防 ghost 回调；
  - 底部小口诀 tip（`method().tip`，竖式课兜底「看清数位，从低位开始算」）；
  - 线段课弹窗底部自定算式行：两个数字输入 + ▶看动画，`makeLineQuestion` 校验，
    非法红框抖动 + 范围提示，合法则换题重播；播完一题后自定行回填当前题两数。
- 弹窗打开期间 `canEditAnswer()` 为 false，锁定答题输入（对齐网页端 modal-open 口径）。

### 权限门
onLoad `auth.ensurePerm('math_methods', allowed => ...)`：未登录被登录门接管
（reLaunch 登录页）；allowed=false → `permDenied` 空态（「数学方法动画课未对本
家庭开放」），不渲染功能体。

### 错误兜底
canvas node 获取失败 → 弹窗内显示文字版步骤（expression+caption 列表）兜底；
出题函数异常（理论不可达）按同步 throw 由调用处 try 兜 toast。

## 四、测试

- **tests/math-methods.test.js**（移植网页端 13 用例口径 + 布局新断言）：
  - 9 课顺序与字段完整；每课出题范围 500 次随机验证（注入 seeded random）；
  - lineSteps 快照（`['3 + 4','3 → 4','4 → 5','5 → 6','6 → 7','7']`）；
  - makeLineQuestion 边界（9+9 合法、0 非法、12 非法、5-7 非法、10-10 合法、
    小数/非数字/非线段课均 null）；
  - 凑十/破十/平十步骤快照；168+47 十位再进百位链式传播；302-47 连续借位文案；
  - checkAnswer（纯数字整数才收）；书写方向写入/退格（high-first 右拼 /
    ones-first 左拼 / 3 位上限）；
  - 布局：三类 kind 分派正确；maxStep 口径；线段课含 🐸 marker 与落点 dot；
    竖式课含进1/借1 note 弧线；口诀课四行色块布局；全部元素坐标在 340×310 内。
- **tests/math-pages.test.js**（mock Page/wx 跑真实页面 js + 静态契约）：
  - ensurePerm 未开通 → permDenied 不渲染功能；开通 → 正常初始化出题；
  - 选课换题、答题对错流转（streak/锁定/抖动恢复）、书写方向切换清空、
    弹窗开关与锁输入、自定算式合法换题/非法报错；
  - 静态契约：app.json 注册、category 数学组条目（status ok + perm math_methods +
    url）、wxml 关键分支（键盘/弹窗/自定行）、canvas `type="2d"`。
- 全量回归：`node tests/<每个文件>` 全绿（现有 15 个文件不受影响；
  git 工作区里进行中的 kebiao 改动若红与本功能无关，报告中单列说明）。

## 风险与对策

- **canvas 弹窗初始化时机**：弹窗内容用 `wx:if`，打开后 `wx.nextTick` 再 query
  canvas node，避免节点未挂载拿不到。
- **rAF 与 timer 泄漏**：所有 setTimeout/rAF 句柄收口到 animTimers，四个出口
  （关闭弹窗/换题/选课/onUnload）统一清理。
- **两端同源漂移**：utils/math-methods.js 头部注释钉住「与网页端
  math-methods-core.js 同口径，两端变更需同步维护」（同 KINDS 惯例）。
