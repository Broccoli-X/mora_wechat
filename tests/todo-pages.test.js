/* 待办两页的接线测试:mock Page/wx,把维护页(pages/todo-edit)的配图选删与
   带图提交、详情页(pages/todo)的缩略图与大图预览跑一遍,校验 setData、
   /api/image 上传与上报载荷 p 键。utils 侧由 tests/todo.test.js 覆盖。
   不依赖微信环境。运行:node tests/todo-pages.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/* ── Page/wx mock:Page 捕获页面配置,实例化后按微信语义做浅合并 setData ── */
let store = new Map();
let requests = [];
let routes = {};
let page = null;
let toasts = [];
let previews = [];
let chooseCalls = [];
let chooseReply = null;   // chooseMedia 的应答(tempFiles)
let readFileReply = null; // getFileSystemManager().readFile 的应答(base64)

global.getCurrentPages = () => [{ route: 'pages/todo-edit/todo-edit', options: {} }];
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
  previewImage: o => previews.push(o),
  chooseMedia(o) {
    chooseCalls.push(o);
    if (chooseReply && o.success) o.success(chooseReply);
  },
  compressImage(o) { if (o.fail) o.fail(new Error('devtools 无压缩接口')); },
  getFileSystemManager() {
    return {
      readFile(o) {
        if (readFileReply != null) o.success({ data: readFileReply });
        else if (o.fail) o.fail(new Error('no file'));
      },
    };
  },
  request(o) {
    requests.push(o);
    for (const key of Object.keys(routes)) {
      if (o.url.indexOf(key) >= 0) {
        const r = routes[key];
        if (typeof r === 'function') r(o);
        else if (o.success) o.success(r);
        return;
      }
    }
    if (o.fail) o.fail(new Error('no route'));
  },
};

const auth = require('../utils/auth');
const td = require('../utils/todo');

/* 服务端进度条目便捷构造 */
function titem(itemKey, payloadObj, updatedAt) {
  return { module: 'todo', itemKey, updatedAt: updatedAt || 100, payload: JSON.stringify(payloadObj) };
}
function progress(items) { return { statusCode: 200, data: { ok: true, items: items } }; }

/* 相对今天的日期串:页面按真实今天渲染,fixture 必须同源 */
function dayStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return td.toDateStr(d);
}

/* 载入页面文件并实例化(setData 支持 'a.b' 这类路径,与微信同款) */
function load(rel) {
  page = null;
  const file = path.join(__dirname, '..', rel);
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
  previews = [];
  chooseCalls = [];
  chooseReply = null;
  readFileReply = null;
  routes = Object.assign({
    '/api/perms': { statusCode: 200, data: { ok: true, perms: ['todo'] } },
    '/api/progress': progress([]),
    '/api/image': { statusCode: 200, data: { ok: true } },
  }, extraRoutes || {});
  store.set('mora-auth-token', 'T');
  auth.gateShown();
}

function posts() { return requests.filter(r => r.method === 'POST' && r.url.indexOf('/api/progress') >= 0); }
function imgPosts() { return requests.filter(r => r.method === 'POST' && r.url.indexOf('/api/image') >= 0); }

/* submit 是 async(有图时逐张上传),用微任务链把用例串行排干 */
let chain = Promise.resolve();
let passed = 0;
function test(name, fn) {
  chain = chain.then(() => {
    reset();
    return Promise.resolve(fn()).then(() => {
      passed++;
      console.log('✓ ' + name);
    }, e => {
      console.error('✗ ' + name + '\n  ' + (e && e.message));
      process.exitCode = 1;
      throw e;
    });
  });
}

