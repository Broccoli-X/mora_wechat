const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const auth = require('../utils/auth');

const HOME = 'pages/index/index';
const CATEGORY = 'pages/category/category';
const MINE = 'pages/mine/mine';
const LOGIN = 'pages/login/login';
const READING = 'pages/reading/reading';
const store = new Map();
const requests = [];
let stack;
let refreshes;

function pageAt(route, options = {}) {
  const file = require.resolve('../' + route);
  let config;
  global.Page = p => { config = p; };
  delete require.cache[file];
  require(file);
  return Object.assign({}, config, {
    route, options, data: structuredClone(config.data),
    setData(patch) { Object.assign(this.data, patch); },
  });
}

// 微信从导航 URL 传入页面的 query 保留编码，登录页解开 from 后恢复完整目标。
function visit(url) {
  const [path, search] = url.slice(1).split('?');
  const options = Object.fromEntries((search || '').split('&').filter(Boolean).map(s => s.split('=')));
  const page = pageAt(path, options);
  stack.push(page);
  if (page.onLoad) page.onLoad(options);
  if (page.onShow) page.onShow();
  return page;
}

function pop() {
  const page = stack.pop();
  if (page.onUnload) page.onUnload();
}

beforeEach(() => {
  store.clear();
  requests.length = 0;
  refreshes = 0;
  stack = [];
  auth.gateShown();
  global.getCurrentPages = () => stack;
  global.wx = {
    getStorageSync: k => store.get(k) || '',
    setStorageSync: (k, v) => store.set(k, v),
    removeStorageSync: k => store.delete(k),
    getStorageInfoSync: () => ({ keys: [...store.keys()] }),
    getDeviceInfo: () => ({ platform: 'test' }),
    request(options) {
      const request = { options, aborted: false };
      requests.push(request);
      return { abort() { request.aborted = true; options.fail?.(); } };
    },
    navigateTo: ({ url }) => visit(url),
    redirectTo: ({ url }) => { pop(); visit(url); },
    reLaunch: ({ url }) => { while (stack.length) pop(); visit(url); },
    navigateBack: () => { assert.ok(stack.length > 1); pop(); stack.at(-1).onShow?.(); },
    stopPullDownRefresh: () => refreshes++,
  };
});

function selectReading(category) {
  category.onTapItem({ currentTarget: { dataset: { status: 'ok', url: '/' + READING } } });
  assert.equal(stack.at(-1).route, LOGIN);
  return stack.at(-1);
}

test('首页取消后可继续翻原来的卡，「我的」取消后仍能停留并下拉刷新', () => {
  const home = visit('/' + HOME);
  assert.equal(home.data.guest, true);
  home.turnLetter({ currentTarget: { dataset: { step: 1 } } });
  const card = home.data.letterCard;
  home.openLogin();
  stack.at(-1).cancel();
  assert.equal(stack.at(-1), home);
  assert.deepEqual(home.data.letterCard, card);
  home.onPullDownRefresh();

  const mine = visit('/' + MINE);
  mine.openLogin();
  stack.at(-1).cancel();
  assert.equal(stack.at(-1), mine);
  assert.equal(mine.data.loggedIn, false);
  mine.onPullDownRefresh();
  assert.equal(refreshes, 2);
  assert.equal(requests.length, 0);
});

for (const exit of ['取消登录', '微信返回']) {
  test('从分类进入，登录请求中点' + exit + '，迟到的成功响应不会写入会话或跳转', () => {
    const category = visit('/' + CATEGORY);
    const login = selectReading(category);
    login.onPw({ detail: { value: 'test' } });
    login.submit();
    const request = requests[0];
    if (exit === '微信返回') wx.navigateBack();
    else login.cancel();
    assert.equal(request.aborted, true);
    request.options.success({ statusCode: 200, data: { ok: true, token: 'late', family: 'other' } });
    assert.equal(stack.at(-1), category);
    assert.equal(auth.getToken(), '');
    assert.equal(auth.getFamily(), '');
    assert.equal(requests.length, 1);
    selectReading(category).cancel();
    assert.equal(stack.at(-1), category);
  });
}

test('分类登录失败后仍能取消，重进登录成功后打开原选功能并保留分类返回路径', () => {
  const category = visit('/' + CATEGORY);
  let login = selectReading(category);
  login.onPw({ detail: { value: 'bad' } });
  login.submit();
  requests.at(-1).options.success({ statusCode: 401, data: {} });
  assert.match(login.data.error, /密码/);
  login.cancel();
  login = selectReading(category);
  login.onPw({ detail: { value: 'test' } });
  login.submit();
  requests.at(-1).options.success({ statusCode: 200, data: { ok: true, token: 'valid', perms: ['reading'] } });
  assert.deepEqual(stack.map(p => p.route), [CATEGORY, READING]);
  assert.equal(auth.getToken(), 'valid');
});

test('从「我的」退出后停留在访客页，可以再次进入登录并取消', () => {
  store.set('mora-auth-token', 'valid');
  const mine = visit('/' + MINE);
  wx.showModal = options => options.success({ confirm: true });
  mine.logout();
  const guest = stack.at(-1);
  assert.equal(guest.route, MINE);
  assert.equal(guest.data.loggedIn, false);
  const count = requests.length;
  guest.openLogin();
  stack.at(-1).cancel();
  assert.equal(stack.at(-1), guest);
  assert.equal(requests.length, count);
});

test('未登录直开受限深链，取消后回到可用首页；迟到的 401 不会再弹出登录', () => {
  stack.push({ route: 'pages/knowledge/book', options: { grade: '一年级', volume: '上' } });
  assert.equal(auth.ensure(), false);
  assert.equal(stack.length, 1);
  assert.match(stack[0].from, /^\/pages\/knowledge\/book\?grade=/);
  assert.ok(stack[0].from.includes('&volume=' + encodeURIComponent('上')));
  stack[0].cancel();
  auth.on401();
  assert.equal(stack[0].route, HOME);
  assert.equal(stack[0].data.guest, true);
  assert.equal(requests.length, 0);
});

test('退出或重新登录后，旧会话的权限响应不会再写权限或弹出登录', () => {
  store.set('mora-auth-token', 'old');
  auth.refreshPerms();
  auth.refreshPerms();
  store.set('mora-auth-token', 'new');
  requests[0].options.success({ statusCode: 200, data: { ok: true, perms: ['*'] } });
  requests[1].options.success({ statusCode: 401 });
  assert.equal(auth.getToken(), 'new');
  assert.equal(auth.hasPerm('homework'), false);
  assert.equal(stack.length, 0);
});
