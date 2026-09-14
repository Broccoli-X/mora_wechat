/* 作业维护页(pages/hw-edit)的接线测试:mock Page/wx,把 onLoad/翻天/提交跑一遍,
   校验 setData 与上报载荷。这次改动的主体是「可提前登记今天以后的作业」:
   日期选择器不得再带 end 上限(静态契约,防手滑加回)、‹ › 翻天接线、
   未来条目的列表筛选与今天/明天胶囊、存完仍停在所选日期、编辑中改日期如实提示并按新日期落库。
   utils 侧由 tests/homework.test.js 覆盖。不依赖微信环境。
   运行:node tests/hw-edit-pages.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/* ── Page/wx mock:Page 捕获页面配置,实例化后按微信语义做浅合并 setData ── */
let store = new Map();
let requests = [];
let routes = {};
let page = null;
let toasts = [];

global.getCurrentPages = () => [{ route: 'pages/hw-edit/hw-edit', options: {} }];
global.Page = o => { page = o; };
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: () => {},
  showToast: o => toasts.push(o.title),
  stopPullDownRefresh: () => {},
  pageScrollTo: () => {},
  request(o) {
    requests.push(o);
    for (const key of Object.keys(routes)) {
      if (o.url.indexOf(key) >= 0) {
        if (o.success) o.success(routes[key]);
        return;
      }
    }
    if (o.fail) o.fail();
  },
};

const auth = require('../utils/auth');
const hw = require('../utils/homework');

/* 相对今天的日期串:页面自己按真实今天算,fixture 必须同源 */
function dayStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return hw.toDateStr(d);
}
const YEST = dayStr(-1);
const TODAY = dayStr(0);
const TOM = dayStr(1);
const AFTER = dayStr(2);
const DAY4 = dayStr(3);

/* 服务端进度条目便捷构造 */
function item(id, dateStr, subject, text, updatedAt) {
  return {
    module: 'homework', itemKey: id, updatedAt: updatedAt || 100,
    payload: JSON.stringify({ d: dateStr, s: subject, t: text }),
  };
}
function progress(items) { return { statusCode: 200, data: { ok: true, items: items } }; }

/* 载入页面文件并实例化(setData 支持 'a.b' 这类路径,与微信同款) */
function load() {
  page = null;
  const file = path.join(__dirname, '..', 'pages', 'hw-edit', 'hw-edit.js');
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

function reset(extraRoutes) {
  store.clear();
  requests = [];
  toasts = [];
  routes = Object.assign(
    { '/api/perms': { statusCode: 200, data: { ok: true, perms: ['homework'] } } },
    extraRoutes || {});
  store.set('mora-auth-token', 'T');
  auth.gateShown();
}

function posts() { return requests.filter(r => r.method === 'POST'); }

let passed = 0;
function test(name, fn) { reset(); fn(); passed++; console.log('✓ ' + name); }

/* ── 静态契约:日期选择器不设上限(未来日期可登记) ── */
test('静态契约:日期选择器无 end/start 上限,‹ › 翻天接线在位,无「回到今天」按钮', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'hw-edit', 'hw-edit.wxml'), 'utf8');
  const pickers = wxml.match(/<picker[^>]*>/g) || [];
  assert.strictEqual(pickers.length, 1, '只有日期一个 picker: ' + pickers.length);
  assert.ok(!/\bend=/.test(pickers[0]), '不得再给日期加 end 上限(挡掉今天以后的作业): ' + pickers[0]);
  assert.ok(!/\bstart=/.test(pickers[0]), '不得给日期加 start 下界: ' + pickers[0]);
  assert.ok(/bindchange="onDate"/.test(pickers[0]), '选日期仍走 onDate');
  assert.ok(wxml.indexOf('bindtap="prevDay"') >= 0, '‹ 翻前一天在位');
  assert.ok(wxml.indexOf('bindtap="nextDay"') >= 0, '› 翻后一天在位');
  assert.ok(wxml.indexOf('backToToday') < 0, '不要「回到今天」按钮(用户明示,回今天走日期选择器)');
});

/* ── 进页与翻天 ── */
test('进页:默认今天 + 「今天」胶囊,列表只列当天已登记的(未来条目不混进来)', () => {
  reset({ '/api/progress': progress([
    item('hwtoday1', TODAY, '语文', '今天读课文'),
    item('hwtom1', TOM, '数学', '明天口算一页'),
  ]) });
  const p = load();
  p.onLoad();
  assert.strictEqual(p.data.blocked, false);
  assert.strictEqual(p.data.date, TODAY);
  assert.strictEqual(p.data.relLabel, '今天');
  assert.strictEqual(p.data.rows.length, 1, '只列当天: ' + JSON.stringify(p.data.rows));
  assert.strictEqual(p.data.rows[0].id, 'hwtoday1');
  assert.strictEqual(p.entries.length, 2, '两个条目都进了本地数组,换天不用重拉');
});

test('点 › 到明天:列表换成明天的,胶囊「明天」', () => {
  reset({ '/api/progress': progress([
    item('hwtoday1', TODAY, '语文', '今天读课文'),
    item('hwtom1', TOM, '数学', '明天口算一页'),
  ]) });
  const p = load();
  p.onLoad();
  assert.strictEqual(p.data.emptyNote, '这天还没有登记作业', '今天的空列表不提提前登记');
  p.nextDay();
  assert.strictEqual(p.data.date, TOM);
  assert.strictEqual(p.data.relLabel, '明天');
  assert.strictEqual(p.data.rows.length, 1);
  assert.strictEqual(p.data.rows[0].id, 'hwtom1');
});

