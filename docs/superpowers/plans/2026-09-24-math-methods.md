# 数学方法动画课（小程序端）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把网页端「数学方法动画课」（math-methods.html）完整移植到小程序：分类页数学组独立入口，9 课算术方法（数轴跳蛙/口诀分块/竖式进退位）+ 随机出题答题 + canvas 分步动画演示。

**Architecture:** 三层——`utils/math-methods.js` 是网页端 `math-methods-core.js` 的 CommonJS 移植（纯算法零 DOM）；`utils/math-stage.js` 把网页端三个 structureHTML 舞台函数抽成布局纯函数（输出结构化元素列表，坐标系照抄 340×310）；`utils/math-canvas.js` 是薄渲染器（元素列表 → canvas 2d 绘制 + 入场插值计算）；`pages/math/methods` 页面负责答题交互与动画编排（setTimeout 链推进 step，rAF 循环重绘）。

**Tech Stack:** 微信小程序原生（Page/WXML/WXSS/Canvas 2D `type="2d"`）；测试为 Node 内置 assert + 自写 test() 计数器（无框架，`node tests/xxx.js` 直跑，mock `global.wx`/`global.Page`）。

**设计文档:** `docs/superpowers/specs/2026-09-24-math-methods-design.md`

## Global Constraints

- 与网页端同口径：METHODS 清单、出题约束、步骤文案、舞台坐标、动画节奏（线段课 560ms/步、其余 800ms/步）、交互文案**逐字对齐** `mora/math-methods.html` 与 `mora/math-methods-core.js`；两端变更需同步维护（文件头注释钉住）。
- 纯前端自闭环：零服务端接口、零存储、零积分上报、无进度持久化。
- 权限键 `math_methods`（服务端 FEATURES 白名单已有），入口与页面双拦截。
- 识记学习四科不动；分类页「口算练习」保持 `status:'dev'` 占位。
- 页面 wxss 用 rpx（2rpx≈1px）；canvas 舞台逻辑坐标固定 340×310 px（元素坐标体系），canvas 节点 css 尺寸 680×620rpx，内部按 dpr 缩放。
- 所有代码注释用中文，风格对齐现有 utils/pages（读相邻文件再动笔）。
- **工作区有进行中的 kebiao 改动（`utils/kebiao.js`、`tests/kebiao.test.js`）：每次提交只 `git add` 本功能明确列出的文件，绝不 `git add -A`。**
- 测试运行方式：`node tests/math-methods.test.js`、`node tests/math-pages.test.js`；全量回归 `for f in tests/*.test.js; do node "$f" || echo "FAIL: $f"; done`。

---

### Task 1: core 算法移植（utils/math-methods.js）

**Files:**
- Create: `utils/math-methods.js`
- Test: `tests/math-methods.test.js`（创建，本任务写 core 部分用例）

**Interfaces:**
- Consumes: 无（零依赖）。
- Produces（后续任务依赖的精确签名）:
  - `METHODS`: 9 课数组 `{id, title, short, operator, summary, tip, color, example}`，顺序即难度顺序
  - `makeQuestion(methodId, random?)` → `{methodId, left, right, operator, answer}`（random 可注入，默认 Math.random）
  - `makeLineQuestion(methodId, left, right)` → question | null（仅 line-add/line-sub；非法返回 null）
  - `buildDemoSteps(question)` → Step[]，Step = `{expression, caption, focus?, split?, at?, hop?, carry?, borrow?}`
  - `checkAnswer(question, value)` → boolean
  - `writeAnswerDigit(value, digit, direction, maxLength=3)` → string（direction: 'high-first'|'ones-first'）
  - `eraseAnswerDigit(value, direction)` → string

- [ ] **Step 1: 写失败测试**

创建 `tests/math-methods.test.js`（本步只写 core 用例，stage/canvas 用例 Task 2/3 追加）：

```js
/* utils/math-methods.js + utils/math-stage.js + utils/math-canvas.js 的 Node 测试。
   core 算法与网页端 mora/tests/math-methods-core.test.js 同口径(出题范围/步骤快照/
   进退位链式/判答/书写方向),另加舞台布局与渲染器断言。纯函数,无需 mock wx。
   运行:node tests/math-methods.test.js */
const assert = require('assert');
const core = require('../utils/math-methods');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }

/* 简单可复现随机源( mulberry32 ):出题范围断言用,避免极小概率抖动 */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('METHODS:9 课顺序与字段(与网页端 math-methods-core.js 同口径)', () => {
  assert.deepEqual(core.METHODS.map(m => m.id),
    ['line-add', 'line-sub', 'make-ten', 'break-ten', 'level-ten',
     'two-digit-add', 'two-digit-sub', 'three-two-add', 'three-two-sub']);
  core.METHODS.forEach(m => {
    assert.ok(m.title && m.short && m.summary && m.color && m.example, m.id + ' 字段完整');
    assert.ok(m.operator === '+' || m.operator === '-', m.id + ' operator 合法');
  });
  assert.equal(core.METHODS[0].title, '10以内加法');
  assert.equal(core.METHODS[8].title, '三位数 - 两位数');
});

test('makeQuestion:每课出题范围(每课 500 次随机验证)', () => {
  const checks = {
    'line-add': q => q.left >= 1 && q.left <= 9 && q.right >= 1 && q.right <= 9 && q.answer <= 10 && q.answer === q.left + q.right,
    'line-sub': q => q.left >= 2 && q.left <= 10 && q.right >= 1 && q.right <= 9 && q.answer >= 0 && q.answer === q.left - q.right,
    'make-ten': q => q.left >= 5 && q.left <= 9 && q.right >= 2 && q.right <= 9 && q.left + q.right > 10,
    'break-ten': q => q.left >= 11 && q.left <= 18 && q.right >= 2 && q.right <= 9 && q.right > q.left % 10,
    'level-ten': q => q.left >= 11 && q.left <= 18 && q.right >= 2 && q.right <= 9 && q.right > q.left % 10,
    'two-digit-add': q => q.left + q.right <= 99 && q.left % 10 + q.right % 10 >= 10,
    'two-digit-sub': q => q.left > q.right && q.left % 10 < q.right % 10,
    'three-two-add': q => q.left >= 101 && q.left <= 948 && q.right >= 11 && q.right <= 89 && q.left % 10 + q.right % 10 >= 10,
    'three-two-sub': q => q.left >= 101 && q.right >= 12 && q.left > q.right && q.left % 10 < q.right % 10,
  };
  Object.keys(checks).forEach(id => {
    const r = rng(id.length * 7919 + id.charCodeAt(0));
    for (let i = 0; i < 500; i++) {
      const q = core.makeQuestion(id, r);
      assert.ok(checks[id](q), id + ' 第' + i + '题越界: ' + JSON.stringify(q));
    }
  });
  assert.throws(() => core.makeQuestion('no-such'), /未知教学方法/);
});

test('buildDemoSteps:线段课快照(3 + 4)', () => {
  const q = { methodId: 'line-add', left: 3, right: 4, operator: '+', answer: 7 };
  assert.deepEqual(core.buildDemoSteps(q).map(s => s.expression),
    ['3 + 4', '3 → 4', '4 → 5', '5 → 6', '6 → 7', '7']);
  const sub = core.buildDemoSteps({ methodId: 'line-sub', left: 9, right: 2, operator: '-', answer: 7 });
  assert.equal(sub[1].expression, '9 → 8');
  assert.equal(sub[5].expression, '7');
  assert.equal(sub[5].focus, 'result');
});

test('buildDemoSteps:凑十/破十/平十快照', () => {
  const mt = core.buildDemoSteps({ methodId: 'make-ten', left: 8, right: 5, operator: '+', answer: 13 });
  assert.deepEqual(mt.map(s => s.expression), ['8 + 5', '8 + 2 + 3', '10 + 3', '13']);
  assert.equal(mt[2].focus, 'ten');
  const bt = core.buildDemoSteps({ methodId: 'break-ten', left: 15, right: 9, operator: '-', answer: 6 });
  assert.deepEqual(bt.map(s => s.expression), ['15 - 9', '10 - 9 + 5', '1 + 5', '6']);
  const lt = core.buildDemoSteps({ methodId: 'level-ten', left: 15, right: 9, operator: '-', answer: 6 });
  assert.deepEqual(lt.map(s => s.expression), ['15 - 9', '15 - 5 - 4', '10 - 4', '6']);
});

test('buildDemoSteps:进位/借位(含 168+47 十位再进百位、302-47 连续借位文案)', () => {
  const add2 = core.buildDemoSteps({ methodId: 'two-digit-add', left: 38, right: 27, operator: '+', answer: 65 });
  assert.deepEqual(add2.map(s => s.expression), ['38 + 27', '8 + 7 = 15', '3 + 2 + 1 = 6', '65']);
  assert.equal(add2[1].carry, 1);
  const add3 = core.buildDemoSteps({ methodId: 'three-two-add', left: 168, right: 47, operator: '+', answer: 215 });
  assert.equal(add3[1].expression, '8 + 7 = 15');
  assert.equal(add3[2].expression, '6 + 4 + 1 = 11');   // 十位再进位
  assert.equal(add3[2].carry, 1);
  assert.equal(add3[3].expression, '1 + 1 = 2');
  const sub2 = core.buildDemoSteps({ methodId: 'two-digit-sub', left: 52, right: 38, operator: '-', answer: 14 });
  assert.deepEqual(sub2.map(s => s.expression), ['52 - 38', '12 - 8 = 4', '4 - 3 = 1', '14']);
  assert.equal(sub2[1].borrow, 1);
  const sub3 = core.buildDemoSteps({ methodId: 'three-two-sub', left: 302, right: 47, operator: '-', answer: 255 });
  assert.equal(sub3[1].caption, '十位是 0，先向百位借 1；十位变 10，再借 1 给个位'); // 个位步骤提示连续借位
  assert.equal(sub3[1].expression, '12 - 7 = 5');
  assert.equal(sub3[2].expression, '9 - 4 = 5');       // 十位 0 借出后变 9
});

test('makeLineQuestion:边界(合法/非法/非线段课)', () => {
  assert.deepEqual(
    { a: core.makeLineQuestion('line-add', 9, 1).answer, b: core.makeLineQuestion('line-sub', 10, 10) },
    { a: 10, b: null });
  assert.equal(core.makeLineQuestion('line-add', 0, 5), null);   // 0 非法
  assert.equal(core.makeLineQuestion('line-add', 12, 5), null);  // 超 9
  assert.equal(core.makeLineQuestion('line-add', 5, 7), null);   // 和 12 > 10
  assert.equal(core.makeLineQuestion('line-sub', 5, 7), null);   // 越过 0
  assert.equal(core.makeLineQuestion('line-add', 3.5, 2), null); // 小数
  assert.equal(core.makeLineQuestion('line-add', 'x', 2), null); // 非数字
  assert.equal(core.makeLineQuestion('make-ten', 3, 4), null);   // 非线段课
});

test('checkAnswer:仅收纯数字整数', () => {
  const q = { answer: 13 };
  assert.equal(core.checkAnswer(q, '13'), true);
  assert.equal(core.checkAnswer(q, 13), true);
  assert.equal(core.checkAnswer(q, '013'), true);
  assert.equal(core.checkAnswer(q, '13 '), false);
  assert.equal(core.checkAnswer(q, '1.3'), false);
  assert.equal(core.checkAnswer(q, '-13'), false);
  assert.equal(core.checkAnswer(q, ''), false);
  assert.equal(core.checkAnswer(q, null), false);
});

test('书写方向:写入/退格(high-first 右拼 / ones-first 左拼 / 3 位上限)', () => {
  assert.equal(core.writeAnswerDigit('', 5, 'high-first'), '5');
  assert.equal(core.writeAnswerDigit('5', 2, 'high-first'), '52');
  assert.equal(core.writeAnswerDigit('5', 2, 'ones-first'), '25');
  assert.equal(core.writeAnswerDigit('123', 4, 'high-first'), '123'); // 上限 3 位
  assert.equal(core.writeAnswerDigit('123', 4, 'ones-first'), '123');
  assert.equal(core.eraseAnswerDigit('52', 'high-first'), '5');
  assert.equal(core.eraseAnswerDigit('52', 'ones-first'), '2');
  assert.equal(core.eraseAnswerDigit('', 'high-first'), '');
});

console.log('\n' + passed + ' 用例全过\n');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/math-methods.test.js`
Expected: FAIL `Cannot find module '../utils/math-methods'`

