/* 课表页与首页课程卡的接线测试:mock Page/wx,把 pages/kebiao 的 onShow / 选天 / 下拉刷新和
   pages/index 的课程模块跑一遍,校验 setData。utils 侧逻辑由 tests/kebiao.test.js 覆盖,
   这里只钉页面接线:登录门与 kebiao 功能权限、页签与标题来自在线课表、空堂行、
   下拉刷新保持选中、首页课程卡随刷新更新、未开通不发课表请求。
   不依赖微信环境。运行:node tests/kebiao-pages.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/* ── Page/wx mock:Page 捕获页面配置,实例化后按微信语义做浅合并 setData ── */
let store = new Map();
let reqs = [];
let routes = {};
let page = null;
let stopped = 0;

global.getCurrentPages = () => [{ route: 'pages/kebiao/kebiao', options: {} }];
global.Page = o => { page = o; };
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: () => {},
  stopPullDownRefresh: () => { stopped++; },
  request(o) {
    reqs.push(o.url);
    for (const key of Object.keys(routes)) {
      if (o.url.indexOf(key) >= 0) {
        const r = routes[key];
        if (r === null) { if (o.fail) o.fail(); return; }   // null = 网络失败
        if (o.success) o.success(r);
        return;
      }
    }
    if (o.fail) o.fail();
  },
};

const auth = require('../utils/auth');

/* 在线课表:7 天 × 2 节全部有课——任意日期 / 时刻首页课程卡都有内容可显示,
   断言不依赖跑测试时的时间(只断言科目名前缀) */
function onlineDoc(prefix) {
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  return {
    school: '在线小学', cls: '二(1)班', term: '下学期',
    days: names.map(n => '星期' + n),
    periods: [{ label: '早读', half: '上午', time: '7:50~8:20' },
      { label: '第1节', half: '上午', time: '8:35~9:15' }],
    routine: [],
    grid: [names.map(() => [prefix + '课A', '张老师', '']),
      names.map(() => [prefix + '课B', '李老师', '带课本'])],     // 行 = 节次,列 = 星期
    meta: {},
  };
}
const KB_OK = { statusCode: 200, data: { ok: true, data: onlineDoc('新'), updatedAt: 200 } };
const PERMS_ALL = { statusCode: 200, data: { ok: true, perms: ['*'], family: 'mora', mustChange: false } };
const PERMS_NONE = { statusCode: 200, data: { ok: true, perms: ['poems'], family: 'quan', mustChange: false } };

function reset(extraRoutes, perms) {
  store.clear();
  reqs = [];
  stopped = 0;
  routes = Object.assign({ '/api/perms': PERMS_ALL, '/api/kebiao?': KB_OK }, extraRoutes || {});
  store.set('mora-auth-token', 'T');
  store.set('mora-auth-family', 'mora');
  if (perms) store.set('mora-auth-perms', JSON.stringify(perms));
  auth.gateShown();
}

/* 载入页面文件并实例化(setData 浅合并);同时重置 utils/kebiao 的内存状态,
   页面 require 到的就是这份刚重置的实例 */
function load(rel) {
  page = null;
  delete require.cache[require.resolve('../utils/kebiao')];
  require('../utils/kebiao');
  const file = path.join(__dirname, '..', rel);
  delete require.cache[require.resolve(file)];
  require(file);
  const inst = Object.create(page);
  inst.data = JSON.parse(JSON.stringify(page.data));
  inst.setData = function (patch) { Object.assign(this.data, patch); };
  return inst;
}

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }

test('课表页:未开通 kebiao 整页拦截,不拉课表', () => {
  reset({ '/api/perms': PERMS_NONE });
  const p = load('pages/kebiao/kebiao.js');
  p.onShow();
  assert.strictEqual(p.data.blocked, true);
  assert.ok(!reqs.some(u => u.indexOf('/api/kebiao') >= 0), '未开通不应拉课表');
});

test('课表页:页签 / 学校班级 / 学期 / 节次都来自在线课表,选中今天所在的列', () => {
  reset();
  const p = load('pages/kebiao/kebiao.js');
  p.onShow();
  assert.strictEqual(p.data.blocked, false);
  assert.strictEqual(p.data.tabs.length, 7, '星期页签来自在线课表');
  assert.strictEqual(p.data.tabs[0], '周一');
  assert.strictEqual(p.data.subLine, '在线小学 · 二(1)班');
  assert.strictEqual(p.data.term, '下学期');
  assert.deepStrictEqual(p.data.rows.map(r => r.label), ['早读', '第1节']);
  assert.ok(p.data.rows.every(r => r.subject.indexOf('新课') === 0), '课程来自在线课表');
  assert.ok(reqs.some(u => u.indexOf('/api/kebiao?token=T') >= 0), '应带 token 拉课表');
  const w = new Date().getDay();
  assert.strictEqual(p.data.selected, w === 0 ? 6 : w - 1, '选中今天所在的列');
  assert.strictEqual(p.data.isRest, false, '在线课表排了周末,不再是休息日');
  const today = p.data.rows.filter(r => r.isNow).length;
  assert.ok(today === 0 || today === 1, '最多一节高亮为「现在」');
});

