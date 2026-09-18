const kn = require('../../utils/knowledge');
const auth = require('../../utils/auth');

Page({
  data: {
    loading: true,
    loadError: false,
    gone: false,        // 这一册还没有内容 / 单元不在了
    title: '',          // 单元名(顶部胶囊)
    total: 0,
    cur: 0,             // 当前块在单元内的下标
    item: null,         // 当前卡视图(kn.blockView)
    prev: null,         // 上一张:换卡动画期间从滑动方向滑出
    dir: 'l',           // 本次滑动方向:'l'=往左滑(旧出左、新自右入) / 'r'=镜像
    seq: 0,             // 换卡序号:奇偶交替类名强制重放入出场动画
    hint: '',           // 底部操作提示
    statusBarH: 20,     // 自定义导航:内容与 ✕ 避让状态栏
  },

  g: '',
  s: '',
  v: '',
  u: 0,
  items: [],

  onLoad(options) {
    if (!auth.ensure()) return;
    this.g = decodeURIComponent(options.grade || '');
    this.s = decodeURIComponent(options.subject || '');
    this.v = decodeURIComponent(options.volume || '');
    const n = parseInt(options.u, 10);
    this.u = Number.isFinite(n) && n >= 0 ? n : 0;
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      if (win && win.statusBarHeight) this.setData({ statusBarH: win.statusBarHeight });
    } catch (e) { /* 取不到用默认高度 */ }
    this.init();
  },

  init() {
    /* 单元页点单元时已把整本交接过来(免一次拉取);深链/重启回落到本机缓存,
       再没有才拉远端 —— 三步顺序保证离线也能翻完已看过的单元 */
    const book = kn.current(this.g, this.s, this.v) || kn.loadBook(this.g, this.s, this.v);
    if (book) { this.applyBook(book); return; }
    kn.fetchBook(this.g, this.s, this.v, (book, err) => {
      if (book) { this.applyBook(book); return; }
      this.setData({ loading: false, gone: err === 'empty', loadError: err !== 'empty' });
    });
  },

  applyBook(book) {
    const unit = book.data.units[this.u];
    if (!unit) { this.setData({ loading: false, gone: true }); return; }
    this.items = kn.unitItems(book, this.u);
    if (!this.items.length) { this.setData({ loading: false, gone: true }); return; }
    this.setData({
      title: unit.name + (book.data.title ? ' · ' + book.data.title : ''),
      total: this.items.length,
      hint: this.items.length > 1 ? '← 左滑下一项 · 右滑上一项 →' : '',
      loading: false, gone: false, loadError: false,
    });
    this.show(0);
  },

  /* 首张入场(无旧卡):从左侧滑入 */
  show(i) {
    this.setData({
      cur: i, item: this.items[i], prev: null,
      dir: 'r', seq: this.data.seq + 1,
    });
  },

  onTouchStart(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    this._sx = t.clientX;
    this._sy = t.clientY;
  },

  /* 左右滑动换卡:左滑下一项、右滑上一项,首尾循环(单元是家长整理好的必背顺序,
     顺序背比随机抽更合用;动效与识记禅模式同款:方向感知 + 轻震动)。
     知识块是「读背」内容、没有藏答案的正面/反面,轻点不翻面。 */
  onTouchEnd(e) {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || !this.data.item || this._sx == null) return;
    const dx = t.clientX - this._sx;
    const dy = t.clientY - this._sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      this.step(dx < 0 ? 1 : -1);
    }
  },

  step(d) {
    const n = this.items.length;
    if (n <= 1) return;   // 只有一张:换卡动画无从谈起,滑动不响应
    const next = kn.stepIndex(this.data.cur, d, n);
    try { wx.vibrateShort({ type: 'light', fail: () => {} }); } catch (e) { /* 老机型无此 API */ }
    this.setData({
      prev: this.data.item,
      dir: d > 0 ? 'l' : 'r',
      cur: next,
      item: this.items[next],
      seq: this.data.seq + 1,
    });
  },

  /* 象形字插图加载失败(离线/图片没了):该图就地置灰占位,图注还在,不白屏 */
  onImgError(e) {
    const ci = Number(e.currentTarget.dataset.i);
    const pi = Number(e.currentTarget.dataset.pi);
    const it = this.items[ci];
    if (!it || !it.pics || !it.pics[pi] || it.pics[pi].failed) return;
    it.pics = it.pics.map((p, k) => (k === pi ? Object.assign({}, p, { failed: true }) : p));
    const patch = {};
    if (this.data.item && this.data.item.i === ci) patch.item = Object.assign({}, this.data.item, { pics: it.pics });
    if (this.data.prev && this.data.prev.i === ci) patch.prev = Object.assign({}, this.data.prev, { pics: it.pics });
    if (Object.keys(patch).length) this.setData(patch);
  },

  retry() {
    this.setData({ loading: true, loadError: false });
    kn.fetchBook(this.g, this.s, this.v, (book, err) => {
      if (book) { this.applyBook(book); return; }
      this.setData({ loading: false, gone: err === 'empty', loadError: err !== 'empty' });
    });
  },

  onClose() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/knowledge/knowledge' }) });
  },
});
