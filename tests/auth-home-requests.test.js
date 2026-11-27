const assert = require('node:assert/strict');
const test = require('node:test');

const store = new Map();
const pending = [];
global.wx = {
  getStorageSync: key => store.get(key) || '',
  setStorageSync: (key, value) => store.set(key, value),
  removeStorageSync: key => store.delete(key),
  request: request => pending.push(request),
  reLaunch: () => assert.fail('旧会话响应触发登录'),
};

const hw = require('../utils/homework');
const pt = require('../utils/points');
const td = require('../utils/todo');
const kb = require('../utils/kebiao');

for (const [name, fetch] of [
  ['作业', hw.fetchHomework], ['积分', pt.fetchPoints],
  ['待办', td.fetchTodos], ['课表', kb.refresh],
]) {
  test(name + '忽略换会话后才返回的成功、401 和网络错误', () => {
    store.clear();
    store.set('mora-auth-token', 'first-session');
    const rejectUpdate = () => assert.fail('旧请求不应触发当前页面回调');
    fetch(rejectUpdate, rejectUpdate);
    fetch(rejectUpdate, rejectUpdate);
    fetch(rejectUpdate, rejectUpdate);

    store.set('mora-auth-token', 'next-session');
    const doc = { ...kb.current(), school: '前一家庭' };
    pending.shift().success({ statusCode: 200, data: { ok: true, items: [], data: doc, updatedAt: 123 } });
    pending.shift().success({ statusCode: 401 });
    pending.shift().fail({ errMsg: 'request:fail' });
    assert.equal(store.get('mora-auth-token'), 'next-session');
    assert.equal(store.has('mora-kebiao-doc'), false);
    assert.notEqual(kb.current().school, doc.school);
  });
}
