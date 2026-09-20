/* 作业本「分享当天作业(携带图片附件)」的 Node 测试:
   share-card 的纯排版 layout()(换行/图格/总高/算子序列)、build() 用假
   canvas 节点跑通下载→排版→绘制→导出全链路、zuoye 页接线(按钮取今天、
   成图走发图菜单、不发小程序卡片的静态契约)与 wxml/wxss 契约。
   Canvas 绘制本身无法在 Node 渲染,wx 侧靠 mock 打桩。不依赖微信环境。
   运行:node tests/zuoye-share.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/* ── wx mock:内存 storage + 各 API 调用记录 ── */
const store = new Map();
const dlUrls = []; // downloadFile 拉过的 url
const toTemp = []; // canvasToTempFilePath 入参
const api = {
  showLoading: 0,
  hideLoading: 0,
  toasts: [],
  menuPaths: [], // showShareImageMenu 发出的图
  menuFail: null, // 置为非空时模拟发图失败(cancel=用户取消)
  savedAlbum: 0,
};

global.getCurrentPages = () => [{ route: 'pages/zuoye/zuoye', options: {} }];
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: () => {},
  request() {},
  downloadFile(o) {
    dlUrls.push(o.url);
    o.success({ statusCode: 200, tempFilePath: 'wxfile://dl' + dlUrls.length });
    o.complete();
  },
  canvasToTempFilePath(o) { toTemp.push(o); o.success({ tempFilePath: 'wxfile://share.png' }); },
  showLoading() { api.showLoading++; },
  hideLoading() { api.hideLoading++; },
  showToast(o) { api.toasts.push(o.title); },
  showShareImageMenu(o) {
    api.menuPaths.push(o.path);
    if (api.menuFail && o.fail) o.fail(api.menuFail);
  },
  saveImageToPhotosAlbum() { api.savedAlbum++; },
  createSelectorQuery() {
    const q = {
      in() { return q; },
      select() { return q; },
      fields() { return q; },
      exec(cb) { cb([{ node: fakeCanvasNode() }]); },
    };
    return q;
  },
};

/* 假 canvas 2d 节点:ctx 用 Proxy 兜底(方法全空转、measureText 按字数×10px),
   createImage 出的图在 src 赋值后微任务里回调 onload(等所有 src 赋完再触发) */
function fakeCanvasNode() {
  return {
    width: 0,
    height: 0,
    getContext() {
      return new Proxy({}, {
        get(t, k) {
          if (k === 'measureText') return s => ({ width: Array.from(String(s)).length * 10 });
          if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
          return () => {};
        },
        set() { return true; },
      });
    },
    createImage() {
      const img = { width: 100, height: 80, onload: null, onerror: null };
      Object.defineProperty(img, 'src', {
        set() { Promise.resolve().then(() => { if (img.onload) img.onload(); }); },
      });
      return img;
    },
  };
}

const hw = require('../utils/homework');
const shareCard = require('../pages/zuoye/share-card');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const TODAY = hw.todayStr();

/* 作业条目便捷构造 */
function mk(date, subject, text, done, imgs) {
  return { id: 'hw' + subject + date, date, subject, text, done: done ? 1 : 0, imgs: imgs || [] };
}

/* 页面视图数据的便捷构造(与 zuoye.js render 同形);实例原型挂 pageCfg,
   sendShareImage 等页面方法与小程序实例同语义可调 */
function fakePage(entries) {
  const p = Object.create(pageCfg);
  p.data = {
    days: hw.weekOf(TODAY).map(date => ({
      isToday: date === TODAY,
      items: entries.filter(e => e.date === date).map(e => ({
        id: e.id, icon: hw.metaOf(e.subject).icon, color: hw.metaOf(e.subject).main,
        subject: e.subject, text: e.text, done: !!e.done, imgs: e.imgs.map(hw.imgUrl),
      })),
    })),
  };
  p.entries = entries;
  p.today = TODAY;
  p._sharing = false;
  return p;
}

/* ── layout:纯排版 ── */

const M = t => Array.from(t).length * 10; // 假测量:每字 10px