/* ── 静态契约:配图编辑/预览接线在位;单次「到」结束日期在位 ── */
test('静态契约:维护页配图编辑与结束日期接线在位,详情页缩略图可点预览,首页有图片角标', () => {
  const editWxml = fs.readFileSync(path.join(__dirname, '..', 'pages/todo-edit/todo-edit.wxml'), 'utf8');
  assert.ok(editWxml.indexOf('bindtap="addPics"') >= 0, '添加图片按钮在位');
  assert.ok(editWxml.indexOf('bindtap="removePic"') >= 0, '新图移除在位');
  assert.ok(editWxml.indexOf('bindtap="removeExistImg"') >= 0, '编辑旧图移除在位');
  assert.ok(/pics\.length \+ existImgs\.length < picsMax/.test(editWxml), '配图上限条件在位');
  assert.ok(/处理图片中/.test(editWxml), '提交按钮有处理图片中状态');
  assert.ok(editWxml.indexOf('pic-flag') >= 0, '列表图片角标在位');
  assert.ok(editWxml.indexOf('bindchange="onDateEnd"') >= 0, '「到」结束日期选择器在位');
  assert.ok(editWxml.indexOf('选了就是一段日子') >= 0, '「到」选填提示在位');
  assert.ok(editWxml.indexOf('填上「到」就是一段日子') >= 0, '单次说明文案含日期范围');
  const todoWxml = fs.readFileSync(path.join(__dirname, '..', 'pages/todo/todo.wxml'), 'utf8');
  assert.ok(todoWxml.indexOf('bindtap="previewImage"') >= 0, '缩略图点按预览在位');
  assert.ok(todoWxml.indexOf('data-urls="{{item.imgs}}"') >= 0, '预览地址随行传递');
  assert.ok(todoWxml.indexOf('lazy-load') >= 0, '缩略图懒加载');
  const indexWxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8');
  assert.ok(indexWxml.indexOf('td-flag') >= 0, '首页今日代办图片角标在位');
});

/* ── 维护页:选图与上限 ── */
test('选图:按剩余房间数取,超出的截断并提示;占满后再点不弹选择器', async () => {
  const p = load('pages/todo-edit/todo-edit.js');
  p.onLoad();
  chooseReply = { tempFiles: [
    { tempFilePath: 'wxfile://a.jpg' }, { tempFilePath: 'wxfile://b.jpg' }, { tempFilePath: 'wxfile://c.jpg' },
  ] };
  p.addPics();
  assert.strictEqual(chooseCalls.length, 1);
  assert.strictEqual(chooseCalls[0].count, td.IMGS_MAX, '首次可选张数=上限');
  assert.deepStrictEqual(p.data.pics, ['wxfile://a.jpg', 'wxfile://b.jpg', 'wxfile://c.jpg']);
  p.removePic({ currentTarget: { dataset: { pi: 0 } } });
  assert.deepStrictEqual(p.data.pics, ['wxfile://b.jpg', 'wxfile://c.jpg'], '✕ 移除新图');
  // 占满:9 张上限,编辑旧图一起算房间
  const full = Array.from({ length: td.IMGS_MAX }, (_, i) => ({ id: 'imgfull' + i, url: 'u' + i }));
  p.setData({ existImgs: full });
  toasts.length = 0;
  p.addPics();
  assert.strictEqual(chooseCalls.length, 1, '没再弹选择器');
  assert.strictEqual(toasts[0], '一条代办最多配 ' + td.IMGS_MAX + ' 张图片哦');
  // 删掉一张旧图、清掉新图后房间回来了
  p.removeExistImg({ currentTarget: { dataset: { ei: 0 } } });
  assert.strictEqual(p.data.existImgs.length, td.IMGS_MAX - 1, '✕ 移除旧图');
  p.removePic({ currentTarget: { dataset: { pi: 1 } } });
  p.removePic({ currentTarget: { dataset: { pi: 0 } } });
  chooseReply = { tempFiles: [{ tempFilePath: 'wxfile://d.jpg' }] };
  p.addPics();
  assert.strictEqual(chooseCalls[1].count, 1, '按剩余房间数选');
  assert.deepStrictEqual(p.data.pics, ['wxfile://d.jpg']);
});

/* ── 维护页:带图提交 ── */
test('带图提交:先传 /api/image 换 id,再上报条目 payload 带 g 键;表单清空、列表角标', async () => {
  const p = load('pages/todo-edit/todo-edit.js');
  p.onLoad();
  p.onText({ detail: { value: '拼一架纸飞机' } });
  readFileReply = 'QUFB'; // base64("AAA")
  p.setData({ pics: ['wxfile://a.jpg'] });
  await p.submit();
  assert.strictEqual(imgPosts().length, 1, '先发图片上传');
  assert.strictEqual(imgPosts()[0].data.data, 'data:image/jpeg;base64,QUFB');
  const post = posts()[0];
  assert.ok(post, '再发条目上报');
  assert.strictEqual(post.data.items[0].module, 'todo');
  const payload = JSON.parse(post.data.items[0].payload);
  assert.deepStrictEqual(payload.g, [imgPosts()[0].data.id], 'payload g 键=上传换来的 id');
  assert.strictEqual(payload.t, '拼一架纸飞机');
  assert.strictEqual(p.data.text, '', '表单已清空');
  assert.deepStrictEqual(toasts, ['已添加']);
  assert.strictEqual(p.data.rows.length, 1, '乐观上列表');
  assert.strictEqual(p.data.rows[0].pics, 1, '列表行带图片角标数');
});

