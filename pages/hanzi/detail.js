const hz = require('../../utils/hanzi');
const draw = require('../../utils/hanzi-draw');

Page({
  data: {
    item: null,
    pos: 0,
    total: 0,
    pyColor: '#FF9500',
    hasStrokes: false,
    strokeCount: 0,
    steps: [],
  },

  onLoad(options) {
    const g = options && options.g ? options.g : hz.ALL_KEY;
    const c = options && options.c ? decodeURIComponent(options.c) : '';
    if (!hz.isValidScope(g) || !hz.hasChar(c)) {
      wx.showToast({ title: '内容不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.g = g;
    this.chars = hz.scopeChars(g);
    this.render(c);
    /* 拉取远端掌握进度合并(与网页端共享,离线时用本地原样) */
    hz.syncMastered(map => this.mergeMastered(map));
  },

  /* 同步合并后只刷新掌握星标,不打断画布 */
  mergeMastered(map) {
    const item = this.data.item;
    if (item && map[item.char] !== item.mastered) {
      this.setData({ item: { ...item, mastered: !!map[item.char] } });
    }
  },

  render(c) {
    const item = hz.charView(c, hz.loadMastered());
    /* 拼音含 ü 用紫色,否则橙色(与网页端详情一致) */
    const pyColor = item.py.indexOf('ü') >= 0 ? '#7048E8' : '#FF9500';
    wx.setNavigationBarTitle({ title: c + ' ' + (item.groupName || '') });
    this.frames = null;
    this.bbox = null;
    this.setData({
      item,
      pos: this.chars.indexOf(c) + 1,
      total: this.chars.length,
      pyColor,
      hasStrokes: false,
      strokeCount: 0,
      steps: [],
    });
    /* 笔画数据三级:打包 → 本地缓存 → /api/hanzi-stroke 懒取(在线新增字),失败回退楷体大字 */
    const bundled = hz.strokeDataSync(c);
    if (bundled) this.applyStrokes(bundled);
    else {
      hz.fetchStrokes(c, d => {
        if (d && this.data.item && this.data.item.char === c) this.applyStrokes(d);
      });
    }
  },

  /* 就绪笔画数据:预解析逐笔轮廓与整字包围盒,渲染田字格整字与逐笔分解图 */
  applyStrokes(d) {
    this.frames = d.strokes.map(path => ({ segs: draw.parsePath(path) }));
    this.bbox = draw.charBBox(d.strokes, 0.02);
    this.setData({
      hasStrokes: true,
      strokeCount: this.frames.length,
      steps: this.frames.map((_, i) => i),
    }, () => this.initCanvases());
  },

  /* 画布节点就绪(dpr 缩放保证清晰)并整体绘制 */
  initCanvases() {
    const q = wx.createSelectorQuery().in(this);
    q.select('#hw-canvas').fields({ node: true, size: true });
    q.selectAll('.stroke-step').fields({ node: true, size: true });
    q.exec(res => {
      const main = res && res[0];
      const cells = (res && res[1]) || [];
      if (!main || !main.node) return;
      this.canvas = this.setupCanvas(main.node, main.width, main.height);
      this.cells = cells.map(cv => this.setupCanvas(cv.node, cv.width, cv.height));
      this.drawAll();
    });
  },

  setupCanvas(node, w, h) {
    let dpr = 2;
    try {
      dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
    } catch (e) { /* 取不到用 2 */ }
    node.width = Math.round(w * dpr);
    node.height = Math.round(h * dpr);
    const ctx = node.getContext('2d');
    ctx.scale(dpr, dpr);
    return { node, ctx, w, h };
  },

  drawAll() {
    if (!this.frames || !this.bbox) return;
    if (this.canvas) {
      const { ctx, w, h } = this.canvas;
      ctx.clearRect(0, 0, w, h);
      draw.drawChar(ctx, this.frames, draw.makeTransform(this.bbox, w, h), '#333333');
    }
    /* 逐笔分解:第 k 格 = 前 k+1 笔深色,其余浅灰 */
    this.cells.forEach((cv, k) => {
      cv.ctx.clearRect(0, 0, cv.w, cv.h);
      draw.drawStep(cv.ctx, this.frames, draw.makeTransform(this.bbox, cv.w, cv.h), k + 1);
    });
  },

  onToggleMaster() {
    const item = this.data.item;
    if (!item) return;
    /* 本地先落盘,再异步上报服务端(多端共享) */
    hz.markMastered(item.char, !item.mastered);
    this.setData({ item: hz.charView(item.char, hz.loadMastered()) });
  },

  onPrev() {
    const i = this.chars.indexOf(this.data.item.char);
    this.render(this.chars[(i - 1 + this.chars.length) % this.chars.length]);
  },

  onNext() {
    const i = this.chars.indexOf(this.data.item.char);
    this.render(this.chars[(i + 1) % this.chars.length]);
  },
});