- [ ] **Step 3: 写实现**

创建 `utils/math-methods.js`——内容为网页端 `/Volumes/Data/UserData/projects/mora/math-methods-core.js` 第 8–203 行的**原样移植**（METHODS、METHOD_MAP、integer、findQuestion、makeQuestion、oralSteps、makeLineQuestion、lineSteps、additionSteps、subtractionSteps、buildDemoSteps、checkAnswer、writeAnswerDigit、eraseAnswerDigit），仅改两处：

1. 去掉 UMD 包装，改 CommonJS，文件头注释：

```js
/* 数学方法动画课 core 算法:与网页端 mora/math-methods-core.js 同口径移植
   (9 课清单/出题约束/分步演示数据/判答/书写方向),两端变更需同步维护。
   纯函数零依赖,Node 直测(tests/math-methods.test.js)。 */
'use strict';
```

2. 文件尾 `return {...}` 改为：

```js
module.exports = { METHODS, makeQuestion, makeLineQuestion, buildDemoSteps, checkAnswer, writeAnswerDigit, eraseAnswerDigit };
```

其余逐行照抄（含 `findQuestion` 的 10000 次重试与 throw、`oralSteps/lineSteps/additionSteps/subtractionSteps` 的全部文案、`writeAnswerDigit` 默认 maxLength 3）。**禁止「顺手优化」**——快照断言钉住了文案与结构。

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/math-methods.test.js`
Expected: 8 个用例全过，输出 `8 用例全过`

- [ ] **Step 5: 提交**

```bash
git add utils/math-methods.js tests/math-methods.test.js
git commit -m "feat: 数学方法动画课 core 算法移植——网页端 math-methods-core.js 原样转 CommonJS:9 课清单/每课出题约束(可注入随机源)/线段跳步与口诀凑破平十与竖式逐位四类步骤数据/判答/书写方向写入退格;测试移植网页端口径(9课顺序/500次范围验证/步骤快照/进退位链式/自定算式边界)"
```

---

### Task 2: 舞台布局纯函数（utils/math-stage.js）

**Files:**
- Create: `utils/math-stage.js`
- Modify: `tests/math-methods.test.js`（追加 stage/titleSegments 用例，插在 `console.log('\n' + passed ...)` 行之前）

**Interfaces:**
- Consumes: Task 1 的 `core.METHODS`、`core.buildDemoSteps`。
- Produces（Task 3/4 依赖）:
  - `kindOf(methodId)` → `'line' | 'oral' | 'place'`
  - `buildStage(question, themeColor?)` → `{ kind, steps, maxStep, elements, markerX? }`
    - `elements`: 元素数组，统一约定 **x/y 为左上角**，`step` 为显形步号（0 = 开场即显）：
      - `{type:'block', x, y, text, cls, step}` cls ∈ sc1/sc2/sp1/sp2/sten/sans，块 44×44 圆角 11
      - `{type:'op', x, y, text, step, size?}` 运算符（默认字号 20，place 课 28）
      - `{type:'line', x1, y1, x2, y2, stroke, width, step, dash?, cap?, marker?, markerColor?}`
      - `{type:'quad', p0:[x,y], cp:[x,y], p1:[x,y], stroke, width, step, dash?, marker?, markerColor?}` 二次贝塞尔
      - `{type:'path', segs:[{c:'M'|'C', pts:[...]}], stroke, width, step, dash?, marker?, markerColor?}` 三次贝塞尔链
      - `{type:'text', x, y, text, size, color, align:'center'|'start', bold?, step}`
      - `{type:'circle', cx, cy, r, stroke, width, step}`
      - `{type:'marker', x, y, text:'🐸', step}` 线段课青蛙
      - `{type:'note', x, y, text, step}` 竖式课「进1/借1」粉块（34×26）
      - `{type:'caption', text, step}` 底部字幕（每步一张，line/place 课）
    - 线段课弧线元素带 `markerTo`（青蛙该步落点左上角 x）；stage 带 `markerX`（青蛙起点 x）
  - `titleSegments(question)` → `[{text, color}]`（color 空 = 普通文字）

- [ ] **Step 1: 追加失败测试**

在 `tests/math-methods.test.js` 的 `console.log('\n' + passed ...)` 行之前插入：

```js
/* ── 舞台布局(math-stage) ── */
const stageLib = require('../utils/math-stage');

test('kindOf:三类分派', () => {
  assert.equal(stageLib.kindOf('line-add'), 'line');
  assert.equal(stageLib.kindOf('line-sub'), 'line');
  assert.equal(stageLib.kindOf('make-ten'), 'oral');
  assert.equal(stageLib.kindOf('level-ten'), 'oral');
  assert.equal(stageLib.kindOf('two-digit-add'), 'place');
  assert.equal(stageLib.kindOf('three-two-sub'), 'place');
});

test('buildStage:maxStep 口径(line=b+2 / oral=6 / place=位数)', () => {
  assert.equal(stageLib.buildStage({ methodId: 'line-add', left: 3, right: 4, operator: '+', answer: 7 }).maxStep, 6);
  assert.equal(stageLib.buildStage({ methodId: 'make-ten', left: 8, right: 5, operator: '+', answer: 13 }).maxStep, 6);
  assert.equal(stageLib.buildStage({ methodId: 'two-digit-add', left: 38, right: 27, operator: '+', answer: 65 }).maxStep, 2);
  assert.equal(stageLib.buildStage({ methodId: 'three-two-sub', left: 302, right: 47, operator: '-', answer: 255 }).maxStep, 3);
});

test('line 舞台:数轴/青蛙/跳跃弧/落点圈/答案块/字幕', () => {
  const st = stageLib.buildStage({ methodId: 'line-add', left: 3, right: 4, operator: '+', answer: 7 }, '#22B8CF');
  assert.equal(st.kind, 'line');
  assert.equal(st.markerX, 30 + 3 * 28 - 20);                    // 青蛙起点 X(3)-20
  const marker = st.elements.find(e => e.type === 'marker');
  assert.equal(marker.x, st.markerX);
  const arcs = st.elements.filter(e => e.type === 'quad');
  assert.equal(arcs.length, 4);                                   // 每跳一条弧
  assert.equal(arcs[0].p1[0], 30 + 4 * 28);                       // 第一跳落在 X(4)
  assert.equal(arcs[0].markerTo, 30 + 4 * 28 - 20);               // 青蛙目标
  assert.equal(arcs[0].step, 2);                                  // 步号 = hop+1
  const answer = st.elements.find(e => e.type === 'block' && e.text === '7');
  assert.equal(answer.step, 6);                                   // 答案块最后显形
  assert.equal(st.elements.filter(e => e.type === 'caption').length, 6); // 每步一张
  assert.equal(st.elements.filter(e => e.type === 'circle').length, 5);  // 起点+4 落点
});

test('oral 舞台:四行布局(8+5 凑十)', () => {
  const st = stageLib.buildStage({ methodId: 'make-ten', left: 8, right: 5, operator: '+', answer: 13 });
  assert.equal(st.kind, 'oral');
  const at = (step, y) => st.elements.filter(e => e.type === 'block' && e.step === step && e.y === y);
  assert.deepEqual(at(0, 8).map(e => e.text), ['8', '5', '13']);       // 顶部原式
  assert.deepEqual(at(2, 96).map(e => [e.text, e.cls, e.x]), [['2', 'sp1', 88], ['3', 'sp2', 208]]);
  assert.deepEqual(at(4, 186).map(e => [e.text, e.cls, e.x]), [['10', 'sten', 88]]);
  assert.deepEqual(at(6, 262).map(e => e.text), ['10', '3', '13']);    // 结果行
  assert.ok(st.elements.some(e => e.type === 'path' && e.step === 3)); // 引导弧
  assert.equal(st.elements.filter(e => e.type === 'caption').length, 0); // 口诀课无字幕
  // 破十(15-9):fromA=true, xLeft=false → 拆分行 Y 在左 8、X=10 在右 128
  const bt = stageLib.buildStage({ methodId: 'break-ten', left: 15, right: 9, operator: '-', answer: 6 });
  assert.deepEqual(bt.elements.filter(e => e.type === 'block' && e.step === 2 && e.y === 96).map(e => [e.text, e.x]),
    [['5', 8], ['10', 128]]);
});

test('place 舞台:竖式行/进1 note/借位弧/结果位逐步显形', () => {
  const st = stageLib.buildStage({ methodId: 'three-two-add', left: 168, right: 47, operator: '+', answer: 215 });
  assert.equal(st.kind, 'place');
  const blocks = (cls, y) => st.elements.filter(e => e.type === 'block' && e.cls === cls && e.y === y);
  assert.deepEqual(blocks('sc1', 62).map(e => e.text), ['1', '6', '8']);
  assert.equal(blocks('sc1', 62)[0].x, 118 - 22);                 // 三位 start=118
  assert.deepEqual(blocks('sc2', 118).map(e => e.text), ['', '4', '7'].slice(1));
  assert.deepEqual(st.elements.filter(e => e.type === 'block' && e.y === 198).map(e => [e.text, e.step]),
    [['2', 3], ['1', 2], ['5', 1]]);                              // 结果位:个位先显
  const notes = st.elements.filter(e => e.type === 'note');
  assert.equal(notes.length, 2);                                  // 个位、十位两枚进1
  assert.ok(notes.every(n => n.text === '进1'));
  const quads = st.elements.filter(e => e.type === 'quad');
  assert.equal(quads.length, 2);                                  // 两条进位弧
  const bt = stageLib.buildStage({ methodId: 'three-two-sub', left: 302, right: 47, operator: '-', answer: 255 });
  assert.equal(bt.elements.filter(e => e.type === 'note').length, 2); // 十位 0 连续借位
});

test('buildStage:所有元素坐标在 340×310 舞台内', () => {
  ['line-add', 'line-sub', 'make-ten', 'break-ten', 'level-ten', 'two-digit-add', 'two-digit-sub', 'three-two-add', 'three-two-sub']
    .forEach(id => {
      const q = core.makeQuestion(id, rng(id.charCodeAt(3) * 131 + 7));
      const st = stageLib.buildStage(q, '#22B8CF');
      st.elements.forEach(e => {
        if (e.type === 'caption') return;                       // 字幕由渲染器定宽定高,无坐标
        const xs = e.x !== undefined ? [e.x] : e.p0 ? [e.p0[0], e.cp[0], e.p1[0]] : e.x1 !== undefined ? [e.x1, e.x2] : e.cx !== undefined ? [e.cx] : e.segs ? e.segs.flatMap(s => s.pts.filter((_, i) => i % 2 === 0)) : [e.x];
        const ys = e.y !== undefined ? [e.y] : e.p0 ? [e.p0[1], e.cp[1], e.p1[1]] : e.y1 !== undefined ? [e.y1, e.y2] : e.cy !== undefined ? [e.cy] : e.segs ? e.segs.flatMap(s => s.pts.filter((_, i) => i % 2 === 1)) : [e.y];
        xs.forEach(x => assert.ok(x >= -1 && x <= 341, id + ' x 越界: ' + x));
        ys.forEach(y => assert.ok(y >= -1 && y <= 311, id + ' y 越界: ' + y));
      });
    });
});