test('翻天:‹ 到昨天带「昨天」胶囊(空白天不提前登记);翻远了不再称呼,日期器选回今天', () => {
  reset({ '/api/progress': progress([item('hwtoday1', TODAY, '语文', '今天读课文')]) });
  const p = load();
  p.onLoad();
  p.prevDay();
  assert.strictEqual(p.data.date, YEST);
  assert.strictEqual(p.data.relLabel, '昨天');
  assert.strictEqual(p.data.emptyNote, '这天还没有登记作业', '过去的空白天不提提前登记');
  p.onDate({ detail: { value: TODAY } });
  assert.strictEqual(p.data.date, TODAY);
  assert.strictEqual(p.data.relLabel, '今天');
  p.nextDay();
  p.nextDay();
  assert.strictEqual(p.data.date, AFTER);
  assert.strictEqual(p.data.relLabel, '后天');
  assert.strictEqual(p.data.emptyNote, '这天还没有登记作业,可在上面提前登记');
  p.nextDay();
  assert.strictEqual(p.data.date, DAY4);
  assert.strictEqual(p.data.relLabel, '', '后天之后不再称呼,回今天走日期选择器');
  p.onDate({ detail: { value: TODAY } });
  assert.strictEqual(p.data.date, TODAY);
  assert.strictEqual(p.data.relLabel, '今天');
});

/* ── 提前登记:存完停在所选日期 ── */
test('登记明天的作业:上报日期是明天,存完仍停在明天(连着录几科不用重选日期),表单清空', () => {
  reset({ '/api/progress': progress([]) });
  const p = load();
  p.onLoad();
  p.nextDay();
  p.pickSubject({ currentTarget: { dataset: { s: '数学' } } });
  p.onText({ detail: { value: '  口算一页  ' } });
  p.submit();
  const post = posts()[0];
  assert.ok(post, '发起了上报');
  assert.strictEqual(post.data.items[0].module, 'homework');
  const payload = JSON.parse(post.data.items[0].payload);
  assert.strictEqual(payload.d, TOM, '落库日期是明天');
  assert.strictEqual(payload.t, '口算一页', '内容去首尾空格');
  assert.strictEqual(p.data.date, TOM, '存完不跳回今天');
  assert.strictEqual(p.data.relLabel, '明天');
  assert.strictEqual(p.data.text, '', '表单已清空');
  assert.deepStrictEqual(toasts, ['已登记 ✓']);
  assert.strictEqual(p.data.rows.length, 1, '乐观上列表');
  assert.strictEqual(p.data.rows[0].subject, '数学');
});

/* ── 编辑:改日期如实提示并按新日期覆盖 ── */
test('编辑中翻天:横幅写成「原日期 · 科目 → 新日期」,保存按新日期覆盖同 id', () => {
  reset({ '/api/progress': progress([item('hwtom1', TOM, '数学', '明天口算一页')]) });
  const p = load();
  p.onLoad();
  p.nextDay();
  p.editRow({ currentTarget: { dataset: { id: 'hwtom1' } } });
  assert.strictEqual(p.data.editing, true);
  assert.strictEqual(p.data.editingLabel, hw.fmtCN(TOM) + ' · 数学');
  assert.strictEqual(p.data.text, '明天口算一页');

  p.nextDay();
  assert.strictEqual(p.data.date, AFTER);
  assert.strictEqual(p.data.editingLabel, hw.fmtCN(TOM) + ' · 数学 → ' + hw.fmtCN(AFTER),
    '改了日期必须提示,否则悄悄挪走作业');
  p.onText({ detail: { value: '改到后天做' } });
  p.submit();
  const post = posts()[0];
  assert.strictEqual(post.data.items[0].itemKey, 'hwtom1', '同 id 覆盖');
  const payload = JSON.parse(post.data.items[0].payload);
  assert.strictEqual(payload.d, AFTER);
  assert.strictEqual(payload.t, '改到后天做');
  assert.strictEqual(p.data.date, AFTER, '存完停在改后的日期');
  assert.strictEqual(p.data.editing, false, '回到新增态');
  assert.strictEqual(p.data.editingLabel, '');
  assert.ok(p.data.rows.some(r => r.id === 'hwtom1'), '列表按新日期重新筛过');
});

test('取消编辑:清掉编辑态与表单,日期留在原地(不跳回今天)', () => {
  reset({ '/api/progress': progress([item('hwtom1', TOM, '数学', '明天口算一页')]) });
  const p = load();
  p.onLoad();
  p.nextDay();
  p.editRow({ currentTarget: { dataset: { id: 'hwtom1' } } });
  p.cancelEdit();
  assert.strictEqual(p.data.editing, false);
  assert.strictEqual(p.data.text, '');
  assert.strictEqual(p.data.date, TOM);
  assert.strictEqual(p.data.relLabel, '明天');
});

/* ── 权限门 ── */
test('未开通 homework:整页拦截且不取作业数据', () => {
  reset({ '/api/perms': { statusCode: 200, data: { ok: true, perms: ['todo'] } } });
  const p = load();
  p.onLoad();
  assert.strictEqual(p.data.blocked, true);
  assert.ok(!requests.some(r => r.url.indexOf('/api/progress') >= 0), '未开通不取数');
});

console.log('\n全部通过:' + passed + ' 个用例');
