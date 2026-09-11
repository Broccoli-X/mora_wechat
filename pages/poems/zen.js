const pm = require('../../utils/poems');
const auth = require('../../utils/auth');

Page({
  data: {
    item: null,         // 当前古诗视图 {key, t, d, p, titleTokens, poetTokens, lines, c1, c2, mastered}
    prev: null,         // 上一首:换卡动画期间从滑动方向滑出
    dir: 'r',           // 本次滑动方向: 'l'=往左滑(旧出左新入右) / 'r'=往右滑(镜像)
    prevDir: 'r',
    masteredCount: 0,
    total: 0,
    pyHidden: false,    // 遮拼音自测(网页端随机复习闪卡「遮住拼音」同款),换诗后恢复显示
    statusBarH: 20,     // 自定义导航:内容与 ✕ 避让状态栏
    seq: 0,             // 换卡序号:奇偶交替类名强制重放入出场动画
    cur: 0,
  },

  onLoad(options) {
    /* 家长登录门 + poems 功能权限:未开通提示后退出(深链误入也挡住) */
    auth.ensurePerm('poems', allowed => {
      if (!allowed) { this.blockedBack(); return; }
      this.init(options);
    });
  },

  /* 未开通本功能:提示后退回 */
  blockedBack() {
    wx.showToast({ title: '本家庭未开通此功能', icon: 'none' });
    setTimeout(() => wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) }), 600);
  },

  init(options) {
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      if (win && win.statusBarHeight) this.setData({ statusBarH: win.statusBarHeight });
    } catch (e) { /* 取不到用默认高度 */ }

    let i = 0;
    if (options && options.i != null) {
      const n = parseInt(options.i, 10);
      if (n >= 0 && n < pm.countAll()) i = n;
    }
    this.setData({ total: pm.countAll() });
    this.apply(i);
  },

  /* 首张入场(无旧卡),dir 默认 'r':从左侧滑入 */
  apply(i) {
    const map = pm.loadMastered();
    this.setData({
      cur: i,
      item: pm.views(map)[i],
      prev: null,
      masteredCount: pm.countMastered(map),
      dir: 'r',
      seq: this.data.seq + 1,
    });
  },

  /* 左右滑动随机换一首(左右等价,都不与当前重复),带方向感知的出/入动画 + 轻触感 */
  onTouchStart(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    this._sx = t.clientX;
    this._sy = t.clientY;
  },

  onTouchEnd(e) {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || !this.data.item || this._sx == null) return;
    const dx = t.clientX - this._sx;
    const dy = t.clientY - this._sy;
    if (Math.abs(dx) <= 48 || Math.abs(dx) <= Math.abs(dy)) return;

    const dir = dx < 0 ? 'l' : 'r'; // 'l'=往左滑:旧卡出左、新卡右入;'r'=镜像
    const map = pm.loadMastered();
    const next = pm.randomNext(this.data.cur);
    try { wx.vibrateShort({ type: 'light', fail: () => {} }); } catch (e2) { /* 老机型无此 API */ }
    this.setData({
      prev: this.data.item,
      prevDir: dir,
      dir,
      cur: next,
      item: pm.views(map)[next],
      masteredCount: pm.countMastered(map),
      pyHidden: false, // 新一首先显示拼音,便于认读(与网页端闪卡一致)
      seq: this.data.seq + 1,
    });
  },

  /* 遮住/显示拼音(网页端随机复习闪卡同款) */
  onTogglePy() {
    this.setData({ pyHidden: !this.data.pyHidden });
  },

  /* 点 ⭐ 标记掌握:本地先落盘,再异步上报服务端(多端共享)。
     滑出的旧卡星标未绑事件,只有当前卡响应 */
  onToggleStar() {
    const item = this.data.item;
    if (!item) return;
    pm.markMastered(item.key, !pm.loadMastered()[item.key]);
    const map = pm.loadMastered();
    this.setData({
      item: pm.views(map)[this.data.cur],
      masteredCount: pm.countMastered(map),
    });
  },

  onClose() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/poems/poems' }) });
  },
});