test('titleSegments:各课彩色段文案', () => {
  const segText = segs => segs.map(s => s.text).join('');
  const la = stageLib.titleSegments({ methodId: 'line-add', left: 3, right: 4, operator: '+', answer: 7 });
  assert.equal(segText(la), '💡 线段加法：小青蛙从 3 出发，往前跳 4 步，落在 7');
  assert.equal(la[3].color, '#FF9500');                           // 跳步数橙色(c2)
  assert.equal(la[5].color, '#34C759');                           // 落点绿色(ten)
  const mt = stageLib.titleSegments({ methodId: 'make-ten', left: 8, right: 5, operator: '+', answer: 13 });
  assert.equal(segText(mt), '💡 凑十法：把 5 分成 2 和 3，和 8 先凑成 10');
  const bt = stageLib.titleSegments({ methodId: 'break-ten', left: 15, right: 9, operator: '-', answer: 6 });
  assert.equal(segText(bt), '💡 破十法：把 15 分成 10 和 5，先算 10 − 9');
  const lt = stageLib.titleSegments({ methodId: 'level-ten', left: 15, right: 9, operator: '-', answer: 6 });
  assert.equal(segText(lt), '💡 平十法：把 9 分成 5 和 4，先减 5 得到 10');
  const td = stageLib.titleSegments({ methodId: 'two-digit-add', left: 38, right: 27, operator: '+', answer: 65 });
  assert.equal(segText(td), '💡 两位数 + 两位数：个位满十，向十位进 1');
  assert.ok(td.every(s => !s.color));                             // 默认文案无彩色
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/math-methods.test.js`
Expected: FAIL `Cannot find module '../utils/math-stage'`

- [ ] **Step 3: 写实现**

创建 `utils/math-stage.js`：

```js
/* 数学动画舞台布局纯函数:三类舞台(数轴跳蛙 line / 口诀分块 oral / 竖式进退位 place)
   的元素布局,坐标系照抄网页端 mora/math-methods.html 的 lineStructure/oralStructure/
   placeStructure 三函数(340×310 逻辑舞台,x/y 均左上角)。只产数据不渲染,
   canvas 渲染见 utils/math-canvas.js。改坐标先改网页端再同步搬。 */
'use strict';
const core = require('./math-methods');

const LINE = ['line-add', 'line-sub'];
const ORAL = ['make-ten', 'break-ten', 'level-ten'];

function kindOf(methodId) {
  if (LINE.indexOf(methodId) >= 0) return 'line';
  if (ORAL.indexOf(methodId) >= 0) return 'oral';
  return 'place';
}

/* 数轴刻度 v(0~10) 的 x 坐标(网页端 X(v)=30+v*28) */
function lineX(v) { return 30 + v * 28; }

function lineStage(q, themeColor) {
  const steps = core.buildDemoSteps(q);
  const forward = q.operator === '+';
  const els = [];
  els.push({ type: 'line', x1: 18, y1: 150, x2: 322, y2: 150, stroke: '#CED4DA', width: 3, step: 0, cap: 'round' });
  for (let v = 0; v <= 10; v += 1) {
    els.push({ type: 'line', x1: lineX(v), y1: 144, x2: lineX(v), y2: 156, stroke: '#CED4DA', width: 2.5, step: 0 });
    els.push({ type: 'text', x: lineX(v), y: 176, text: String(v), size: 13, color: '#ADB5BD', align: 'center', step: 0 });
  }
  steps.forEach(s => {
    if (!s.hop) return;
    const x1 = lineX(s.at - (forward ? 1 : -1));
    const x2 = lineX(s.at);
    els.push({ type: 'quad', p0: [x1, 140], cp: [(x1 + x2) / 2, 100], p1: [x2, 140],
      stroke: themeColor || '#22B8CF', width: 2.6, dash: [6, 4], marker: true,
      markerColor: themeColor || '#22B8CF', step: s.hop + 1, markerTo: x2 - 20 });
  });
  els.push({ type: 'circle', cx: lineX(steps[0].at), cy: 170, r: 11, stroke: themeColor || '#22B8CF', width: 2.4, step: 1 });
  steps.forEach(s => {
    if (s.hop) els.push({ type: 'circle', cx: lineX(s.at), cy: 170, r: 11, stroke: themeColor || '#22B8CF', width: 2.4, step: s.hop + 1 });
  });
  els.push({ type: 'block', x: 68, y: 8, text: String(q.left), cls: 'sc1', step: 0 });
  els.push({ type: 'op', x: 120, y: 8, text: q.operator, step: 0 });
  els.push({ type: 'block', x: 148, y: 8, text: String(q.right), cls: 'sc2', step: 0 });
  els.push({ type: 'op', x: 200, y: 8, text: '=', step: 0 });
  els.push({ type: 'block', x: 228, y: 8, text: '?', cls: 'sans', step: 0 });
  els.push({ type: 'block', x: 228, y: 8, text: String(q.answer), cls: 'sten', step: steps.length });
  els.push({ type: 'marker', x: lineX(q.left) - 20, y: 72, text: '🐸', step: 1 });
  steps.forEach((s, i) => els.push({ type: 'caption', text: s.caption, step: i + 1 }));
  return { kind: 'line', steps: steps, maxStep: steps.length, elements: els, markerX: lineX(q.left) - 20 };
}

function oralStage(q) {
  const steps = core.buildDemoSteps(q);
  const a = q.left, b = q.right, ans = q.answer;
  let X, Y, Z, l4op, l3label, splitLabel, fromA, xLeft;
  if (q.methodId === 'make-ten') {
    X = 10 - a; Y = b - X; Z = 10; l4op = '+'; l3label = a + '+' + X;
    splitLabel = b + '=' + X + '+' + Y; fromA = false; xLeft = true;
  } else if (q.methodId === 'break-ten') {
    X = 10; Y = a - 10; Z = 10 - b; l4op = '+'; l3label = '10−' + b;
    splitLabel = a + '=10+' + Y; fromA = true; xLeft = false;
  } else {
    X = a % 10; Y = b - X; Z = 10; l4op = '−'; l3label = a + '−' + X;
    splitLabel = b + '=' + X + '+' + Y; fromA = false; xLeft = true;
  }
  const cls = v => (v === 10 ? 'sten' : 'sp1');
  const L2y = 96, L3y = 186, L4y = 262;
  const leftX = fromA ? 8 : 88, rightX = fromA ? 128 : 208;
  const els = [];
  const blk = (text, c, x, y, step) => els.push({ type: 'block', x: x, y: y, text: String(text), cls: c, step: step });
  const op = (text, x, y, step) => els.push({ type: 'op', x: x, y: y, text: text, step: step });
  blk(a, 'sc1', 68, 8, 0); op(q.operator, 120, 8, 0); blk(b, 'sc2', 148, 8, 0); op('=', 200, 8, 0); blk(ans, 'sans', 228, 8, 0);
  if (xLeft) { blk(X, cls(X), leftX, L2y, 2); blk(Y, 'sp2', rightX, L2y, 2); }
  else { blk(Y, 'sp2', leftX, L2y, 2); blk(X, cls(X), rightX, L2y, 2); }
  const zx = xLeft ? leftX : rightX;
  blk(Z, cls(Z), zx, L3y, 4);
  if (xLeft) { blk(Z, cls(Z), leftX, L4y, 6); op(l4op, 160, L4y, 6); blk(Y, 'sp2', rightX, L4y, 6); op('=', 260, L4y, 6); blk(ans, 'sans', 288, L4y, 6); }
  else { blk(Y, 'sp2', leftX, L4y, 6); op(l4op, 80, L4y, 6); blk(Z, cls(Z), rightX, L4y, 6); op('=', 180, L4y, 6); blk(ans, 'sans', 208, L4y, 6); }
  const sx = fromA ? 90 : 170, ccx = zx + 22, yc = (xLeft ? rightX : leftX) + 22;
  const arr = (x1, y1, x2, y2, s) => els.push({ type: 'line', x1: x1, y1: y1, x2: x2, y2: y2,
    stroke: '#999', width: 2.5, dash: [5, 4], marker: true, markerColor: '#999', step: s });
  arr(sx, 54, leftX + 22, 92, 1);
  arr(sx, 54, rightX + 22, 92, 1);
  arr(ccx, 142, ccx, 182, 3);
  els.push({ type: 'path', step: 3, stroke: '#999', width: 2.5, dash: [5, 4], marker: true, markerColor: '#999',
    segs: fromA
      ? [{ c: 'M', pts: [176, 53] }, { c: 'C', pts: [192, 74, 198, 100, 192, 126] }, { c: 'C', pts: [187, 152, 178, 172, 164, 181] }]
      : [{ c: 'M', pts: [82, 53] }, { c: 'C', pts: [64, 76, 57, 104, 61, 132] }, { c: 'C', pts: [65, 164, 72, 177, 92, 181] }] });
  arr(ccx, 232, ccx, 258, 5);
  arr(yc, 142, yc, 258, 5);
  els.push({ type: 'text', x: sx, y: 78, text: splitLabel, size: 12, color: '#666', align: 'center', bold: true, step: 1 });
  els.push({ type: 'text', x: ccx + 10, y: 166, text: l3label, size: 12, color: '#666', align: 'start', bold: true, step: 3 });
  return { kind: 'oral', steps: steps, maxStep: 6, elements: els };
}

function placeStage(q) {
  const steps = core.buildDemoSteps(q).filter(s => ['ones', 'tens', 'hundreds'].indexOf(s.focus) >= 0);
  const digits = String(q.left).length;
  const start = digits === 3 ? 118 : 178;
  const names = ['百位', '十位', '个位'].slice(3 - digits);
  const els = [];
  names.forEach((n, i) => els.push({ type: 'text', x: start + i * 60, y: 16, text: n.replace('位', ''), size: 11, color: '#aaa', align: 'center', bold: true, step: 0 }));
  const col = (value, c, y, stepFor) => {
    String(value).padStart(digits, ' ').split('').forEach((d, i) => {
      if (d === ' ') return;
      els.push({ type: 'block', x: start + i * 60 - 22, y: y, text: d, cls: c, step: stepFor(i) });
    });
  };
  col(q.left, 'sc1', 62, () => 0);
  col(q.right, 'sc2', 118, () => 0);
  col(q.answer, 'sans', 198, i => digits - i);
  els.push({ type: 'op', x: 66, y: 120, text: q.operator, step: 0, size: 28 });
  els.push({ type: 'line', x1: 82, y1: 174, x2: 278, y2: 174, stroke: '#777', width: 4, step: 0, cap: 'round' });
  let carryIn = 0, borrowIn = 0;
  for (let c = 0; c < digits; c += 1) {
    const step = c + 1, curIdx = digits - 1 - c, currentX = start + curIdx * 60, power = 10 ** c;
    const ld = Math.floor(q.left / power) % 10, rd = Math.floor(q.right / power) % 10;
    let transfer = false, label = '';
    if (q.operator === '+') {
      const total = ld + rd + carryIn, out = Math.floor(total / 10);
      transfer = out === 1; label = '进1'; carryIn = out;
    } else {
      const available = ld - borrowIn, out = available < rd ? 1 : 0;
      transfer = out === 1; label = '借1'; borrowIn = out;
    }
    if (c < digits - 1) {
      const nextX = currentX - 60;
      if (transfer) {
        els.push(q.operator === '+'
          ? { type: 'quad', p0: [currentX, 158], cp: [currentX - 30, 28], p1: [nextX, 54], stroke: '#E0306E', width: 2.8, dash: [5, 3], marker: true, markerColor: '#E0306E', step: step }
          : { type: 'quad', p0: [nextX, 56], cp: [currentX - 30, 16], p1: [currentX, 54], stroke: '#E0306E', width: 2.8, dash: [5, 3], marker: true, markerColor: '#E0306E', step: step });
        els.push({ type: 'note', x: nextX - 17, y: 28, text: label, step: step });
      } else {
        els.push({ type: 'line', x1: currentX, y1: 238, x2: nextX, y2: 238, stroke: '#4DABF7', width: 2.5, dash: [5, 4], marker: true, markerColor: '#E0306E', step: step });
      }
    }
  }
  steps.slice(0, digits).forEach((s, i) => els.push({ type: 'caption', text: s.caption, step: i + 1 }));
  return { kind: 'place', steps: steps, maxStep: digits, elements: els };
}

function buildStage(q, themeColor) {
  const kind = kindOf(q.methodId);
  if (kind === 'line') return lineStage(q, themeColor);
  if (kind === 'oral') return oralStage(q);
  return placeStage(q);
}

/* 弹窗标题彩色段(网页端 updateAnimTitle 的 innerHTML 拆段),color 空 = 普通文字 */
const TT = { c1: '#4DABF7', c2: '#FF9500', p1: '#FF5C8D', p2: '#9775FA', ten: '#34C759' };
const seg = (text, c) => ({ text: text, color: c ? TT[c] : '' });

function titleSegments(q) {
  const id = q.methodId;
  if (id === 'line-add') {
    return [seg('💡 线段加法：小青蛙从 '), seg(String(q.left), 'c1'), seg(' 出发，往前跳 '),
      seg(String(q.right), 'c2'), seg(' 步，落在 '), seg(String(q.answer), 'ten')];
  }
  if (id === 'line-sub') {
    return [seg('💡 线段减法：小青蛙从 '), seg(String(q.left), 'c1'), seg(' 出发，往回跳 '),
      seg(String(q.right), 'c2'), seg(' 步，剩下 '), seg(String(q.answer), 'ten')];
  }
  if (id === 'make-ten') {
    const p = 10 - q.left;
    return [seg('💡 凑十法：把 '), seg(String(q.right), 'c2'), seg(' 分成 '), seg(String(p), 'p1'),
      seg(' 和 '), seg(String(q.right - p), 'p2'), seg('，和 '), seg(String(q.left), 'c1'), seg(' 先凑成 10')];
  }
  if (id === 'break-ten') {
    return [seg('💡 破十法：把 '), seg(String(q.left), 'c1'), seg(' 分成 '), seg('10', 'ten'),
      seg(' 和 '), seg(String(q.left - 10), 'p2'), seg('，先算 10 − '), seg(String(q.right), 'c2')];
  }
  if (id === 'level-ten') {
    const p = q.left % 10;
    return [seg('💡 平十法：把 '), seg(String(q.right), 'c2'), seg(' 分成 '), seg(String(p), 'p1'),
      seg(' 和 '), seg(String(q.right - p), 'p2'), seg('，先减 '), seg(String(p), 'p1'), seg(' 得到 10')];
  }
  const m = core.METHODS.filter(x => x.id === id)[0] || { title: '', summary: '' };
  return [seg('💡 ' + m.title + '：' + m.summary)];
}

module.exports = { kindOf, buildStage, titleSegments };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/math-methods.test.js`
Expected: 15 个用例全过（8 + 7）

- [ ] **Step 5: 提交**

```bash
git add utils/math-stage.js tests/math-methods.test.js
git commit -m "feat: 数学动画舞台布局纯函数——三类舞台元素列表(线段数轴跳蛙/口诀四行分块/竖式逐位进退位),坐标照抄网页端 340×310 structureHTML 三函数,含青蛙落点 markerTo/进借位 note/底部字幕/弹窗标题彩色段 titleSegments;测试钉 maxStep 口径/四行布局坐标/结果位逐步显形/越界扫描"
```

---

### Task 3: canvas 渲染器（utils/math-canvas.js）

**Files:**
- Create: `utils/math-canvas.js`
- Modify: `tests/math-methods.test.js`（追加渲染器用例，插在 `console.log('\n' + passed ...)` 行之前）

**Interfaces:**
- Consumes: Task 2 的 `buildStage` 元素结构。
- Produces（Task 4 依赖）:
  - `drawStage(ctx, stage, frame)` — 把舞台画到已 dpr 缩放的 2d context。
    - `frame = { step, captionStep?, drops?, markerX? }`
      - `step`: 当前已显形步（`el.step > step` 不画）
      - `captionStep`: 提供时只画 `step === captionStep` 的 caption（line/place 课每步换字幕）
      - `drops`: `{ [元素索引]: {alpha, dy} }` 入场插值（alpha 0→1、dy -16→0）
      - `markerX`: 提供时覆盖 marker 元素的 x（青蛙移动）
    - ctx 只用标准 2d 接口（save/restore/translate/globalAlpha/beginPath/moveTo/lineTo/quadraticCurveTo/bezierCurveTo/arc/closePath/fill/stroke/setLineDash/fillText/measureText/rotate + fillStyle/strokeStyle/lineWidth/lineCap/font/textAlign/textBaseline 赋值）。

- [ ] **Step 1: 追加失败测试**

在 `tests/math-methods.test.js` 的 `console.log('\n' + passed ...)` 行之前插入：

```js
/* ── canvas 渲染器(math-canvas) ── */
const canvasLib = require('../utils/math-canvas');

/* 记录调用的假 ctx:方法调用与属性赋值都进 calls */
function makeCtxRecorder() {
  const calls = [];
  return {
    calls: calls,
    ctx: new Proxy({}, {
      get(t, p) { return function () { calls.push([String(p)].concat([].slice.call(arguments))); }; },
      set(t, p, v) { calls.push(['set:' + String(p), v]); return true; },
    }),
  };
}

test('drawStage:step 过滤/captionStep 换字幕/markerX 覆盖', () => {
  const st = stageLib.buildStage({ methodId: 'line-add', left: 3, right: 4, operator: '+', answer: 7 }, '#22B8CF');
  const rec = makeCtxRecorder();
  canvasLib.drawStage(rec.ctx, st, { step: 1, captionStep: 1, markerX: 100 });
  const texts = rec.calls.filter(c => c[0] === 'fillText').map(c => c[1]);
  assert.ok(texts.indexOf('3') >= 0, '顶部算式已画');
  assert.ok(texts.indexOf('7') === -1, '答案块 step=6 未显形不画');
  assert.ok(texts.indexOf('🐸') >= 0, '青蛙已画');
  const markerText = rec.calls.filter(c => c[0] === 'fillText' && c[1] === '🐸')[0];
  assert.equal(markerText[2], 120);                               // markerX=100 + 块半宽 20
  assert.equal(rec.calls.filter(c => c[0] === 'fillText' && typeof c[1] === 'string' && c[1].indexOf('小青蛙') >= 0).length, 1, '只画当前步字幕');

  const rec2 = makeCtxRecorder();
  canvasLib.drawStage(rec2.ctx, st, { step: 6, captionStep: 6 });
  assert.ok(rec2.calls.some(c => c[0] === 'fillText' && c[1] === '7'), '终局答案块已画');
});

test('drawStage:drops 入场插值(translate+globalAlpha)', () => {
  const st = stageLib.buildStage({ methodId: 'make-ten', left: 8, right: 5, operator: '+', answer: 13 });
  const rec = makeCtxRecorder();
  canvasLib.drawStage(rec.ctx, st, { step: 2, drops: { 5: { alpha: 0.5, dy: -8 } } });
  assert.ok(rec.calls.indexOf(['set:globalAlpha', 0.5]) >= 0, 'alpha 生效');
  assert.deepEqual(rec.calls.filter(c => c[0] === 'translate')[0], ['translate', 0, -8]);
  assert.equal(rec.calls.filter(c => c[0] === 'restore').length, rec.calls.filter(c => c[0] === 'save').length);
});

test('drawStage:marker/箭头/圆角块冒烟(不抛错且产生笔画)', () => {
  ['line-add', 'make-ten', 'three-two-add', 'three-two-sub'].forEach(id => {
    const q = core.makeQuestion(id, rng(id.length * 17 + 3));
    const st = stageLib.buildStage(q, '#22B8CF');
    for (let s = 0; s <= st.maxStep; s++) {
      const rec = makeCtxRecorder();
      canvasLib.drawStage(rec.ctx, st, { step: s, captionStep: st.kind === 'oral' ? null : s });
      assert.ok(rec.calls.length > 10, id + ' step' + s + ' 有笔画');
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/math-methods.test.js`
Expected: FAIL `Cannot find module '../utils/math-canvas'`

- [ ] **Step 3: 写实现**

创建 `utils/math-canvas.js`：

```js
/* 数学动画舞台 canvas 2d 渲染器:把 math-stage 的元素列表画到 340×310 逻辑舞台
   (调用前 ctx 已按 dpr scale)。纯绘制不持状态,入场插值(alpha/dy)由页面算好
   经 frame.drops 传入。配色与网页端 math-methods.html CSS 同值。 */
'use strict';

const BLOCK_COLORS = { sc1: '#2F80ED', sc2: '#F77F00', sp1: '#E0306E', sp2: '#7048E8', sten: '#27AE60', sans: '#343A40' };

/* 圆角矩形路径(canvas 2d 的 roundRect 兼容性不一,自绘) */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 终点箭头小三角:angle 为来向角度(由调用方按切线算) */
function arrow(ctx, x, y, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-7, -3.5);
  ctx.lineTo(-7, 3.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function endTangent(el) {
  if (el.type === 'line') return Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
  if (el.type === 'quad') return Math.atan2(el.p1[1] - el.cp[1], el.p1[0] - el.cp[0]);
  const last = el.segs[el.segs.length - 1].pts;
  return Math.atan2(last[last.length - 1] - last[last.length - 3], last[last.length - 2] - last[last.length - 4]);
}

function strokeStyled(ctx, el, trace) {
  ctx.beginPath();
  trace();
  ctx.strokeStyle = el.stroke;
  ctx.lineWidth = el.width;
  if (el.dash) ctx.setLineDash(el.dash);
  ctx.lineCap = el.cap || 'butt';
  ctx.stroke();
  ctx.setLineDash([]);
  if (el.marker) {
    const p = el.type === 'line' ? [el.x2, el.y2] : el.type === 'quad' ? el.p1 : el.segs[el.segs.length - 1].pts.slice(-2);
    arrow(ctx, p[0], p[1], endTangent(el), el.markerColor || el.stroke);
  }
}

/* caption 文字折行(底框宽 300,内文宽 280;measureText 缺失时按 12px/字兜底) */
function captionLines(ctx, text) {
  const limit = 280;
  const rows = [];
  let line = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const m = ctx.measureText ? ctx.measureText(line + ch) : null;
    const w = m && typeof m.width === 'number' ? m.width : (line.length + 1) * 12;
    if (w > limit && line) { rows.push(line); line = ch; } else { line += ch; }
    if (rows.length === 3) break;   // 最多 3 行
  }
  if (rows.length < 3 && line) rows.push(line);
  return rows;
}

function drawCaption(ctx, el) {
  ctx.font = 'bold 12px sans-serif';
  const rows = captionLines(ctx, el.text);
  const h = rows.length * 17 + 16;
  rr(ctx, 20, 258, 300, h, 12);
  ctx.fillStyle = '#F2F8FF';
  ctx.fill();
  ctx.strokeStyle = '#C8D9F2';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#555';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  rows.forEach((r, i) => ctx.fillText(r, 170, 258 + 8 + 8.5 + i * 17));
}

function drawEl(ctx, el, frame) {
  switch (el.type) {
    case 'block': {
      rr(ctx, el.x, el.y, 44, 44, 11);
      ctx.fillStyle = BLOCK_COLORS[el.cls] || BLOCK_COLORS.sans;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text, el.x + 22, el.y + 23);
      return;
    }
    case 'op': {
      ctx.fillStyle = '#666';
      ctx.font = 'bold ' + (el.size || 20) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text, el.x + 10, el.y + 22);
      return;
    }
    case 'note': {
      rr(ctx, el.x, el.y, 34, 26, 8);
      ctx.fillStyle = '#E0306E';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text, el.x + 17, el.y + 14);
      return;
    }
    case 'line':
      strokeStyled(ctx, el, () => { ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2); });
      return;
    case 'quad':
      strokeStyled(ctx, el, () => { ctx.moveTo(el.p0[0], el.p0[1]); ctx.quadraticCurveTo(el.cp[0], el.cp[1], el.p1[0], el.p1[1]); });
      return;
    case 'path':
      strokeStyled(ctx, el, () => {
        el.segs.forEach(s => {
          if (s.c === 'M') ctx.moveTo(s.pts[0], s.pts[1]);
          else ctx.bezierCurveTo(s.pts[0], s.pts[1], s.pts[2], s.pts[3], s.pts[4], s.pts[5]);
        });
      });
      return;
    case 'circle': {
      ctx.beginPath();
      ctx.arc(el.cx, el.cy, el.r, 0, Math.PI * 2);
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = el.width;
      ctx.stroke();
      return;
    }
    case 'text': {
      ctx.fillStyle = el.color;
      ctx.font = (el.bold ? 'bold ' : '') + el.size + 'px sans-serif';
      ctx.textAlign = el.align || 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(el.text, el.x, el.y);
      return;
    }
    case 'marker': {
      const x = frame.markerX != null ? frame.markerX : el.x;
      ctx.font = '27px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text, x + 20, el.y + 20);
      return;
    }
    case 'caption':
      if (frame.captionStep == null || el.step === frame.captionStep) drawCaption(ctx, el);
      return;
    default:
  }
}

function drawStage(ctx, stage, frame) {
  ctx.save();
  stage.elements.forEach((el, i) => {
    if (el.step > frame.step) return;
    const drop = frame.drops ? frame.drops[i] : null;
    if (drop) {
      ctx.save();
      ctx.globalAlpha = drop.alpha;
      ctx.translate(0, drop.dy);
    }
    drawEl(ctx, el, frame);
    if (drop) ctx.restore();
  });
  ctx.restore();
}

module.exports = { drawStage };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/math-methods.test.js`
Expected: 18 个用例全过（15 + 3）

- [ ] **Step 5: 提交**

```bash
git add utils/math-canvas.js tests/math-methods.test.js
git commit -m "feat: 数学动画舞台 canvas 渲染器——元素列表到 2d context 的纯绘制(圆角块/贝塞尔弧+终点箭头/虚线引导/数轴落点圈/青蛙/进借位 note/字幕折行),入场插值由页面算好经 frame.drops 传入,step 过滤+captionStep 换字幕+markerX 青蛙移动;mock ctx 记录断言"
```

---

### Task 4: 页面与入口（pages/math/methods + app.json + category）

**Files:**
- Create: `pages/math/methods.js` / `methods.wxml` / `methods.wxss` / `methods.json`
- Modify: `app.json`（pages 数组 `"pages/recognition/zen",` 之后插入 `"pages/math/methods",`）
- Modify: `pages/category/category.js:23-27`（数学组 items）
- Test: `tests/math-pages.test.js`（创建）

**Interfaces:**
- Consumes: Task 1/2/3 全部导出；`utils/auth.js` 的 `ensurePerm(feature, done)`。
- Produces: 可用页面 `pages/math/methods`；分类页数学组入口 `perm: 'math_methods'`。

- [ ] **Step 1: 写失败测试**

创建 `tests/math-pages.test.js`：

```js
/* 数学方法动画课页面接线测试:mock Page/wx,跑真实 pages/math/methods.js。
   钉:权限拦截、初始化出题、选课换题、键盘与书写方向、对错流转、弹窗锁输入、
   线段课自定算式、canvas 初始化与文字兜底、静态契约(app.json/分类页/wxml)。
   运行:node tests/math-pages.test.js */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

/* ── mock:storage/request/canvas query ── */
let store = new Map();
let routes = {};
let page = null;
let toasts = [];
let rafCbs = [];
let canvasNode = null;
let canvasQueried = 0;

function makeCanvasNode() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, p) { return function () { calls.push([String(p)].concat([].slice.call(arguments))); }; },
    set(t, p, v) { calls.push(['set:' + String(p), v]); return true; },
  });
  canvasNode = {
    width: 0, height: 0, ctxCalls: calls,
    getContext: () => ctx,
    requestAnimationFrame(cb) { rafCbs.push(cb); return rafCbs.length; },
    cancelAnimationFrame() { rafCbs = []; },
  };
  return canvasNode;
}

