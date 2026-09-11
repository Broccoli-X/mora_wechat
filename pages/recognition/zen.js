const rc = require('../../utils/recognition');
const auth = require('../../utils/auth');

Page({
  data: {
    blocked: false,     // 本家庭未开通「识记练习」
    loading: true,
    loadError: false,
    gone: false,        // 404:批次已被家长删除
    title: '',          // 批次名(顶部胶囊)
    total: 0,
    cur: 0,             // 当前张在批次内的下标
    item: null,         // 当前卡视图(rc.itemView)
    prev: null,         // 上一张:换卡动画期间从滑动方向滑出
    dir: 'l',           // 本次滑动方向:'l'=往左滑(旧出左、新自右入) / 'r'=镜像
    seq: 0,             // 换卡序号:奇偶交替类名强制重放入出场动画
    statusBarH: 20,     // 自定义导航:内容与 ✕ 避让状态栏
  },

  id: '',
  start: 0,
  items: [],

  onLoad(options) {
    this.id = (options && options.id) || '';
    const n = parseInt(options && options.i, 10);
    this.start = Number.isFinite(n) && n > 0 ? n : 0;
    /* 家长登录门 + recognition 功能权限:未开通提示后退出(深链误入也挡住) */
    auth.ensurePerm('recognition', allowed => {
      if (!allowed) { this.blockedBack(); return; }
      this.init();
    });
  },

  /* 未开通本功能:提示后退回 */
  blockedBack() {
    wx.showToast({ title: '本家庭未开通此功能', icon: 'none' });
    setTimeout(() => wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) }), 600);
  },

  init() {
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      if (win && win.statusBarHeight) this.setData({ statusBarH: win.statusBarHeight });
    } catch (e) { /* 取不到用默认高度 */ }

    /* 批次页点卡片时已把整批内容交接过来(免一次拉取);深链/重启回落到本机缓存,
       再没有才拉远端 —— 三步顺序保证离线也能翻完已看过的批次 */
    const b = rc.current(this.id) || rc.loadBatch(this.id);
    if (b) { this.applyBatch(b); return; }
    rc.fetchBatch(this.id, (batch, err) => {
      if (batch) { this.applyBatch(batch); return; }
      this.setData({ loading: false, gone: err === 'notfound', loadError: err !== 'notfound' });
    });
  },

  applyBatch(batch) {
    const v = rc.batchView(batch);
    this.items = v.items;
    this.setData({
      title: v.title, total: v.count,
      loading: false, gone: false, loadError: false,
    });
    this.show(Math.min(this.start, Math.max(v.count - 1, 0)));
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

  /* 左右滑动换卡:左滑下一张、右滑上一张,首尾循环(批次是家长排好序的一组内容,
     顺序认读比随机抽认更合用;动效与字母卡禅模式同款:方向感知 + 轻震动) */
  onTouchEnd(e) {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || !this.data.item || this._sx == null) return;
    const dx = t.clientX - this._sx;
    const dy = t.clientY - this._sy;
    if (Math.abs(dx) <= 48 || Math.abs(dx) <= Math.abs(dy)) return;
    this.step(dx < 0 ? 1 : -1);
  },

  step(d) {
    const n = this.items.length;
    if (n <= 1) return;   // 只有一张:换卡动画无从谈起,滑动不响应
    const next = rc.stepIndex(this.data.cur, d, n);
    try { wx.vibrateShort({ type: 'light', fail: () => {} }); } catch (e) { /* 老机型无此 API */ }
    this.setData({
      prev: this.data.item,
      dir: d > 0 ? 'l' : 'r',
      cur: next,
      item: this.items[next],
      seq: this.data.seq + 1,
    });
  },

  /* 识图图片加载失败(离线/图片已清):该卡就地回退 emoji,不白屏 */
  onImgError(e) {
    const i = Number(e.currentTarget.dataset.i);
    if (!this.items[i]) return;
    this.items[i] = Object.assign({}, this.items[i], { failed: true });
    const patch = {};
    if (this.data.item && this.data.item.i === i) patch.item = this.items[i];
    if (this.data.prev && this.data.prev.i === i) patch.prev = this.items[i];
    if (Object.keys(patch).length) this.setData(patch);
  },

  retry() {
    this.setData({ loading: true, loadError: false });
    rc.fetchBatch(this.id, (batch, err) => {
      if (batch) { this.applyBatch(batch); return; }
      this.setData({ loading: false, gone: err === 'notfound', loadError: err !== 'notfound' });
    });
  },

  onClose() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/recognition/recognition' }) });
  },
});
