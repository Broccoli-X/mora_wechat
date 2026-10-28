/* 成语卡片两个页面的接线测试:mock Page/wx,把 onShow/onLoad/搜索跑一遍,校验 setData。
   utils 侧逻辑由 tests/chengyu.test.js 覆盖,这里只钉页面接线:
   登录门与 chengyu 功能权限、缓存先渲染、远端刷新、搜索过滤/清空、
   空库与失败区分、点卡跳详情、详情定位与典故条件渲染、分类入口与 app.json 注册。
   运行:node tests/chengyu-pages.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/* ── Page/wx mock:Page 捕获页面配置,实例化后按微信语义做浅合并 setData ── */
let store = new Map();
let reqs = [];
let routes = {};
let page = null;
let navs = [];
let gated = false;

global.getCurrentPages = () => [{ route: 'pages/chengyu/chengyu', options: {} }];
global.Page = o => { page = o; };
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  getWindowInfo: () => ({ statusBarHeight: 47 }),
  navigateTo: o => navs.push(o.url),
  navigateBack: () => navs.push('back'),
  reLaunch: o => { gated = true; navs.push('reLaunch:' + o.url); },
  stopPullDownRefresh: () => {},
  vibrateShort: () => {},
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

const CACHE_KEY = 'mora-chengyu-v1';
const CACHE = { updatedAt: 100, data: [
  { w: '画蛇添足', p: 'huà shé tiān zú', m: '比喻做了多余的事', d: '《战国策》' },
  { w: '守株待兔', p: '', m: '比喻不劳而获', d: '' },
] };
const REMOTE = { updatedAt: 200, data: [
  { w: '画蛇添足', p: 'huà shé tiān zú', m: '比喻做了多余的事', d: '《战国策》' },
  { w: '守株待兔', p: '', m: '比喻不劳而获', d: '' },
  { w: '亡羊补牢', p: 'wáng yáng bǔ láo', m: '出了问题及时补救', d: '' },
] };
const LIST_OK = { statusCode: 200, data: { ok: true, data: REMOTE.data, updatedAt: REMOTE.updatedAt } };
const EMPTY_OK = { statusCode: 200, data: { ok: true, data: null, updatedAt: 0 } };
const PERMS_ALL = { statusCode: 200, data: { ok: true, perms: ['*'], family: 'mora', mustChange: false } };
const PERMS_NONE = { statusCode: 200, data: { ok: true, perms: [], family: 'quan', mustChange: false } };

function reset(extraRoutes, { token = true, perms } = {}) {
  store.clear();
  reqs = []; navs = []; gated = false;
  routes = Object.assign({ '/api/perms': PERMS_ALL }, extraRoutes || {});
  if (token) store.set('mora-auth-token', 'T');
  if (perms) store.set('mora-auth-perms', perms);
}

/* 载入页面并实例化(setData 浅合并);同时重置 utils 的内存状态 */
function load(file) {
  page = null;
  delete require.cache[require.resolve('../utils/chengyu')];
  require('../utils/chengyu');
  delete require.cache[require.resolve(file)];
  require(file);
  const inst = Object.create(page);
  inst.data = JSON.parse(JSON.stringify(page.data));
  inst.setData = function (patch) { Object.assign(this.data, patch); };
  return inst;
}
const P = name => path.join(__dirname, '..', 'pages', 'chengyu', name);

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }

/* ── 列表页 ── */
test('列表页:未登录弹登录门且不发起取数', () => {
  reset({ '/api/chengyu?': LIST_OK }, { token: false });
  const p = load(P('chengyu.js'));
  p.onShow();
  assert.ok(navs.some(u => u.indexOf('/pages/login/login') >= 0), '应弹登录门');
  assert.ok(!reqs.some(u => u.indexOf('/api/chengyu') >= 0), '未登录不取数');
});