global.getCurrentPages = () => [{ route: 'pages/math/methods', options: {} }];
global.Page = o => { page = o; };
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  getWindowInfo: () => ({ pixelRatio: 2, statusBarHeight: 47 }),
  nextTick: fn => fn(),
  createSelectorQuery: () => ({
    in() { return this; },
    select() { return this; },
    fields(opt, cb) { canvasQueried += 1; cb({ node: makeCanvasNode(), width: 340, height: 310 }); return this; },
    exec() {},
  }),
  request(opts) {
    for (const key of Object.keys(routes)) {
      if (opts.url.indexOf(key) >= 0) {
        const r = routes[key];
        if (r === null) { if (opts.fail) opts.fail(); return; }
        if (opts.success) opts.success(r);
        return;
      }
    }
    if (opts.fail) opts.fail();
  },
  showToast: o => toasts.push(o.title),
};

/* 载入页面文件并实例化(setData 支持一层路径 'lineCustom.a',与微信同款) */
function load() {
  page = null;
  const file = path.join(__dirname, '..', 'pages', 'math', 'methods.js');
  delete require.cache[require.resolve(file)];
  require(file);
  const inst = Object.create(page);
  inst.data = JSON.parse(JSON.stringify(page.data));
  inst.setData = function (patch) {
    Object.keys(patch).forEach(k => {
      if (k.indexOf('.') > 0) {
        const parts = k.split('.');
        this.data[parts[0]] = Object.assign({}, this.data[parts[0]]);
        this.data[parts[0]][parts[1]] = patch[k];
      } else this.data[k] = patch[k];
    });
  };
  return inst;
}

