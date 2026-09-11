/* 换卡动画重放的静态契约测试:左右切换靠「seq 奇偶交替类名」强制 CSS 动画重放——
   前提是同一方向下奇偶两个类名必须绑**不同的 animation-name**(CSS 规范:动画名不变不重放,
   people.wxss 曾因奇偶共名导致第二次滑动起无动画)。直接解析 wxss 校验,防回归。
   运行:node tests/cards-css.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'pages', name), 'utf8');
}

/* wxss → { 类名: animation-name },仅收绑定 animation 的类选择器;组选择器逐个展开 */
function animOfClass(css) {
  const map = {};
  css = css.replace(/\/\*[\s\S]*?\*\//g, ''); /* 先剥注释,防注释文本黏进首选择器 */
  for (const block of css.split('}')) {
    const m = block.match(/([^{}]*)\{([^{}]*)/);
    if (!m) continue;
    const anim = m[2].match(/animation:\s*([A-Za-z][\w-]*)/);
    if (!anim) continue;
    m[1].split(',').forEach(sel => {
      const cls = sel.trim().match(/^\.([A-Za-z][\w-]*)$/);
      if (cls) map[cls[1]] = anim[1];
    });
  }
  return map;
}

function keyframesOf(css) {
  const names = new Set();
  for (const m of css.matchAll(/@keyframes\s+([A-Za-z][\w-]*)/g)) names.add(m[1]);
  return names;
}

/* 契约:类名都存在;同方向奇偶异名;全部动画名互异;引用的 keyframes 都有定义 */
function assertSwapContract(css, classes, label) {
  const anim = animOfClass(css);
  const names = [];
  for (const c of classes) {
    assert.ok(anim[c], label + ' 缺少 ' + c + ' 的 animation 绑定');
    names.push(anim[c]);
  }
  for (const c of classes) {
    const paritySwap = c.replace(/[01]$/, m => m === '0' ? '1' : '0');
    assert.notEqual(anim[c], anim[paritySwap],
      label + ' 同方向奇偶类名 ' + c + '/' + paritySwap + ' 同动画名 ' + anim[c] + ',第二次滑动不会重放');
  }
  assert.strictEqual(new Set(names).size, names.length, label + ' 各类名动画名应互不重复');
  const kf = keyframesOf(css);
  for (const n of names) assert.ok(kf.has(n), label + ' 动画 ' + n + ' 缺 @keyframes 定义');
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

test('people 弹层换人动画:swap-{l,r}-{0,1} 四类名奇偶异名,seq 交替可强制重放', () => {
  assertSwapContract(read('people' + '/people.wxss'),
    ['swap-l-0', 'swap-l-1', 'swap-r-0', 'swap-r-1'], 'people.wxss');
});

test('letters zen 换卡动画:in/out 各方向奇偶异名(8 类名),滑动始终重放', () => {
  assertSwapContract(read('letters' + '/zen.wxss'),
    ['in-l-0', 'in-l-1', 'in-r-0', 'in-r-1', 'out-l-0', 'out-l-1', 'out-r-0', 'out-r-1'], 'zen.wxss');
});

test('poems zen 换卡动画:in/out 各方向奇偶异名(8 类名),滑动始终重放', () => {
  assertSwapContract(read('poems' + '/zen.wxss'),
    ['in-l-0', 'in-l-1', 'in-r-0', 'in-r-1', 'out-l-0', 'out-l-1', 'out-r-0', 'out-r-1'], 'zen.wxss');
});

test('recognition zen 换卡动画:in/out 各方向奇偶异名(8 类名),滑动始终重放', () => {
  assertSwapContract(read('recognition' + '/zen.wxss'),
    ['in-l-0', 'in-l-1', 'in-r-0', 'in-r-1', 'out-l-0', 'out-l-1', 'out-r-0', 'out-r-1'], 'zen.wxss');
});

console.log('\n全部通过:' + passed + ' 个用例');