test('列表页:缓存先渲染,远端更新后整库重渲染', () => {
  reset({ '/api/chengyu?': LIST_OK, '/api/perms': PERMS_ALL });
  store.set(CACHE_KEY, CACHE);
  const p = load(P('chengyu.js'));
  p.onShow();
  assert.equal(p.data.blocked, false);
  assert.equal(p.data.total, 3, '远端较新应覆盖缓存');
  assert.deepEqual(p.data.items.map(e => e.w), ['画蛇添足', '守株待兔', '亡羊补牢']);
  assert.equal(p.data.loading, false);
  assert.equal(p.data.empty, false);
  assert.ok(reqs.some(u => u.indexOf('/api/chengyu?token=T') >= 0), '应带 token 拉整库');
});

test('列表页:搜索按成语/拼音/意思过滤,清空恢复;点卡跳详情(中文编码)', () => {
  reset({ '/api/chengyu?': LIST_OK }, { perms: ['*'] });
  store.set(CACHE_KEY, CACHE);
  const p = load(P('chengyu.js'));
  p.onShow();
  p.onSearchInput({ detail: { value: '画蛇' } });
  assert.deepEqual(p.data.items.map(e => e.w), ['画蛇添足']);
  assert.equal(p.data.noMatch, false);
  p.onSearchInput({ detail: { value: 'WÁNG' } });
  assert.deepEqual(p.data.items.map(e => e.w), ['亡羊补牢']);
  p.onSearchInput({ detail: { value: '不存在的成语' } });
  assert.deepEqual(p.data.items, []);
  assert.equal(p.data.noMatch, true);
  p.onClearSearch();
  assert.equal(p.data.keyword, '');
  assert.equal(p.data.items.length, 3);
  p.onTapItem({ currentTarget: { dataset: { w: '画蛇添足' } } });
  assert.equal(navs[0], '/pages/chengyu/detail?w=' + encodeURIComponent('画蛇添足'));
});

test('列表页:空库给引导文案;失败且无缓存才报错', () => {
  reset({ '/api/chengyu?': EMPTY_OK }, { perms: ['*'] });
  let p = load(P('chengyu.js'));
  p.onShow();
  assert.equal(p.data.empty, true);
  assert.equal(p.data.loadError, false);
  assert.equal(p.data.total, 0);

  reset({ '/api/chengyu?': null }, { perms: ['*'] });
  p = load(P('chengyu.js'));
  p.onShow();
  assert.equal(p.data.loadError, true);
  assert.equal(p.data.empty, false);
});

test('列表页:未开通 chengyu 功能 → blocked,且不取成语库', () => {
  reset({ '/api/chengyu?': LIST_OK, '/api/perms': PERMS_NONE }, { perms: [] });
  const p = load(P('chengyu.js'));
  p.onShow();
  assert.equal(p.data.blocked, true);
  assert.ok(!reqs.some(u => u.indexOf('/api/chengyu') >= 0), '无权限不取数');
});

/* ── 详情页 ── */
test('详情页:缓存定位渲染(成语/拼音/意思/典故)', () => {
  reset({}, { perms: ['*'] });
  store.set(CACHE_KEY, CACHE);
  const p = load(P('detail.js'));
  p.onLoad({ w: encodeURIComponent('画蛇添足') });
  assert.equal(p.data.loading, false);
  assert.equal(p.data.entry.w, '画蛇添足');
  assert.equal(p.data.entry.p, 'huà shé tiān zú');
  assert.equal(p.data.entry.m, '比喻做了多余的事');
  assert.equal(p.data.entry.d, '《战国策》');
  assert.ok(!reqs.some(u => u.indexOf('/api/chengyu') >= 0), '缓存命中不再请求');
});

test('详情页:d 为空时典故为空串(wxml 条件不渲染)', () => {
  reset({}, { perms: ['*'] });
  store.set(CACHE_KEY, CACHE);
  const p = load(P('detail.js'));
  p.onLoad({ w: encodeURIComponent('守株待兔') });
  assert.equal(p.data.entry.d, '');
});

