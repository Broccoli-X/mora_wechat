/* utils/letters.js 的 Node 测试:mock wx,不依赖微信环境。
   运行:node tests/letters.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + request 捕获(GET 回包可注入) ── */
let store = new Map();
let posts = [];
let getResponse = null;
global.getCurrentPages = () => [{ route: 'pages/letters/letters', options: {} }];
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

const lt = require('../utils/letters');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

test('26 个字母 A-Z 齐全且按序,音标/例词字段与网页端 letters-data 同源齐备', () => {
  assert.equal(lt.DATA.length, 26);
  assert.deepEqual(lt.LETTERS, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  lt.DATA.forEach(d => {
    assert.ok(d.nameIPA && d.sIPA && d.word && d.emoji, d.l + ' 字段应齐全');
  });
});

test('views:大小写配对,PALETTE 循环取色,掌握标记跟随 map', () => {
  const vs = lt.views({ A: true, Z: true });
  assert.equal(vs.length, 26);
  assert.deepEqual(vs.map(v => v.pair), lt.LETTERS.map(c => c + c.toLowerCase()));
  assert.equal(vs[0].color, lt.PALETTE[0]);
  assert.equal(vs[10].color, lt.PALETTE[0]); // K 下标 10,回到色表首位
  assert.ok(vs[0].mastered && vs[25].mastered && !vs[1].mastered);
});

test('randomNext:永不与当前重复,足够多次覆盖其余全部字母,可注入随机源', () => {
  for (let k = 0; k < 500; k++) {
    const j = lt.randomNext(5);
    assert.ok(j >= 0 && j < 26 && j !== 5, '越界或重复: ' + j);
  }
  const seen = new Set();
  for (let k = 0; k < 500; k++) seen.add(lt.randomNext(5));
  for (let j = 0; j < 26; j++) {
    if (j !== 5) assert.ok(seen.has(j), '漏出字母下标 ' + j);
  }
  assert.equal(lt.randomNext(0, () => 0.999), 25);
  assert.equal(lt.randomNext(25, () => 0), 0);
});

test('markMastered:已登录先落盘再上报 phonics 模块,itemKey 为单字母', () => {
  store = new Map();
  posts = [];
  store.set('mora-auth-token', 'tok1');
  lt.markMastered('A', true);
  const map = lt.loadMastered();
  assert.ok(map.A, '本地应已落盘');
  assert.equal(posts.length, 1);
  const body = posts[0].data;
  assert.equal(body.token, 'tok1');
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].module, 'phonics');
  assert.equal(body.items[0].itemKey, 'A');
  assert.equal(body.items[0].mastered, 1);
  assert.equal(typeof body.items[0].updatedAt, 'number');
  assert.ok(body.items[0].device, '应带设备名');
  /* 取消掌握上报 mastered=0 */
  posts = [];
  lt.markMastered('A', false);
  assert.equal(posts[0].data.items[0].mastered, 0);
  assert.ok(!lt.loadMastered().A);
});

test('markMastered:未登录只落盘不上报(登录后 syncMastered 按时间戳补传)', () => {
  store = new Map();
  posts = [];
  lt.markMastered('B', true);
  assert.ok(lt.loadMastered().B);
  assert.equal(posts.length, 0);
});

test('mergeItems/itemsToPush:同键 updatedAt 新者胜(相等取本地),本地新于远端的补传', () => {
  const local = [{ itemKey: 'A', mastered: 1, updatedAt: 100 }, { itemKey: 'B', mastered: 1, updatedAt: 300 }];
  const remote = [{ itemKey: 'A', mastered: 1, updatedAt: 200 }, { itemKey: 'B', mastered: 0, updatedAt: 100 }, { itemKey: 'C', mastered: 1, updatedAt: 50 }];
  const merged = lt.mergeItems(local, remote);
  const byKey = {};
  merged.forEach(m => { byKey[m.itemKey] = m; });
  assert.equal(byKey.A.updatedAt, 200); // 远端新,胜
  assert.equal(byKey.B.updatedAt, 300); // 本地新,胜
  assert.ok(byKey.C.mastered === 1);    // 远端独有,并入
  const toPush = lt.itemsToPush(local, remote);
  assert.deepEqual(toPush.map(t => t.itemKey), ['B']); // 只有 B 比远端新
});

test('syncMastered:远端合并入库(新者胜),本地新条目自动补传,401 弹登录门', () => {
  store = new Map();
  posts = [];
  store.set('mora-auth-token', 'tok2');
  const now = Date.now();
  lt.markMastered('C', true); // 本地 C @ now
  posts = [];
  getResponse = {
    statusCode: 200,
    data: { ok: true, items: [
      { module: 'phonics', itemKey: 'A', mastered: 1, updatedAt: now + 500 },  // 远端新,应胜出
      { module: 'phonics', itemKey: 'C', mastered: 0, updatedAt: now - 5000 }, // 本地新,C 保住并补传
      { module: 'pinyin', itemKey: 'a', mastered: 1, updatedAt: now },          // 他模块,拒收
      { module: 'phonics', itemKey: '1', mastered: 1, updatedAt: now },         // 非法键位,拒收
    ] },
  };
  let doneMap = null;
  lt.syncMastered(map => { doneMap = map; });
  assert.ok(doneMap, 'done 必达');
  assert.ok(doneMap.A && doneMap.C, 'A 远端新胜出,C 本地新保住');
  assert.ok(!doneMap['1'], '非法键位不落盘');
  assert.equal(doneMap.a, undefined, '他模块不落盘');
  const pushed = posts.filter(p => p.url.indexOf('/api/progress') >= 0 && p.method === 'POST');
  assert.equal(pushed.length, 1, '本地新条目补传一次');
  assert.deepEqual(pushed[0].data.items.map(i => i.itemKey), ['C']);
  assert.equal(lt.countMastered(lt.loadMastered()), 2);
  assert.equal(lt.countAll(), 26);

  /* 401:清 token 弹登录门 */
  posts = [];
  getResponse = { statusCode: 401 };
  let gated = false;
  global.wx.reLaunch = () => { gated = true; };
  lt.syncMastered(() => { doneMap = 'should-not-run'; });
  assert.ok(gated, '401 应弹登录门');
  assert.notEqual(doneMap, 'should-not-run', '401 不回调 done');
});

console.log(passed + ' 个用例全过');
