const test = require('node:test');
const assert = require('node:assert/strict');
const pinyin = require('../utils/pinyin');

test('拼音基础入口只有声母、韵母、整体认读，共 63 张卡', () => {
  assert.deepEqual(pinyin.TABLE_ORDER, ['sm', 'ym', 'zt']);
  assert.deepEqual(pinyin.TABLE_ORDER.map(pinyin.countOf), [23, 24, 16]);
  assert.equal(pinyin.countAll(), 63);
  assert.deepEqual(pinyin.studyGroups('sd', {}), []);
});

test('同步保留在学卡片的掌握进度，忽略本地和服务端的旧声调记录', () => {
  const oldKey = 'sd:ā ē ī ō ū ǖ';
  const masterKey = 'mora-pinyin-mastered-v1';
  const tsKey = 'mora-pinyin-mastered-ts-v1';
  const storage = new Map([
    ['mora-auth-token', 'test-token'],
    [masterKey, [oldKey, 'sm:b']],
    [tsKey, { [oldKey]: 50, 'sm:b': 40 }],
  ]);
  const requests = [];
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    request: options => requests.push(options),
  };
  assert.deepEqual(pinyin.loadMastered(), { 'sm:b': true });
  pinyin.markMastered(oldKey, true);
  assert.equal(requests.length, 0);

  let merged;
  pinyin.syncMastered(map => { merged = map; });
  requests.shift().success({ statusCode: 200, data: { ok: true, items: [
    { module: 'pinyin', itemKey: oldKey, mastered: 1, updatedAt: 60 },
    { module: 'pinyin', itemKey: 'dy:a', mastered: 1, updatedAt: 70 },
  ] } });

  assert.deepEqual(merged, { 'sm:b': true, 'dy:a': true });
  assert.equal(pinyin.countMastered(merged), 2);
  assert.deepEqual(storage.get(masterKey), ['sm:b', 'dy:a']);
  assert.deepEqual(storage.get(tsKey), { 'sm:b': 40, 'dy:a': 70 });
  assert.deepEqual(requests[0].data.items.map(item => item.itemKey), ['sm:b']);
});
