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
const testPromises = [];
function test(name, fn) {
  const pr = Promise.resolve().then(fn).then(() => { passed++; console.log('✓ ' + name); });
  testPromises.push(pr);
  return pr;
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
  assert.equal(p.data.input, '21');                         // 个位先:后按的键在最左
  p.onBackspace();
  assert.equal(p.data.input, '1');                          // 退格撤销最后按的 '2'
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
  p.onBackspace();                                          // 答错输入保留,退格清掉再改
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
  assert.ok(rafCbs.length > 0, 'rAF 绘制循环已启动(canvas 真正开始画)');
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

Promise.all(testPromises).then(() => console.log('\n' + passed + ' 用例全过\n'));