function reset(perms) {
  store.clear();
  toasts = []; rafCbs = []; canvasQueried = 0; canvasNode = null;
  routes = { '/api/perms': { statusCode: 200, data: { ok: true, perms: perms || ['math_methods'] } } };
  store.set('mora-auth-token', 'T');
}

/* 等待 ms(真实 timer,答错恢复 320ms 用) */
const wait = ms => new Promise(r => setTimeout(r, ms));

let passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('✓ ' + name); });
}

/* ── 权限与初始化 ── */
test('页面:未开通 math_methods 整页拦截', () => {
  reset(['recognition']);
  const p = load();
  p.onLoad();
  assert.equal(p.data.blocked, true);
  assert.equal(p.data.question, null);
});

test('页面:开通后初始化第 1 课并出题', () => {
  reset();
  const p = load();
  p.onLoad();
  assert.equal(p.data.blocked, false);
  assert.equal(p.data.methodIndex, 0);
  assert.equal(p.data.methods.length, 9);
  assert.equal(p.data.lesson.kicker, '第 1 课');
  assert.ok(p.data.question && p.data.question.operator === '+');
  assert.equal(p.data.question.vertical, false);            // 线段课横式
  assert.equal(p.data.writeDirection, 'high-first');
  assert.equal(p.data.streak, 0);
});

/* ── 答题 ── */
test('页面:键盘高位先/个位先书写', () => {
  reset();
  const p = load();
  p.onLoad();
  p.onKeyDigit({ currentTarget: { dataset: { k: 1 } } });
  p.onKeyDigit({ currentTarget: { dataset: { k: 2 } } });
  assert.equal(p.data.input, '12');
  p.onWriteDirection({ currentTarget: { dataset: { d: 'ones-first' } } });
  assert.equal(p.data.input, '');                           // 切换清空
  p.onKeyDigit({ currentTarget: { dataset: { k: 1 } } });
  p.onKeyDigit({ currentTarget: { dataset: { k: 2 } } });
  assert.equal(p.data.input, '21');                         // 个位先:左拼
  p.onBackspace({ currentTarget: {} });
  assert.equal(p.data.input, '2');
});

test('页面:答对锁定+streak,答错清零+320ms 恢复,空提交提示', async () => {
  reset();
  const p = load();
  p.onLoad();
  /* 把题目换成确定值:line-add 3+4 */
  p.question = { methodId: 'line-add', left: 3, right: 4, operator: '+', answer: 7 };
  p.setData({ question: { methodId: 'line-add', left: 3, right: 4, operator: '+', answer: 7, vertical: false, digits: 0, topCells: [], bottomCells: [], placeTags: [] } });
  p.onSubmit();
  assert.equal(p.data.feedback.cls, 'bad');                 // 空提交
  p.onKeyDigit({ currentTarget: { dataset: { k: 9 } } });
  p.onSubmit();
  assert.equal(p.data.streak, 0);
  assert.equal(p.data.inputState, 'wrong');
  await wait(360);
  assert.equal(p.data.inputState, '');                      // 抖动后恢复
  p.onKeyDigit({ currentTarget: { dataset: { k: 7 } } });
  p.onSubmit();
  assert.equal(p.data.inputState, 'correct');
  assert.equal(p.data.streak, 1);
  assert.equal(p.data.inputLocked, true);
  p.onKeyDigit({ currentTarget: { dataset: { k: 8 } } });
  assert.equal(p.data.input, '7');                          // 锁定后按键无效
});

test('页面:换题重置答题与输入', () => {
  reset();
  const p = load();
  p.onLoad();
  p.onKeyDigit({ currentTarget: { dataset: { k: 3 } } });
  p.onNewQuestion();
  assert.equal(p.data.input, '');                           // 状态重置(题目随机,只验状态)
  assert.equal(p.data.inputLocked, false);
  assert.equal(p.data.streak, 0);
});

/* ── 弹窗与动画 ── */
test('页面:打开演示弹窗锁输入+canvas 就绪,线段课有自定行', () => {
  reset();
  const p = load();
  p.onLoad();
  p.openDemo();
  assert.equal(p.data.demoVisible, true);
  assert.equal(p.data.inputLocked, true);
  assert.ok(p.data.animTitle.length > 0);
  assert.ok(p.data.demoSteps.length > 0);
  assert.ok(p.data.lineCustom && p.data.lineCustom.op === '+');
  assert.equal(canvasQueried, 1);
  assert.equal(canvasNode.width, 680);                      // 340 × dpr2
  assert.equal(p.data.canvasReady, true);
  p.onKeyDigit({ currentTarget: { dataset: { k: 5 } } });
  assert.equal(p.data.input, '');                           // 弹窗期锁输入
  p.closeDemo();
  assert.equal(p.data.demoVisible, false);
  assert.equal(p.data.inputLocked, false);
});

test('页面:口诀课弹窗无自定行,竖式课 question 视图带竖式字段', () => {
  reset();
  const p = load();
  p.onLoad();
  p.selectMethod(2);                                        // 凑十法
  p.openDemo();
  assert.equal(p.data.lineCustom, null);
  assert.equal(p.data.question.vertical, false);
  p.closeDemo();
  p.selectMethod(5);                                        // 两位数+两位数
  assert.equal(p.data.question.vertical, true);
  assert.equal(p.data.question.digits, 2);
  assert.equal(p.data.question.topCells.length, 2);
  assert.equal(p.data.question.placeTags.join(''), '十个');
});

test('页面:自定算式合法换题重播/非法红框', () => {
  reset();
  const p = load();
  p.onLoad();
  p.openDemo();
  p.onLineInput({ currentTarget: { dataset: { f: 'a' } }, detail: { value: '2' } });
  p.onLineInput({ currentTarget: { dataset: { f: 'b' } }, detail: { value: '3' } });
  const prev = p.question;
  p.onLinePlay();
  assert.equal(p.question.left, 2);
  assert.equal(p.question.right, 3);
  assert.equal(p.data.lineCustom.bad, false);
  p.onLineInput({ currentTarget: { dataset: { f: 'a' } }, detail: { value: '9' } });
  p.onLineInput({ currentTarget: { dataset: { f: 'b' } }, detail: { value: '9' } });
  p.onLinePlay();                                           // 9+9=18>10 非法
  assert.equal(p.data.lineCustom.bad, true);
  assert.equal(p.question.left, 2);                         // 题目不变
});