test('layout 整幅先铺不透明白底,再画渐变带;不画完成圆点,单条无图无 photo 算子', () => {
  const plan = shareCard.layout({
    dateText: '9月18日 · 星期五',
    items: [{ icon: '📖', color: '#c9392b', subject: '语文', text: '课文朗读三遍', done: true, imgs: [] }],
  }, M);
  assert.strictEqual(plan.ops[0].t, 'rect', '首个算子必须是整幅底色');
  assert.strictEqual(plan.ops[0].fill, '#ffffff', '背景不许透明');
  assert.strictEqual(plan.ops[0].w, 750);
  assert.strictEqual(plan.ops[0].h, plan.height, '白底盖到定稿总高');
  assert.strictEqual(plan.ops[1].t, 'lgrad');
  const kinds = plan.ops.map(o => o.t);
  assert.ok(kinds.indexOf('rrect') > 0, '科目 chip 要画');
  assert.ok(kinds.indexOf('circle') < 0 && kinds.indexOf('ctext') < 0, '不画条目前的完成圆点/勾');
  assert.ok(kinds.indexOf('photo') < 0, '无附件不应有 photo 算子');
  const body = plan.ops.filter(o => o.t === 'text' && o.font.indexOf('28px') >= 0);
  assert.strictEqual(body.length, 1, '短正文一行');
  assert.ok(plan.height > 0);
});

test('layout 长文按像素宽断行成多行,总高随之变高', () => {
  const short = shareCard.layout({
    dateText: 'd',
    items: [{ icon: '📖', color: '#000', subject: '语文', text: '短作业', done: false, imgs: [] }],
  }, M);
  const longText = '字'.repeat(80); /* 正文缩进后行宽 634px,80×10=800px 必断两行 */
  const long = shareCard.layout({
    dateText: 'd',
    items: [{ icon: '📖', color: '#000', subject: '语文', text: longText, done: false, imgs: [] }],
  }, M);
  const bodyOf = p => p.ops.filter(o => o.t === 'text' && o.font.indexOf('28px') >= 0);
  assert.strictEqual(bodyOf(long).length, 2, '80 字要断成两行');
  assert.ok(long.height > short.height);
  const lines = bodyOf(long).map(o => Array.from(o.text).length);
  assert.deepStrictEqual(lines, [63, 17], '按缩进后的行宽 634px 断行');
});

test('layout 照片逐张竖排:横图吃满整行宽,竖图顶到展示高上限,失败图给占位格', () => {
  const plan = shareCard.layout({
    dateText: 'd',
    items: [{
      icon: '🔢', color: '#000', subject: '数学', text: '看图列式', done: false,
      imgs: [
        { i: 0, w: 1000, h: 800 }, /* 横图 → 678 宽 */
        { i: 1, w: 600, h: 1600 }, /* 竖图 → 高顶到 820,水平居中 */
        { i: 2, w: 0, h: 0 },      /* 加载失败 → 固定占位格 */
      ],
    }],
  }, M);
  const ph = plan.ops.filter(o => o.t === 'photo');
  assert.strictEqual(ph.length, 3);
  assert.strictEqual(ph[0].w, 678, '横图吃满整行宽');
  assert.strictEqual(ph[0].h, Math.round(800 * 678 / 1000));
  assert.strictEqual(ph[1].h, 820, '竖图不超过展示高上限');
  assert.ok(ph[1].w < 678 && ph[1].x > 36, '窄图水平居中');
  assert.strictEqual(ph[2].w, 678);
  assert.strictEqual(ph[2].h, 240, '失败图固定占位高');
  assert.strictEqual(ph[1].y, ph[0].y + ph[0].h + 16, '逐张竖排,间距 16');
  assert.strictEqual(ph[2].y, ph[1].y + ph[1].h + 16);
});

test('layout 两条之间画分隔线(含头部线共 2 条)', () => {
  const plan = shareCard.layout({
    dateText: 'd',
    items: [
      { icon: '📖', color: '#000', subject: '语文', text: 'a', done: false, imgs: [] },
      { icon: '🔢', color: '#000', subject: '数学', text: 'b', done: false, imgs: [] },
    ],
  }, M);
  assert.strictEqual(plan.ops.filter(o => o.t === 'line').length, 2);
});