test('课表页:空堂一行显示「空」;选中星期后下拉刷新保持选中', () => {
  const doc = onlineDoc('新');
  doc.grid[1][2] = ['', '', ''];                      // 周三(第 3 列)第 1 节(第 2 行)是空堂
  reset({ '/api/kebiao?': { statusCode: 200, data: { ok: true, data: doc, updatedAt: 200 } } });
  const p = load('pages/kebiao/kebiao.js');
  p.onShow();
  p.selectDay({ currentTarget: { dataset: { index: 2 } } });
  assert.strictEqual(p.data.selected, 2);
  assert.strictEqual(p.data.rows[0].subject, '新课A');
  assert.strictEqual(p.data.rows[1].empty, true);
  assert.strictEqual(p.data.rows[1].subject, '');
  assert.strictEqual(p.data.rows[1].idx, 1, '列表 key 用序号(节次名称可能重复)');
  p.onPullDownRefresh();
  assert.strictEqual(stopped, 1, '下拉刷新完成后收起');
  assert.strictEqual(p.data.selected, 2, '刷新重绘保持选中的星期');
  assert.strictEqual(p.data.rows[1].empty, true);
});

test('首页课程卡:开通课表时拉在线课表,课程卡来自在线课表;拉完才收起下拉刷新', () => {
  reset({}, ['kebiao']);
  const p = load('pages/index/index.js');
  p.applyPerms();
  assert.strictEqual(p.data.courseAllowed, true);
  assert.strictEqual(p.data.course.show, true);
  assert.ok(reqs.some(u => u.indexOf('/api/kebiao?token=T') >= 0), '应拉在线课表');
  assert.ok(p.data.course.subject.indexOf('新课') === 0, '课程卡来自在线课表:' + p.data.course.subject);
  assert.ok(p.data.course.title === '今日课程' || p.data.course.title === '次日课程');
  let done = false;
  p.applyPerms(() => { done = true; });
  assert.strictEqual(done, true, '课表拉取完成后才收起下拉刷新');
});

test('首页课程卡:未开通课表 → 整块不显示,也不发课表请求', () => {
  reset({}, ['poems']);
  const p = load('pages/index/index.js');
  p.applyPerms();
  assert.strictEqual(p.data.courseAllowed, false);
  assert.deepStrictEqual(p.data.course, { show: false });
  assert.ok(!reqs.some(u => u.indexOf('/api/kebiao') >= 0), '未开通不应拉课表');
});

test('接线契约:课表页开了下拉刷新、空堂样式、序号 key;小程序端只读、没有维护页', () => {
  const root = path.join(__dirname, '..');
  const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
  assert.strictEqual(JSON.parse(read('pages/kebiao/kebiao.json')).enablePullDownRefresh, true,
    '课表页应开下拉刷新');
  const wxml = read('pages/kebiao/kebiao.wxml');
  assert.ok(wxml.indexOf('wx:key="idx"') >= 0, '列表 key 用序号');
  assert.ok(wxml.indexOf('chip-empty') >= 0 && wxml.indexOf('>空</view>') >= 0, '空堂行');
  assert.ok(wxml.indexOf('{{subLine}}') >= 0, '学校 / 班级拼成一行,空段不显示');
  assert.ok(read('pages/kebiao/kebiao.wxss').indexOf('.chip-empty') >= 0, '空堂样式');
  assert.ok(read('pages/category/category.js').indexOf("url: '/pages/kebiao/kebiao', perm: 'kebiao'") >= 0,
    '分类页入口与权限不变');
  const util = read('utils/kebiao.js');
  assert.ok(util.indexOf("'/api/kebiao?token='") >= 0, '读在线课表接口');
  assert.ok(util.indexOf("method: 'PUT'") < 0, '小程序端只读,不写课表');
  assert.strictEqual(fs.existsSync(path.join(root, 'pages', 'kebiao-edit')), false, '小程序不做维护页');
});

console.log('\n全部通过:' + passed + ' 个用例');