/* ── 静态契约 ── */
const ROOT = path.join(__dirname, '..');

test('静态契约:app.json 注册页面/分类页入口/页面四件套', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  assert.ok(app.pages.indexOf('pages/math/methods') >= 0, 'app.json 注册');
  ['methods.js', 'methods.wxml', 'methods.wxss', 'methods.json'].forEach(f => {
    assert.ok(fs.existsSync(path.join(ROOT, 'pages', 'math', f)), '缺少 ' + f);
  });
  const cat = fs.readFileSync(path.join(ROOT, 'pages', 'category', 'category.js'), 'utf8');
  assert.ok(cat.indexOf("name: '数学方法动画课'") >= 0, '分类页有条目');
  assert.ok(cat.indexOf("perm: 'math_methods'") >= 0, '条目挂权限键');
  assert.ok(cat.indexOf("url: '/pages/math/methods'") >= 0, '条目挂路由');
  assert.ok(cat.indexOf("status: 'dev'") >= 0, '口算练习仍为 dev 占位');
});

test('静态契约:wxml 关键分支与 canvas type', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'pages', 'math', 'methods.wxml'), 'utf8');
  assert.ok(wxml.indexOf('type="2d"') >= 0, 'canvas 2d');
  assert.ok(wxml.indexOf('openDemo') >= 0 && wxml.indexOf('onReplay') >= 0, '演示入口与重播');
  assert.ok(wxml.indexOf('onKeyDigit') >= 0 && wxml.indexOf('onBackspace') >= 0 && wxml.indexOf('onSubmit') >= 0, '键盘三件');
  assert.ok(wxml.indexOf('onWriteDirection') >= 0, '书写顺序切换');
  assert.ok(wxml.indexOf('onLinePlay') >= 0, '自定算式行');
  assert.ok(wxml.indexOf('demoVisible') >= 0, '弹窗 wx:if');
  const wxss = fs.readFileSync(path.join(ROOT, 'pages', 'math', 'methods.wxss'), 'utf8');
  assert.ok(wxss.indexOf('shake') >= 0, '答错抖动动画');
  assert.ok(wxss.indexOf('@keyframes') >= 0, 'keyframes');
});

(async () => { await null; })().then(() => console.log('\n' + passed + ' 用例全过\n'));
```

注意：测试文件用 Promise 链串行（答错恢复需要真实 setTimeout），最后统一报过。

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/math-pages.test.js`
Expected: FAIL（`pages/math/methods.js` 不存在，`p.onLoad is not a function`）

- [ ] **Step 3: 写页面四件套**

**`pages/math/methods.json`：**

```json
{
  "navigationBarTitleText": "数学方法动画课",
  "usingComponents": {}
}
```

**`pages/math/methods.js`：**

```js
/* 数学方法动画课:对齐网页端 mora/math-methods.html——选课 → 随机出题 → 数字键盘
   答题 → ▶ 动画演示(canvas 分步讲解)。纯前端自闭环:零接口、零存储、零上报。
   core 算法 utils/math-methods.js(与网页端 math-methods-core.js 同口径);
   舞台布局 utils/math-stage.js(照抄网页端 340×310 坐标);渲染 utils/math-canvas.js。
   权限键 math_methods(与网页端同一功能键),未开通整页拦截。 */
const auth = require('../../utils/auth');
const core = require('../../utils/math-methods');
const stageLib = require('../../utils/math-stage');
const canvasLib = require('../../utils/math-canvas');

/* 每课渐变主色(与网页端 THEMES 同表,顺序即 METHODS 顺序) */
const THEMES = [
  ['#22B8CF', '#0C8599'], ['#FA5252', '#E03131'], ['#FF9500', '#E07000'],
  ['#FF5C8D', '#D6336C'], ['#9775FA', '#7048E8'], ['#4DABF7', '#1C7ED6'],
  ['#20C997', '#0CA678'], ['#748FFC', '#4C6EF5'], ['#F06595', '#D6336C'],
];
const PACE_LINE = 560;   // 线段课每步 ms(网页端同值)
const PACE = 800;        // 其余课每步 ms
const DROP_MS = 400;     // 入场下落时长
const MOVE_MS = 400;     // 青蛙跳跃时长

/* core 题目 → 视图:横式(线段/口诀)或竖式(两位/三位)逐位格 */
function questionView(q) {
  const vertical = stageLib.kindOf(q.methodId) === 'place';
  const digits = vertical ? String(Math.max(q.left, q.right)).length : 0;
  const cells = v => String(v).padStart(digits, ' ').split('')
    .map((d, i) => ({ i: i, d: d === ' ' ? '' : d }));
  return {
    left: q.left, right: q.right, operator: q.operator,
    vertical: vertical, digits: digits,
    topCells: vertical ? cells(q.left) : [],
    bottomCells: vertical ? cells(q.right) : [],
    placeTags: vertical ? ['百', '十', '个'].slice(3 - digits) : [],
  };
}

Page({
  data: {
    blocked: true,        // 权限门:未登录/未开通整页不呈现
    methods: [],          // 选课胶囊视图
    methodIndex: 0,
    lesson: {},           // {title, summary, kicker, c, cd, tip}
    question: null,       // questionView 结果
    input: '',
    inputState: '',       // '' | 'correct' | 'wrong'
    inputLocked: false,   // 答对 or 弹窗打开
    streak: 0,
    writeDirection: 'high-first',
    feedback: { text: '用数字键盘输入答案', cls: '' },
    demoVisible: false,
    animTitle: [],        // 弹窗标题彩色段
    demoTip: '',
    demoSteps: [],        // 文字兜底步骤列表(canvas 初始化失败时)
    lineCustom: null,     // 线段课自定算式 {a, b, op, hint, bad}
    canvasReady: false,
    step: 0,              // 动画当前步
  },

  /* —— 非渲染内部态 —— */
  question: null,         // core 原始题
  stage: null,            // buildStage 结果
  solved: false,
  animTimers: [],
  rafId: 0,
  ctx: null,
  canvasNode: null,
  dropMap: {},            // {元素索引: 入场动画起点 ms}
  markerMove: null,       // 青蛙移动 {from, to, t0}
  markerX: 0,

  onLoad() {
    auth.ensurePerm('math_methods', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.selectMethod(0);
    });
  },

  onUnload() { this.clearAnim(); },
  onHide() { this.clearAnim(); },

  /* ── 选课/出题 ── */
  selectMethod(i) {
    const m = core.METHODS[i];
    this.setData({
      methodIndex: i,
      methods: core.METHODS.map((it, j) => ({ i: j, title: it.title, c: THEMES[j][0], cd: THEMES[j][1], active: j === i })),
      lesson: {
        title: m.title, summary: m.summary, kicker: '第 ' + (i + 1) + ' 课',
        c: THEMES[i][0], cd: THEMES[i][1],
        tip: '小口诀：' + (m.tip || m.summary + '。看清数位，从低位开始算'),
      },
    });
    this.newQuestion();
  },

  onSelectMethod(e) {
    const i = Number(e.currentTarget.dataset.i);
    if (i === this.data.methodIndex || !(i >= 0)) return;
    this.selectMethod(i);
  },

  newQuestion() {
    try {
      this.question = core.makeQuestion(core.METHODS[this.data.methodIndex].id);
    } catch (e) {
      wx.showToast({ title: '出题失败，请重试', icon: 'none' });   // 理论不可达(约束均有解)
      return;
    }
    this.setData({ question: questionView(this.question) });
    this.solved = false;
    this.setData({
      input: '', inputState: '', inputLocked: false,
      feedback: { text: '用数字键盘输入答案', cls: '' },
    });
    this.clearAnim();
    this.setData({ step: 0 });
  },

  onNewQuestion() { this.newQuestion(); },

  /* ── 答题 ── */
  onKeyDigit(e) {
    if (this.data.inputLocked) return;
    const k = e.currentTarget.dataset.k;
    const input = core.writeAnswerDigit(this.data.input, k, this.data.writeDirection, 3);
    this.setData({ input: input, inputState: '', feedback: { text: '用数字键盘输入答案', cls: '' } });
  },

  onBackspace() {
    if (this.data.inputLocked) return;
    this.setData({ input: core.eraseAnswerDigit(this.data.input, this.data.writeDirection), inputState: '' });
  },

  onSubmit() {
    if (this.data.inputLocked) return;
    if (!this.data.input) {
      this.setData({ feedback: { text: '请先输入答案', cls: 'bad' } });
      return;
    }
    if (core.checkAnswer(this.question, this.data.input)) {
      this.solved = true;
      this.setData({
        inputState: 'correct', inputLocked: true, streak: this.data.streak + 1,
        feedback: { text: '✅ 答对啦！可以看动画，也可以换一道题', cls: 'ok' },
      });
    } else {
      this.setData({
        inputState: 'wrong', streak: 0,
        feedback: { text: '再想一想，也可以点动画演示', cls: 'bad' },
      });
      this.animTimers.push(setTimeout(() => this.setData({ inputState: '' }), 320));
    }
  },

  onWriteDirection(e) {
    const d = e.currentTarget.dataset.d;
    if (this.data.inputLocked || !d || d === this.data.writeDirection) return;
    this.setData({
      writeDirection: d, input: '', inputState: '',
      feedback: { text: d === 'ones-first' ? '已切换：先写个位' : '已切换：先写高位', cls: '' },
    });
  },

  /* ── 动画演示弹窗 ── */
  openDemo() {
    this.setData({
      demoVisible: true, inputLocked: true, canvasReady: false, step: 0,
      animTitle: stageLib.titleSegments(this.question).map((s, i) => ({ i: i, text: s.text, color: s.color })),
      demoTip: this.data.lesson.tip,
      demoSteps: core.buildDemoSteps(this.question).map((s, i) => ({ i: i, expression: s.expression, caption: s.caption })),
      lineCustom: this.buildLineCustom(),
    });
    wx.nextTick(() => this.initCanvas(() => this.playAnim()));
  },

  buildLineCustom() {
    const m = core.METHODS[this.data.methodIndex];
    if (m.id !== 'line-add' && m.id !== 'line-sub') return null;
    return {
      a: String(this.question.left), b: String(this.question.right), op: m.operator,
      hint: m.id === 'line-add' ? '两个数都填 1~9，加起来不超过 10' : '起点填 1~10，往回跳 1~9 步，不能跳过 0',
      bad: false,
    };
  },

  onLineInput(e) {
    const f = e.currentTarget.dataset.f;
    if (!f) return;
    const patch = {};
    patch['lineCustom.' + f] = e.detail.value;
    patch['lineCustom.bad'] = false;
    this.setData(patch);
  },

  onLinePlay() {
    const lc = this.data.lineCustom;
    if (!lc) return;
    const q = core.makeLineQuestion(core.METHODS[this.data.methodIndex].id, lc.a, lc.b);
    if (!q) { this.setData({ 'lineCustom.bad': true }); return; }
    this.question = q;
    this.solved = false;
    this.setData({
      question: questionView(q), input: '', inputState: '', inputLocked: true,
      feedback: { text: '用数字键盘输入答案', cls: '' },
      animTitle: stageLib.titleSegments(q).map((s, i) => ({ i: i, text: s.text, color: s.color })),
      demoSteps: core.buildDemoSteps(q).map((s, i) => ({ i: i, expression: s.expression, caption: s.caption })),
    });
    this.playAnim();
  },

  closeDemo() {
    this.clearAnim();
    this.setData({ demoVisible: false, inputLocked: this.solved, step: 0 });
  },
  onCloseDemo() { this.closeDemo(); },
  onBackdrop() { this.closeDemo(); },
  onReplay() { this.playAnim(); },

  /* ── canvas 与动画编排 ── */
  initCanvas(done) {
    wx.createSelectorQuery().in(this).select('#demo-canvas').fields({ node: true, size: true }, res => {
      const node = res && res.node;
      if (!node || !node.getContext) {
        this.setData({ canvasReady: false });   // 文字兜底(wxml demo-fallback)
        return;
      }
      const info = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const dpr = info.pixelRatio || 2;
      node.width = 340 * dpr;
      node.height = 310 * dpr;
      const ctx = node.getContext('2d');
      ctx.scale(dpr, dpr);
      this.canvasNode = node;
      this.ctx = ctx;
      this.setData({ canvasReady: true });
      if (done) done();
    }).exec();
  },

  clearAnim() {
    this.animTimers.forEach(t => clearTimeout(t));
    this.animTimers = [];
    if (this.rafId && this.canvasNode) {
      this.canvasNode.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.dropMap = {};
    this.markerMove = null;
  },

  playAnim() {
    this.clearAnim();
    if (!this.data.canvasReady) return;     // canvas 不可用:文字兜底已列出全部步骤
    this.stage = stageLib.buildStage(this.question, THEMES[this.data.methodIndex][0]);
    const isLine = this.stage.kind === 'line';
    const pace = isLine ? PACE_LINE : PACE;
    const total = this.stage.maxStep;
    this.markerX = isLine ? this.stage.markerX : 0;
    this.reveal(0, true);
    /* 下落口径照抄网页端 playAnim:线段课仅首尾步、口诀课偶数步、竖式课每步 */
    for (let s = 1; s <= total; s += 1) {
      const drop = isLine ? (s === 1 || s === total) : (this.stage.kind !== 'oral' || s % 2 === 0);
      this.animTimers.push(setTimeout(() => this.reveal(s, drop), s * pace));
    }
    this.animTimers.push(setTimeout(() => {
      if (this.rafId && this.canvasNode) { this.canvasNode.cancelAnimationFrame(this.rafId); this.rafId = 0; }
    }, total * pace + DROP_MS + 60));
  },

  reveal(s, drop) {
    if (!this.stage) return;
    this.setData({ step: s });
    if (drop) {
      this.stage.elements.forEach((el, i) => {
        if (el.step === s && el.type !== 'caption') this.dropMap[i] = Date.now();
      });
    }
    if (this.stage.kind === 'line' && s > 1) {
      const hop = this.stage.elements.filter(el => el.type === 'quad' && el.step === s)[0];
      if (hop) this.markerMove = { from: this.markerX, to: hop.markerTo, t0: Date.now() };
    }
    this.startLoop();
  },

  startLoop() {
    if (!this.canvasReady || !this.canvasNode || this.rafId) return;
    const loop = () => {
      if (!this.ctx || !this.stage) return;
      canvasLib.drawStage(this.ctx, this.stage, this.frame());
      this.rafId = this.canvasNode.requestAnimationFrame(loop);
    };
    this.rafId = this.canvasNode.requestAnimationFrame(loop);
  },

  /* 当前帧:入场插值 + 青蛙位置(供 math-canvas 只读) */
  frame() {
    const now = Date.now();
    const drops = {};
    Object.keys(this.dropMap).forEach(i => {
      const p = Math.min(1, (now - this.dropMap[i]) / DROP_MS);
      if (p < 1) drops[i] = { alpha: p, dy: -16 * (1 - p) };
    });
    let markerX = this.markerX;
    if (this.markerMove) {
      const p = Math.min(1, (now - this.markerMove.t0) / MOVE_MS);
      markerX = this.markerMove.from + (this.markerMove.to - this.markerMove.from) * p;
      if (p >= 1) { this.markerX = this.markerMove.to; this.markerMove = null; }
    }
    const step = this.data.step;
    return { step: step, captionStep: this.stage.kind === 'oral' ? null : step, drops: drops, markerX: markerX };
  },
});
```