test('无图提交:payload 不带 g 键,与老版本字节级一致(不发 /api/image)', async () => {
  const p = load('pages/todo-edit/todo-edit.js');
  p.onLoad();
  p.onText({ detail: { value: '睡前刷牙' } });
  await p.submit();
  assert.strictEqual(imgPosts().length, 0);
  const payload = JSON.parse(posts()[0].data.items[0].payload);
  assert.ok(!('g' in payload), '无图不产生 g 键');
  assert.deepStrictEqual(Object.keys(payload), ['t', 'm', 'r'], '与老版本键序一致');
});

test('编辑带图条目:旧图载入可删,保存按剩余引用全量覆盖 g 键', async () => {
  reset({ '/api/progress': progress([
    titem('tdg1', { t: '手工步骤', m: '08:00', r: 'daily', g: ['imgkeep1', 'imgdrop2'] }, 100),
  ]) });
  const p = load('pages/todo-edit/todo-edit.js');
  p.onLoad();
  p.editRow({ currentTarget: { dataset: { id: 'tdg1' } } });
  assert.deepStrictEqual(p.data.existImgs.map(v => v.id), ['imgkeep1', 'imgdrop2']);
  assert.deepStrictEqual(p.data.existImgs.map(v => v.url), [
    'https://www.tcued.com/api/image?id=imgkeep1',
    'https://www.tcued.com/api/image?id=imgdrop2',
  ], '旧图走 GET /api/image 直连地址');
  p.removeExistImg({ currentTarget: { dataset: { ei: 0 } } });
  await p.submit();
  assert.strictEqual(imgPosts().length, 0, '没加新图就不重新上传');
  const payload = JSON.parse(posts()[0].data.items[0].payload);
  assert.deepStrictEqual(payload.g, ['imgdrop2'], '保存按剩余引用覆盖');
  assert.strictEqual(posts()[0].data.items[0].itemKey, 'tdg1', '同 id 覆盖');
});

test('图压不下去:dataURL 超上限整条不落,提示换一张', async () => {
  const p = load('pages/todo-edit/todo-edit.js');
  p.onLoad();
  p.onText({ detail: { value: '大图代办' } });
  readFileReply = 'A'.repeat(800000); // 两轮压缩都失败(devtools 无压缩接口),仍超 76 万
  p.setData({ pics: ['wxfile://big.jpg'] });
  await p.submit();
  assert.deepStrictEqual(toasts, ['这张图压不下去,换一张试试']);
  assert.strictEqual(posts().length, 0, '条目未上报');
  assert.strictEqual(imgPosts().length, 0);
  assert.strictEqual(p.data.submitting, false, '提交态已复位');
});

/* ── 单次日期范围:表单拦截/回填/重置 ── */
test('结束日期:onDateEnd 接线,早于开始日期拦截不放行,非法值忽略', async () => {
  const p = load('pages/todo-edit/todo-edit.js');
  p.onLoad();
  p.onText({ detail: { value: '夏令营' } });
  p.pickRepeat({ currentTarget: { dataset: { r: 'once' } } });
  p.onDate({ detail: { value: dayStr(1) } });
  p.onDateEnd({ detail: { value: '不是日期' } });
  assert.strictEqual(p.data.dateEnd, '', '非法值不采纳');
  p.onDateEnd({ detail: { value: dayStr(0) } });
  assert.strictEqual(p.data.dateEnd, dayStr(0));
  await p.submit();
  assert.deepStrictEqual(toasts, ['结束日期不能早于开始日期哦'], '早于开始日期显式拦截');
  assert.strictEqual(posts().length, 0, '不放行');
  assert.strictEqual(p.data.submitting, false, '提交态已复位');
});

test('结束日期:范围条目 payload 带 e 键;等于开始日期静默退回单日(不带 e)', async () => {
  const p = load('pages/todo-edit/todo-edit.js');
  p.onLoad();
  p.onText({ detail: { value: '夏令营' } });
  p.pickRepeat({ currentTarget: { dataset: { r: 'once' } } });
  p.onDate({ detail: { value: dayStr(1) } });
  p.onDateEnd({ detail: { value: dayStr(3) } });
  await p.submit();
  const payload = JSON.parse(posts()[0].data.items[0].payload);
  assert.strictEqual(payload.d, dayStr(1));
  assert.strictEqual(payload.e, dayStr(3), '范围落库 e 键');
  // 等于开始日期:合法,normalize 静默退单日(首次提交后表单已清空,重新填)
  toasts.length = 0;
  p.onText({ detail: { value: '夏令营' } });
  p.pickRepeat({ currentTarget: { dataset: { r: 'once' } } });
  p.onDate({ detail: { value: dayStr(2) } });
  p.onDateEnd({ detail: { value: dayStr(2) } });
  await p.submit();
  const p2 = JSON.parse(posts()[1].data.items[0].payload);
  assert.deepStrictEqual(Object.keys(p2), ['t', 'm', 'r', 'd'], '等于退单日,不带 e 键');
  assert.deepStrictEqual(toasts, ['已添加'], '不拦、正常保存');
});

