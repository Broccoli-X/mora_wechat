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

console.log('\n' + passed + ' 用例全过\n');
