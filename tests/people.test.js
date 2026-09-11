/* utils/people.js 的 Node 测试:mock wx,不依赖微信环境。
   运行:node tests/people.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + request 捕获(GET 回包可注入) ── */
let store = new Map();
let posts = [];
let getResponse = null;
global.getCurrentPages = () => [{ route: 'pages/people/people', options: {} }];
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  request(opts) {
    if (opts.method === 'POST') { posts.push(opts); opts.success && opts.success({ statusCode: 200 }); return; }
    if (getResponse) opts.success(getResponse);
  },
};

const pl = require('../utils/people');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

test('人物与课本人物页一致:7 人、字段齐全、英文名唯一(同步 itemKey)、头像走服务器URL+emoji兜底', () => {
  assert.equal(pl.DATA.length, 7);
  assert.deepEqual(pl.NAMES, ['Liu Tao', 'Wang Bing', 'Su Hai', 'Yang Ling', 'Tommy', 'Amy', 'Lily']);
  assert.equal(new Set(pl.NAMES).size, pl.NAMES.length, '英文名应唯一');
  pl.DATA.forEach(d => {
    assert.ok(d.n && d.zh && d.img && d.emoji, d.n + ' 字段应齐全');
    assert.ok(d.img.indexOf('https://www.tcued.com/images/people/') === 0 && /\.png$/.test(d.img),
      d.n + ' 头像应指向服务器 images/people/');
  });
});

test('views:英文名+中文名+头像+emoji兜底,PALETTE 循环取色,掌握标记跟随 map', () => {
  const vs = pl.views({ 'Liu Tao': true, Lily: true });
  assert.equal(vs.length, 7);
  assert.deepEqual(vs.map(v => v.n), pl.NAMES);
  assert.equal(vs[0].zh, '刘涛');
  assert.equal(vs[2].img, 'https://www.tcued.com/images/people/su-hai.png');
  assert.ok(vs[2].emoji, '应带 emoji 兜底');
  assert.equal(vs[0].color, pl.PALETTE[0]);
  assert.equal(vs[6].color, pl.PALETTE[6]);
  assert.ok(vs[0].mastered && vs[6].mastered && !vs[1].mastered);
});

test('markMastered:已登录先落盘再上报 words 模块,itemKey 为人物英文名', () => {
  store = new Map();
  posts = [];
  store.set('mora-auth-token', 'tok1');
  pl.markMastered('Liu Tao', true);
  const map = pl.loadMastered();
  assert.ok(map['Liu Tao'], '本地应已落盘');
  assert.equal(posts.length, 1);
  const body = posts[0].data;
  assert.equal(body.token, 'tok1');
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].module, 'words');
  assert.equal(body.items[0].itemKey, 'Liu Tao');
  assert.equal(body.items[0].mastered, 1);
  assert.equal(typeof body.items[0].updatedAt, 'number');
  assert.ok(body.items[0].device, '应带设备名');
  /* 取消掌握上报 mastered=0 */
  posts = [];
  pl.markMastered('Liu Tao', false);
  assert.equal(posts[0].data.items[0].mastered, 0);
  assert.ok(!pl.loadMastered()['Liu Tao']);
});

test('markMastered:未登录只落盘不上报(登录后 syncMastered 按时间戳补传)', () => {
  store = new Map();
  posts = [];
  pl.markMastered('Lily', true);
  assert.ok(pl.loadMastered().Lily);
  assert.equal(posts.length, 0);
});

test('mergeItems/itemsToPush:同键 updatedAt 新者胜(相等取本地),本地新于远端的补传', () => {
  const local = [{ itemKey: 'Liu Tao', mastered: 1, updatedAt: 100 }, { itemKey: 'Lily', mastered: 1, updatedAt: 300 }];
  const remote = [{ itemKey: 'Liu Tao', mastered: 1, updatedAt: 200 }, { itemKey: 'Lily', mastered: 0, updatedAt: 100 }, { itemKey: 'Amy', mastered: 1, updatedAt: 50 }];
  const merged = pl.mergeItems(local, remote);
  const byKey = {};
  merged.forEach(m => { byKey[m.itemKey] = m; });
  assert.equal(byKey['Liu Tao'].updatedAt, 200); // 远端新,胜
  assert.equal(byKey.Lily.updatedAt, 300);       // 本地新,胜
  assert.equal(byKey.Amy.mastered, 1);           // 远端独有,并入
  const toPush = pl.itemsToPush(local, remote);
  assert.deepEqual(toPush.map(t => t.itemKey), ['Lily']); // 只有 Lily 比远端新
});

test('syncMastered:远端合并入库(新者胜),本地新条目自动补传,网页端单词不串键,401 弹登录门', () => {
  store = new Map();
  posts = [];
  store.set('mora-auth-token', 'tok2');
  const now = Date.now();
  pl.markMastered('Tommy', true); // 本地 Tommy @ now
  posts = [];
  getResponse = {
    statusCode: 200,
    data: { ok: true, items: [
      { module: 'words', itemKey: 'Liu Tao', mastered: 1, updatedAt: now + 500 },  // 远端新,应胜出
      { module: 'words', itemKey: 'Tommy', mastered: 0, updatedAt: now - 5000 },   // 本地新,Tommy 保住并补传
      { module: 'words', itemKey: 'apple', mastered: 1, updatedAt: now },          // 网页端普通单词,拒收
      { module: 'phonics', itemKey: 'A', mastered: 1, updatedAt: now },            // 他模块,拒收
      { module: 'words', itemKey: 'Nobody', mastered: 1, updatedAt: now },         // 非法人物,拒收
    ] },
  };
  let doneMap = null;
  pl.syncMastered(map => { doneMap = map; });
  assert.ok(doneMap, 'done 必达');
  assert.ok(doneMap['Liu Tao'] && doneMap.Tommy, 'Liu Tao 远端新胜出,Tommy 本地新保住');
  assert.equal(doneMap.apple, undefined, '网页端普通单词不落盘');
  assert.equal(doneMap.Nobody, undefined, '非法人物不落盘');
  assert.equal(doneMap.A, undefined, '他模块不落盘');
  const pushed = posts.filter(p => p.url.indexOf('/api/progress') >= 0 && p.method === 'POST');
  assert.equal(pushed.length, 1, '本地新条目补传一次');
  assert.deepEqual(pushed[0].data.items.map(i => i.itemKey), ['Tommy']);
  assert.equal(pl.countMastered(pl.loadMastered()), 2);
  assert.equal(pl.countAll(), 7);

  /* 401:清 token 弹登录门 */
  posts = [];
  getResponse = { statusCode: 401 };
  let gated = false;
  global.wx.reLaunch = () => { gated = true; };
  pl.syncMastered(() => { doneMap = 'should-not-run'; });
  assert.ok(gated, '401 应弹登录门');
  assert.notEqual(doneMap, 'should-not-run', '401 不回调 done');
});

console.log(passed + ' 个用例全过');
