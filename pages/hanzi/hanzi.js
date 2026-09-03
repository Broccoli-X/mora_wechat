const hz = require('../../utils/hanzi');

Page({
  data: {
    total: 0,
    masteredCount: 0,
    groups: [],
  },

  onShow() {
    this.render();
    /* 拉取远端掌握进度合并(与网页端共享,离线时用本地原样) */
    hz.syncMastered(() => this.render());
    /* 字库有更新(网页端维护了新字/新组)则重渲染,失败静默用本地 */
    hz.fetchDataset(() => this.render());
  },

  render() {
    const masteredMap = hz.loadMastered();
    this.setData({
      total: hz.countAll(),
      masteredCount: hz.countMastered(masteredMap),
      groups: hz.groupCardViews(masteredMap),
    });
  },

  onTapAll() {
    wx.navigateTo({ url: '/pages/hanzi/study?g=' + hz.ALL_KEY });
  },

  onTapGroup(e) {
    const g = e.currentTarget.dataset.g;
    if (!g) return;
    wx.navigateTo({ url: '/pages/hanzi/study?g=' + g });
  },
});