/* ── build:下载 → 排版 → 绘制 → 导出(假节点全链路) ── */

test('build 去重下载附件、2x 后台定稿、按后台尺寸显式导出', async () => {
  dlUrls.length = 0; toTemp.length = 0;
  const node = fakeCanvasNode();
  const url = hw.imgUrl('imgabc');
  const got = await new Promise((resolve, reject) => {
    shareCard.build(node, {
      dateText: '9月18日 · 星期五',
      items: [
        { icon: '📖', color: '#c9392b', subject: '语文', text: '看图写话', done: false, imgs: [url, url] },
        { icon: '🔢', color: '#1d5fbf', subject: '数学', text: '口算', done: true, imgs: [url] },
      ],
    }, resolve, () => reject(new Error('build 不该失败')));
  });
  assert.strictEqual(got, 'wxfile://share.png');
  assert.deepStrictEqual(dlUrls, [url], '同一张图只下载一次');
  assert.strictEqual(node.width, 750 * shareCard.RES, '后台 2 倍分辨率,防整图被手机拉伸发虚');
  assert.ok(node.height > 600, '高度按内容定稿');
  assert.strictEqual(toTemp.length, 1);
  assert.strictEqual(toTemp[0].destWidth, node.width, '导出必须显式按后台尺寸(默认值只放大不加细节)');
  assert.strictEqual(toTemp[0].destHeight, node.height);
  assert.strictEqual(toTemp[0].fileType, 'jpg', '长图主体是照片,PNG 会大到微信拒收');
  assert.strictEqual(toTemp[0].quality, 0.9);
});

test('build 超长图降回 1x 后台:防 iOS 画布面积上限导致导出失败', async () => {
  dlUrls.length = 0; toTemp.length = 0;
  const node = fakeCanvasNode();
  const url = hw.imgUrl('imglong');
  await new Promise((resolve, reject) => {
    shareCard.build(node, {
      dateText: 'd',
      items: [{
        icon: '🔢', color: '#000', subject: '数学', text: '看图列式', done: false,
        imgs: Array(12).fill(url), /* mock 位图 100×80→槽位 542 高,12 张逻辑高破 5500,2x 触顶 */
      }],
    }, resolve, () => reject(new Error('build 不该失败')));
  });
  assert.strictEqual(node.width, 750, '超长图降回 1x 后台');
  assert.ok(node.height > 5500);
  assert.deepStrictEqual(dlUrls, [url], '同一张图仍只下载一次');
});

/* ── zuoye 页接线 ── */

let pageCfg = null;
global.Page = o => { pageCfg = o; };
require('../pages/zuoye/zuoye.js');

function resetApi() {
  api.showLoading = 0; api.hideLoading = 0; api.toasts.length = 0; api.menuPaths.length = 0; api.savedAlbum = 0;
}

test('shareToday 只把今天的条目交给 build,成图后走「发送给朋友」菜单', () => {
  resetApi();
  const builds = [];
  const origBuild = shareCard.build;
  shareCard.build = (canvas, data, done) => { builds.push(data); done('wxfile://share.png'); };
  try {
    const p = fakePage([
      mk(TODAY, '语文', '课文朗读', 1, ['imgabc']),
      mk(hw.toDateStr(new Date(Date.now() + 86400000)), '数学', '明天的作业'),
    ]);
    pageCfg.shareToday.call(p);
    assert.strictEqual(builds.length, 1, 'build 只跑一次');
    assert.strictEqual(builds[0].items.length, 1, '只带今天的作业');
    assert.strictEqual(builds[0].items[0].imgs[0], hw.imgUrl('imgabc'));
    assert.strictEqual(api.menuPaths[0], 'wxfile://share.png');
    assert.strictEqual(api.showLoading, 1);
    assert.strictEqual(api.hideLoading, 1);
    assert.strictEqual(p._sharing, false, '发完要复位,下次还能点');
  } finally {
    shareCard.build = origBuild;
  }
});

