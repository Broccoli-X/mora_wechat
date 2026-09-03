const hz = require('../../utils/hanzi');

Page({
  data: {
    item: null,
    pos: 0,
    total: 0,
    strokes: 0,
    pyColor: '#FF9500',
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
    hz.syncMastered(() => this.render(this.data.item.char));
  },

  render(c) {
    const masteredMap = hz.loadMastered();
    const item = hz.charView(c, masteredMap);
    /* 拼音含 ü 用紫色,否则橙色(与网页端详情一致) */
    const pyColor = item.py.indexOf('ü') >= 0 ? '#7048E8' : '#FF9500';
    wx.setNavigationBarTitle({ title: c + ' ' + (item.groupName || '') });
    this.setData({
      item,
      pos: this.chars.indexOf(c) + 1,
      total: this.chars.length,
      strokes: hz.strokesCountSync(c),
      pyColor,
    });
    /* 笔画数懒取(内容不可变,取到即永久缓存),失败静默不显示 */
    if (!this.data.strokes) {
      hz.fetchStrokeCount(c, n => {
        if (n && this.data.item && this.data.item.char === c) this.setData({ strokes: n });
      });
    }
  },

  onToggleMaster() {
    const item = this.data.item;
    if (!item) return;
    /* 本地先落盘,再异步上报服务端(多端共享) */
    hz.markMastered(item.char, !item.mastered);
    this.render(item.char);
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