test('详情页:缓存没有则拉远端再渲染', () => {
  reset({ '/api/chengyu?': LIST_OK }, { perms: ['*'] });
  const p = load(P('detail.js'));
  p.onLoad({ w: encodeURIComponent('亡羊补牢') });
  assert.equal(p.data.entry.w, '亡羊补牢');
  assert.equal(p.data.entry.m, '出了问题及时补救');
  assert.ok(reqs.some(u => u.indexOf('/api/chengyu?token=T') >= 0), '无缓存应拉一次');
});

test('详情页:确实没有这条 → notFound;网络失败且无缓存 → loadError', () => {
  reset({ '/api/chengyu?': LIST_OK }, { perms: ['*'] });
  let p = load(P('detail.js'));
  p.onLoad({ w: encodeURIComponent('没有这条') });
  assert.equal(p.data.notFound, true);
  assert.equal(p.data.loadError, false);

  reset({ '/api/chengyu?': null }, { perms: ['*'] });
  p = load(P('detail.js'));
  p.onLoad({ w: encodeURIComponent('画蛇添足') });
  assert.equal(p.data.loadError, true);
  assert.equal(p.data.notFound, false);
});

/* ── 静态契约:页面结构 / 分类入口 / app.json ── */
test('列表页 wxml:搜索框、卡片四要素、空库与无结果文案', () => {
  const wxml = fs.readFileSync(P('chengyu.wxml'), 'utf8');
  assert.ok(/bindinput="onSearchInput"/.test(wxml), '搜索输入接线');
  assert.ok(/wx:key="w"/.test(wxml), '以成语为 key');
  assert.ok(/\{\{item\.w\}\}/.test(wxml) && /\{\{item\.p\}\}/.test(wxml) && /\{\{item\.m\}\}/.test(wxml),
    '卡片 = 成语 + 拼音 + 意思');
  assert.ok(/还没有成语/.test(wxml) && /请家长在网页端「成语录入」/.test(wxml), '空库引导');
  assert.ok(/没有匹配的成语/.test(wxml), '搜索无结果文案');
  assert.ok(/bindtap="onTapItem"/.test(wxml), '点卡进详情');
});

test('详情页 wxml:典故卡条件渲染,d 为空不展示', () => {
  const wxml = fs.readFileSync(P('detail.wxml'), 'utf8');
  assert.ok(/wx:if="\{\{entry\.d\}\}"/.test(wxml), '典故卡按 d 条件渲染');
  assert.ok(/📜 典故 \/ 出处/.test(wxml), '典故卡标题');
  assert.ok(/💡 意思/.test(wxml), '意思卡');
  assert.ok(/没有找到这条成语/.test(wxml), '不存在文案');
});

test('分类入口:语文组新增成语卡片,perm=chengyu;无权限时不呈现', () => {
  reset({ '/api/perms': PERMS_ALL }, { perms: ['*'] });
  let p = load(path.join(__dirname, '..', 'pages', 'category', 'category.js'));
  p.onShow();
  const names = [];
  p.data.groups.forEach(g => g.subjects.forEach(s => s.items.forEach(it => names.push(it.name))));
  assert.ok(names.indexOf('成语卡片') >= 0, '有权限时应出现');

  reset({ '/api/perms': PERMS_NONE }, { perms: [] });
  p = load(path.join(__dirname, '..', 'pages', 'category', 'category.js'));
  p.onShow();
  const names2 = [];
  p.data.groups.forEach(g => g.subjects.forEach(s => s.items.forEach(it => names2.push(it.name))));
  assert.ok(names2.indexOf('成语卡片') < 0, '未开通 chengyu 时不呈现');
});

test('app.json 注册两个页面;分类入口带 perm 与 url', () => {
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  assert.ok(app.pages.indexOf('pages/chengyu/chengyu') >= 0);
  assert.ok(app.pages.indexOf('pages/chengyu/detail') >= 0);
  const cat = fs.readFileSync(path.join(__dirname, '..', 'pages', 'category', 'category.js'), 'utf8');
  assert.ok(/name: '成语卡片', desc: '看成语 · 懂意思 · 知典故', status: 'ok', url: '\/pages\/chengyu\/chengyu', perm: 'chengyu'/.test(cat));
});

console.log(`\nchengyu pages: ${passed} passed`);