**`pages/math/methods.wxml`：**

```xml
<!-- 数学方法动画课:对齐网页端 math-methods.html(选课→答题→▶动画演示) -->
<view wx:if="{{blocked}}" class="blocked">
  <view class="blocked-emoji">🧮</view>
  <view class="blocked-title">数学方法动画课未对本家庭开放</view>
</view>
<block wx:else>
  <scroll-view class="toolbar" scroll-x enable-flex show-scrollbar="{{false}}">
    <view class="tb-label">点击要学习的方法</view>
    <view class="method-list">
      <view wx:for="{{methods}}" wx:key="i"
            class="method-btn {{item.active ? 'active' : ''}}"
            style="{{item.active ? 'background:linear-gradient(135deg,' + item.c + ',' + item.cd + ')' : ''}}"
            data-i="{{item.i}}" bindtap="onSelectMethod">{{item.title}}</view>
    </view>
  </scroll-view>

  <view class="score-bar">
    <view class="score lesson">📘 {{lesson.title}}</view>
    <view class="score streak">✅ 连续答对 {{streak}} 题</view>
  </view>

  <view class="q-card" style="border-color:{{lesson.c}}">
    <view class="demo-btn" bindtap="openDemo">▶ 动画演示</view>
    <view class="kicker" style="color:{{lesson.c}}">{{lesson.kicker}}</view>
    <view class="summary">{{lesson.summary}}</view>
    <view class="q-prompt">请先自己算一算</view>

    <view class="stage">
      <view wx:if="{{!question.vertical}}" class="horizontal">
        <view class="num a">{{question.left}}</view>
        <view class="op">{{question.operator}}</view>
        <view class="num b">{{question.right}}</view>
        <view class="op">=</view>
        <view class="answer {{inputState}}">{{input || '?'}}</view>
      </view>
      <view wx:else class="vertical" style="--digits:{{question.digits}}">
        <view class="v-op">{{question.operator}}</view>
        <block wx:for="{{question.topCells}}" wx:key="i">
          <view wx:if="{{item.d}}" class="digit top" style="grid-column:{{item.i + 2}}">{{item.d}}</view>
        </block>
        <block wx:for="{{question.bottomCells}}" wx:key="i">
          <view wx:if="{{item.d}}" class="digit bottom" style="grid-column:{{item.i + 2}}">{{item.d}}</view>
        </block>
        <view class="v-line"></view>
        <view class="answer v-answer {{inputState}}">{{input || '?'}}</view>
      </view>
    </view>
    <view wx:if="{{question.vertical}}" class="place-tags">
      <view wx:for="{{question.placeTags}}" wx:key="*this">{{item}}</view>
    </view>

    <view class="feedback {{feedback.cls}}">{{feedback.text}}</view>

    <view class="write-mode">
      <view class="write-mode-label">✍️ 书写顺序</view>
      <view class="write-mode-options">
        <view class="write-mode-btn {{writeDirection === 'high-first' ? 'on' : ''}}" data-d="high-first" bindtap="onWriteDirection">高位 → 个位</view>
        <view class="write-mode-btn {{writeDirection === 'ones-first' ? 'on' : ''}}" data-d="ones-first" bindtap="onWriteDirection">个位 → 高位</view>
      </view>
    </view>

    <view class="keypad">
      <view class="kp-row">
        <view wx:for="{{[1, 2, 3, 4, 5]}}" wx:key="*this" class="key {{inputLocked ? 'off' : ''}}" data-k="{{item}}" bindtap="onKeyDigit">{{item}}</view>
      </view>
      <view class="kp-row">
        <view wx:for="{{[6, 7, 8, 9, 0]}}" wx:key="*this" class="key {{inputLocked ? 'off' : ''}}" data-k="{{item}}" bindtap="onKeyDigit">{{item}}</view>
      </view>
    </view>

    <view class="action-row">
      <view class="action-btn back {{inputLocked ? 'off' : ''}}" bindtap="onBackspace">⌫ 退格</view>
      <view class="action-btn submit {{inputLocked ? 'off' : ''}}" bindtap="onSubmit">✔ 确认</view>
      <view class="action-btn newq" bindtap="onNewQuestion">🔄 换题</view>
    </view>
  </view>

  <view wx:if="{{demoVisible}}" class="demo-modal">
    <view class="demo-backdrop" bindtap="onBackdrop"></view>
    <view class="demo-card">
      <view class="modal-close" bindtap="onCloseDemo">×</view>
      <view class="anim-area">
        <view class="anim-head">
          <view class="anim-title">
            <block wx:for="{{animTitle}}" wx:key="i">
              <text wx:if="{{item.color}}" style="color:{{item.color}}" class="tt">{{item.text}}</text>
              <text wx:else>{{item.text}}</text>
            </block>
          </view>
          <view class="replay" bindtap="onReplay">🔁 再看一遍</view>
        </view>
        <view class="anim-wrap">
          <canvas type="2d" id="demo-canvas" class="demo-canvas {{canvasReady ? '' : 'hide'}}"></canvas>
          <view wx:if="{{!canvasReady}}" class="demo-fallback">
            <view wx:for="{{demoSteps}}" wx:key="i" class="fallback-step {{step === item.i ? 'cur' : ''}}">
              <text class="fe">{{item.expression}}</text>
              <text class="fc">{{item.caption}}</text>
            </view>
          </view>
        </view>
        <view wx:if="{{lineCustom}}" class="line-custom {{lineCustom.bad ? 'bad' : ''}}">
          <input class="line-input" type="number" maxlength="2" value="{{lineCustom.a}}" data-f="a" bindinput="onLineInput" />
          <text class="line-op">{{lineCustom.op}}</text>
          <input class="line-input" type="number" maxlength="2" value="{{lineCustom.b}}" data-f="b" bindinput="onLineInput" />
          <view class="line-play" bindtap="onLinePlay">▶ 看动画</view>
        </view>
        <view wx:if="{{lineCustom}}" class="line-hint">{{lineCustom.hint}}</view>
      </view>
      <view class="demo-tip">{{demoTip}}</view>
    </view>
  </view>
</block>
```

**`pages/math/methods.wxss`：**（尺寸按 2rpx ≈ 1px 换算网页端）