test('结束日期:编辑回填 dateEnd,重置清空', async () => {
  reset({ '/api/progress': progress([
    titem('tdr1', { t: '夏令营', m: '08:00', r: 'once', d: dayStr(-1), e: dayStr(2) }, 100),
  ]) });
  const p = load('pages/todo-edit/todo-edit.js');
  p.onLoad();
  p.editRow({ currentTarget: { dataset: { id: 'tdr1' } } });
  assert.strictEqual(p.data.dateEnd, dayStr(2), '编辑回填结束日期');
  assert.strictEqual(p.data.date, dayStr(-1));
  p.cancelEdit();
  assert.strictEqual(p.data.dateEnd, '', '重置清空(选填语义,非回到今天)');
  assert.strictEqual(p.data.date, td.todayStr());
});

/* ── 详情页:范围条目跨天可见 ── */
test('详情页:单次范围条目首尾含当天天天可见,翻出范围消失,文案带 ~', async () => {
  reset({ '/api/progress': progress([
    titem('tdr1', { t: '夏令营', m: '08:00', r: 'once', d: dayStr(-1), e: dayStr(1) }, 100),
  ]) });
  const p = load('pages/todo/todo.js');
  p.onLoad();
  assert.strictEqual(p.data.rows.length, 1, '范围内(今天)可见');
  assert.strictEqual(p.data.rows[0].tag, td.describe({ repeat: 'once', date: dayStr(-1), dateEnd: dayStr(1) }), '文案与 utils 同源');
  assert.ok(p.data.rows[0].tag.indexOf('~') > 0, '范围文案带 ~');
  p.nextDay(); // 明天 = 范围尾日
  assert.strictEqual(p.data.rows.length, 1, '尾日仍可见');
  p.nextDay(); // 后天 = 界外
  assert.deepStrictEqual(p.data.rows, [], '翻出范围不再展示');
  p.prevDay();
  p.prevDay(); // 回到昨天 = 范围首日
  assert.strictEqual(p.data.rows.length, 1, '首日可见');
});

/* ── 详情页:缩略图与大图预览 ── */
test('详情页:带图条目渲染缩略图直连地址,点按 wx.previewImage 左右滑动同条目图片', async () => {
  reset({ '/api/progress': progress([
    titem('tdg1', { t: '拼纸飞机', m: '08:00', r: 'daily', g: ['imgpic1', 'imgpic2'] }, 100),
    titem('tdg2', { t: '无图事项', m: '09:00', r: 'daily' }, 90),
  ]) });
  const p = load('pages/todo/todo.js');
  p.onLoad();
  const [r1, r2] = p.data.rows;
  assert.deepStrictEqual(r1.imgs, [
    'https://www.tcued.com/api/image?id=imgpic1',
    'https://www.tcued.com/api/image?id=imgpic2',
  ], '缩略图走 GET /api/image 直连地址');
  assert.deepStrictEqual(r2.imgs, [], '无图条目没有缩略图');
  p.previewImage({ currentTarget: { dataset: { urls: r1.imgs, pi: 1 } } });
  assert.deepStrictEqual(previews, [{ current: r1.imgs[1], urls: r1.imgs }], '从点按的那张看起,可左右滑动');
  previews.length = 0;
  p.previewImage({ currentTarget: { dataset: { urls: [], pi: 0 } } });
  assert.strictEqual(previews.length, 0, '空图不弹预览');
  // 翻天重筛:带图条目在每天重复下天天可见,图片跟着走
  const d = td.parseDate(p.data.date);
  d.setDate(d.getDate() + 1);
  p.onDate({ detail: { value: td.toDateStr(d) } });
  assert.strictEqual(p.data.rows[0].imgs.length, 2, '换日重筛后图片仍在');
});

chain.then(() => console.log(passed + ' 个用例全过')).catch(() => {});