test('shareToday 今天没有作业:提示不发、不 build', () => {
  resetApi();
  const builds = [];
  const origBuild = shareCard.build;
  shareCard.build = (c, d, done) => { builds.push(1); done('x'); };
  try {
    pageCfg.shareToday.call(fakePage([mk(hw.toDateStr(new Date(Date.now() + 86400000)), '数学', '明天的')]));
    assert.deepStrictEqual(builds, []);
    assert.deepStrictEqual(api.toasts, ['今天没有作业']);
    assert.strictEqual(api.menuPaths.length, 0);
  } finally {
    shareCard.build = origBuild;
  }
});

test('shareToday 生成中防重入:连点只跑一次', () => {
  resetApi();
  const builds = [];
  const origBuild = shareCard.build;
  shareCard.build = (c, d, done) => { builds.push(1); done('x'); };
  try {
    const p = fakePage([mk(TODAY, '语文', 'a')]);
    p._sharing = true; /* 上一次还没完成 */
    pageCfg.shareToday.call(p);
    pageCfg.shareToday.call(p);
    assert.deepStrictEqual(builds, []);
  } finally {
    shareCard.build = origBuild;
  }
});

test('发图失败给提示且可重试,用户取消菜单不打扰', () => {
  resetApi();
  const origBuild = shareCard.build;
  shareCard.build = (c, d, done) => done('wxfile://share.jpg');
  try {
    api.menuFail = { errMsg: 'showShareImageMenu:fail send' };
    pageCfg.shareToday.call(fakePage([mk(TODAY, '语文', 'a')]));
    assert.deepStrictEqual(api.toasts, ['没发出去，可重试或存相册再发']);
    assert.strictEqual(api.menuPaths[0], 'wxfile://share.jpg');

    api.toasts.length = 0;
    api.menuPaths.length = 0;
    api.menuFail = { errMsg: 'showShareImageMenu:fail cancel' }; /* 用户取消不是失败 */
    pageCfg.shareToday.call(fakePage([mk(TODAY, '语文', 'a')]));
    assert.deepStrictEqual(api.toasts, []);
    assert.strictEqual(api.menuPaths.length, 1);
  } finally {
    api.menuFail = null;
    shareCard.build = origBuild;
  }
});

/* ── 不发小程序卡片的契约 ── */

test('zuoye 页不定义 onShareAppMessage/onShareTimeline:胶囊「转发」置灰,作业只发长图', () => {
  /* 页面一旦补上这两个钩子,右上角胶囊菜单的「转发/分享到朋友圈」就会点亮,
     用户会误转发只带缩略图的小程序卡片——作业分享只认「分享今天」发图片 */
  assert.strictEqual(pageCfg.onShareAppMessage, undefined);
  assert.strictEqual(pageCfg.onShareTimeline, undefined);
});

/* ── wxml/wxss 静态契约 ── */

test('wxml 分享按钮长在今天卡片上,离屏 2d canvas 就位;wxss 让 canvas 移出屏幕', () => {
  const dir = path.join(__dirname, '..', 'pages', 'zuoye');
  const wxml = fs.readFileSync(path.join(dir, 'zuoye.wxml'), 'utf8');
  assert.ok(wxml.includes('id="share-canvas"'));
  assert.ok(wxml.includes('type="2d"'));
  assert.ok(wxml.includes('bindtap="shareToday"'));
  assert.ok(wxml.includes('class="day-share"'), '按钮要长在今天卡片的标题行');
  assert.ok(!wxml.includes('tb-fill') && !wxml.includes('share-btn'), '旧工具行分享按钮要清干净');
  const wxss = fs.readFileSync(path.join(dir, 'zuoye.wxss'), 'utf8');
  assert.ok(/\.share-canvas\s*\{[^}]*position:\s*fixed/.test(wxss), 'canvas 必须离屏,不能占布局');
  assert.ok(/\.share-canvas\s*\{[^}]*left:\s*-9999px/.test(wxss));
});

/* ── 跑 ── */
(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log('✓ ' + name);
  }
  console.log('\n' + passed + ' 个用例全部通过');
})().catch(e => {
  console.error('✗ 测试失败: ' + (e && e.message));
  console.error(e);
  process.exit(1);
});
