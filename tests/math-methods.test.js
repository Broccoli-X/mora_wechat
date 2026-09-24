/* utils/math-methods.js + utils/math-stage.js + utils/math-canvas.js 的 Node 测试。
   core 算法与网页端 mora/tests/math-methods-core.test.js 同口径(出题范围/步骤快照/
   进退位链式/判答/书写方向),另加舞台布局与渲染器断言。纯函数,无需 mock wx。
   运行:node tests/math-methods.test.js */
const assert = require('assert');
const core = require('../utils/math-methods');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }

/* 简单可复现随机源(mulberry32):出题范围断言用,避免极小概率抖动 */
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
  assert.deepEqual(sub.map(s => s.expression), ['9 - 2', '9 → 8', '8 → 7', '7']);
  assert.equal(sub[3].focus, 'result');
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
  assert.equal(add3[3].expression, '1 + 1 = 2');   // 百位:1+0+1 省略 0 位只列进位
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
  assert.deepEqual(blocks('sc2', 118).map(e => e.text), ['4', '7']);
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
  assert.ok(!rec.calls.some(c => c[0] === 'fillText' && c[1] === '7' && c[2] === 250), '答案块 step=6 未显形不画(数轴刻度 7 除外)');
  assert.ok(texts.indexOf('🐸') >= 0, '青蛙已画');
  const markerText = rec.calls.filter(c => c[0] === 'fillText' && c[1] === '🐸')[0];
  assert.equal(markerText[2], 120);                               // markerX=100 + 块半宽 20
  assert.equal(rec.calls.filter(c => c[0] === 'fillText' && typeof c[1] === 'string' && c[1].indexOf('小青蛙') >= 0).length, 1, '只画当前步字幕');

  const rec2 = makeCtxRecorder();
  canvasLib.drawStage(rec2.ctx, st, { step: 6, captionStep: 6 });
  assert.ok(rec2.calls.some(c => c[0] === 'fillText' && c[1] === '7' && c[2] === 250), '终局答案块已画');
});

test('drawStage:drops 入场插值(translate+globalAlpha)', () => {
  const st = stageLib.buildStage({ methodId: 'make-ten', left: 8, right: 5, operator: '+', answer: 13 });
  const rec = makeCtxRecorder();
  canvasLib.drawStage(rec.ctx, st, { step: 2, drops: { 5: { alpha: 0.5, dy: -8 } } });
  assert.ok(rec.calls.some(c => c[0] === 'set:globalAlpha' && c[1] === 0.5), 'alpha 生效');
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

console.log('\n' + passed + ' 用例全过\n');