```css
/* 样式对齐网页端 math-methods.html:彩虹渐变底 + 每课主题色题卡。
   弹窗 canvas 舞台逻辑坐标 340×310px,节点 css 尺寸 680×620rpx(2rpx≈1px)。 */
page {
  background: linear-gradient(135deg, #fff1f2 0%, #fff7e6 30%, #e6f7ff 65%, #f6ffed 100%);
  min-height: 100vh;
}

.blocked { padding: 160rpx 40rpx; text-align: center; }
.blocked-emoji { font-size: 88rpx; }
.blocked-title { margin-top: 24rpx; font-size: 30rpx; font-weight: 800; color: #666; }

/* 选课胶囊 */
.toolbar { display: flex; padding: 20rpx 24rpx 8rpx; white-space: nowrap; }
.tb-label { font-size: 26rpx; font-weight: 800; color: #aaa; margin-right: 6rpx; line-height: 66rpx; }
.method-list { display: inline-flex; gap: 16rpx; }
.method-btn { font-weight: 800; border-radius: 48rpx; padding: 16rpx 30rpx; font-size: 28rpx; color: #888; background: #f5f5f5; }
.method-btn.active { color: #fff; box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, .15); }

/* 分数条 */
.score-bar { display: flex; justify-content: center; gap: 28rpx; margin: 24rpx 0 28rpx; }
.score { background: #fff; border-radius: 40rpx; padding: 12rpx 32rpx; font-size: 28rpx; font-weight: 800; color: #666; box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, .07); }
.score.lesson { color: #4dabf7; }
.score.streak { color: #34c759; }

/* 题卡 */
.q-card { position: relative; background: #fff; border-radius: 48rpx; padding: 116rpx 40rpx 48rpx; margin: 0 28rpx; box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, .12); border: 6rpx solid #4dabf7; text-align: center; }
.demo-btn { position: absolute; top: 28rpx; right: 28rpx; border-radius: 36rpx; padding: 14rpx 26rpx; background: linear-gradient(135deg, #34c759, #1e9e48); color: #fff; font-size: 26rpx; font-weight: 900; box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, .14); }
.kicker { font-size: 40rpx; font-weight: 900; margin-bottom: 4rpx; }
.summary { font-size: 26rpx; color: #999; margin-bottom: 20rpx; }
.q-prompt { font-size: 30rpx; color: #777; font-weight: 800; margin-bottom: 16rpx; }

/* 横式舞台 */
.stage { min-height: 300rpx; display: flex; align-items: center; justify-content: center; padding: 16rpx 0; }
.horizontal { display: flex; justify-content: center; align-items: center; gap: 24rpx; }
.horizontal .num { display: flex; align-items: center; justify-content: center; min-width: 132rpx; height: 132rpx; padding: 0 20rpx; border-radius: 32rpx; color: #fff; font-size: 76rpx; font-weight: 900; text-shadow: 2rpx 2rpx 0 rgba(0, 0, 0, .13); }
.horizontal .num.a { background: #4dabf7; }
.horizontal .num.b { background: #ff9500; }
.horizontal .op, .vertical .v-op { font-size: 64rpx; color: #bbb; font-weight: 900; }

/* 答案框(横式/竖式共用) */
.answer { min-width: 164rpx; height: 112rpx; line-height: 100rpx; padding: 0 20rpx; border-radius: 28rpx; background: #fffae6; border: 6rpx dashed #ff9500; color: #ff9500; font-size: 64rpx; font-weight: 900; box-sizing: border-box; }
.answer.correct { background: #f6ffed; border-style: solid; border-color: #34c759; color: #34c759; }
.answer.wrong { background: #fff0f0; border-style: solid; border-color: #ff5c8d; color: #ff5c8d; animation: shake .28s linear; }

/* 竖式舞台(grid 列数由 --digits 注入) */
.vertical { display: inline-grid; grid-template-columns: 68rpx repeat(var(--digits), 96rpx); grid-auto-rows: 104rpx; align-items: center; text-align: center; font-size: 80rpx; font-weight: 900; }
.vertical .v-op { grid-column: 1; grid-row: 2; font-size: 60rpx; }
.digit { width: 92rpx; height: 100rpx; display: flex; align-items: center; justify-content: center; border-radius: 24rpx; margin: 0 auto; font-size: 72rpx; font-weight: 900; }
.digit.top { grid-row: 1; color: #2f80ed; }
.digit.bottom { grid-row: 2; color: #f77f00; }
.v-line { grid-column: 1 / -1; grid-row: 3; height: 8rpx; background: #999; border-radius: 4rpx; align-self: start; }
.answer.v-answer { grid-column: 2 / -1; grid-row: 4; justify-self: end; margin-top: 8rpx; }
.place-tags { display: flex; justify-content: flex-end; gap: 16rpx; max-width: 440rpx; margin: 8rpx auto 0; color: #aaa; font-size: 22rpx; }

.feedback { min-height: 48rpx; font-size: 28rpx; font-weight: 800; color: #999; margin-top: 16rpx; }
.feedback.ok { color: #1e9e48; }
.feedback.bad { color: #e0306e; }

/* 书写顺序 */
.write-mode { display: flex; align-items: center; justify-content: center; gap: 16rpx; margin: 24rpx auto 0; }
.write-mode-label { color: #777; font-size: 26rpx; font-weight: 900; }
.write-mode-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 540rpx; padding: 6rpx; border: 4rpx solid #dee2e6; border-radius: 24rpx; background: #f8f9fa; box-sizing: border-box; }
.write-mode-btn { height: 72rpx; line-height: 72rpx; border-radius: 16rpx; color: #777; font-size: 26rpx; font-weight: 900; }
.write-mode-btn.on { background: #fff; color: #4dabf7; box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, .12); }

/* 数字键盘 */
.keypad { display: flex; flex-direction: column; align-items: center; gap: 20rpx; margin-top: 24rpx; }
.kp-row { display: flex; justify-content: center; gap: 20rpx; }
.key { font-size: 50rpx; font-weight: 900; width: 116rpx; height: 116rpx; line-height: 110rpx; border: 6rpx solid #eee; border-radius: 32rpx; background: #fafafa; color: #666; box-sizing: border-box; }
.key.off { opacity: .45; }
.action-row { display: flex; justify-content: center; gap: 20rpx; margin-top: 24rpx; }
.action-btn { height: 108rpx; line-height: 108rpx; border-radius: 32rpx; padding: 0 36rpx; font-size: 30rpx; font-weight: 900; color: #fff; box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, .13); }
.action-btn.back { background: linear-gradient(135deg, #ffb347, #ff9500); }
.action-btn.submit { background: linear-gradient(135deg, #34c759, #1e9e48); }
.action-btn.newq { background: linear-gradient(135deg, #4dabf7, #1c7ed6); }
.action-btn.off { opacity: .55; }

/* 演示弹窗 */
.demo-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 28rpx; }
.demo-backdrop { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(37, 48, 66, .5); }
.demo-card { position: relative; z-index: 1; width: 660rpx; max-height: 86vh; overflow-y: auto; background: #fff; border-radius: 48rpx; padding: 40rpx 28rpx 32rpx; box-shadow: 0 32rpx 92rpx rgba(0, 0, 0, .24); border: 6rpx solid #c8d9f2; box-sizing: border-box; }
.modal-close { position: absolute; top: 14rpx; right: 14rpx; z-index: 6; width: 72rpx; height: 72rpx; border-radius: 50%; background: #f1f3f5; color: #666; font-size: 48rpx; font-weight: 900; line-height: 72rpx; text-align: center; }
.anim-area { background: #fff; border: 4rpx solid #c8d9f2; border-radius: 32rpx; padding: 24rpx 16rpx 16rpx; }
.anim-head { display: flex; justify-content: space-between; align-items: center; gap: 16rpx; margin: 0 76rpx 4rpx 0; }
.anim-title { font-size: 26rpx; font-weight: 800; color: #333; line-height: 1.5; text-align: left; flex: 1; }
.anim-title .tt { font-weight: 900; }
.replay { font-size: 24rpx; font-weight: 800; border-radius: 32rpx; padding: 10rpx 22rpx; color: #fff; background: linear-gradient(135deg, #4dabf7, #1c7ed6); box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, .12); flex-shrink: 0; }
.anim-wrap { position: relative; width: 680rpx; height: 620rpx; margin: 0 auto; }
.demo-canvas { width: 680rpx; height: 620rpx; }
.demo-canvas.hide { display: none; }

/* canvas 不可用时的文字兜底 */
.demo-fallback { position: absolute; top: 0; left: 0; right: 0; padding: 16rpx; }
.fallback-step { padding: 14rpx 16rpx; border-radius: 20rpx; background: #f8f9fa; margin-bottom: 12rpx; font-size: 26rpx; color: #777; }
.fallback-step.cur { background: #f2f8ff; border: 3rpx solid #c8d9f2; color: #333; font-weight: 800; }
.fallback-step .fe { font-weight: 900; margin-right: 12rpx; }

/* 线段课自定算式 */
.line-custom { display: flex; justify-content: center; align-items: center; gap: 16rpx; margin-top: 20rpx; }
.line-custom.bad .line-input { border-color: #ff5c8d; background: #fff0f0; animation: shake .28s linear; }
.line-input { width: 104rpx; height: 88rpx; border: 6rpx solid #dee2e6; border-radius: 24rpx; text-align: center; font-size: 44rpx; font-weight: 900; color: #333; background: #fafafa; box-sizing: border-box; }
.line-op { font-size: 48rpx; font-weight: 900; color: #666; }
.line-play { height: 88rpx; line-height: 88rpx; border-radius: 28rpx; padding: 0 32rpx; font-size: 28rpx; font-weight: 900; color: #fff; background: #1c7ed6; box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, .13); }
.line-hint { text-align: center; font-size: 24rpx; color: #aaa; font-weight: 800; margin-top: 12rpx; }
.demo-tip { margin-top: 24rpx; border: 4rpx dashed #ffd666; border-radius: 28rpx; padding: 20rpx 28rpx; font-size: 26rpx; color: #9a6b00; background: #fffef5; text-align: left; }

@keyframes shake {
  25% { transform: translateX(-10rpx); }
  50% { transform: translateX(10rpx); }
  75% { transform: translateX(-6rpx); }
}
```

**`app.json`**：pages 数组中 `"pages/recognition/zen",` 一行之后插入 `"pages/math/methods",`。

**`pages/category/category.js`** 数学组（23–27 行）items 改为：

```js
        items: [
          { name: '数学方法动画课', desc: '数线跳跳 · 凑十破十平十 · 进位借位动画', status: 'ok', url: '/pages/math/methods', perm: 'math_methods' },
          { name: '口算练习', desc: '10/20 以内加减法', status: 'dev' },
        ],
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/math-pages.test.js && node tests/math-methods.test.js`
Expected: 两个文件分别输出 `10 用例全过` 与 `18 用例全过`

- [ ] **Step 5: 提交**

```bash
git add pages/math app.json pages/category/category.js tests/math-pages.test.js
git commit -m "feat: 数学方法动画课页面——分类页数学组入口(perm math_methods)+四件套:9课胶囊选课/横式竖式题卡/数字键盘+书写方向切换+连对/答对锁定答错抖动/▶动画演示弹窗(canvas 2d 分步播放,线段560ms其余800ms,青蛙插值跳落点,线段课自定算式,canvas 失败文字兜底)/弹窗期锁输入;app.json 主包注册,口算练习保持 dev 占位"
```

---

### Task 5: README 同步与全量回归

**Files:**
- Modify: `README.md`（pages 目录树 + 功能说明清单）

**Interfaces:**
- Consumes: Task 1–4 全部产出。
- Produces: 文档口径同步；全量测试绿。

- [ ] **Step 1: README 目录树补行**

在 README.md 目录树 `pages/` 段的 `├── recognition/` 行（39 行附近）之后按字母序插入：

```
    ├── math/               # 数学方法动画课（选课→出题答题→canvas 分步动画演示）
```

- [ ] **Step 2: README 功能说明补段落**

在功能说明清单（「识记学习不带 ⭐ 掌握标记」段之后、「知识点总结」段之前）插入：

```markdown
- 数学方法动画课（分类页「学科 → 数学」）对齐网页端 `math-methods.html`：9 课算术方法（10以内加减·数线跳蛙 / 凑十破十平十·口诀分块 / 两位三位加减·竖式进退位）随机出题 → 数字键盘答题（书写顺序可切高位先/个位先，连对计数）→「▶ 动画演示」canvas 分步讲解（线段课 560ms/步其余 800ms/步，青蛙跳数线、彩色块凑十、进1/借1 弧线，线段课可自定算式重播）。**纯前端自闭环**：与网页端同口径，零接口、零存储、零上报，刷新即失。权限键 `math_methods`（与网页端同一功能键），未开通家庭入口不呈现、深链整页拦截；core 算法与舞台坐标从网页端 `math-methods-core.js`/`math-methods.html` 同步移植，两端变更需同步维护。
```

- [ ] **Step 3: 全量回归**

Run: `for f in tests/*.test.js; do node "$f" > /dev/null 2>&1 && echo "PASS $f" || echo "FAIL $f"; done`
Expected: 全部 PASS（工作区进行中的 `tests/kebiao.test.js` 若 FAIL 为另一份改动所致，单列说明，不在本计划修复范围）

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs: README 同步数学方法动画课——pages 目录树补 math/ 行,功能说明补纯前端自闭环口径(9课/答题/动画演示/权限键/两端同源维护)"
```
