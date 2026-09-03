const py = require('../../utils/pinyin');

Page({
  data: {
    total: py.countAll(),
    masteredCount: 0,
    tables: [],
  },

  onShow() {
    this.renderTables();
  },

  /* 每次进入重读掌握进度(从学习页返回也能刷新) */
  renderTables() {
    const masteredMap = py.loadMastered();
    const tables = py.TABLE_ORDER.map(key => {
      const t = py.TABLES[key];
      return {
        ...t,
        count: py.countOf(key),
        mastered: py.countMasteredIn(key, masteredMap),
      };
    });
    this.setData({
      tables,
      masteredCount: py.countMastered(masteredMap),
    });
  },

  onTapTable(e) {
    const type = e.currentTarget.dataset.type;
    if (!type) return;
    wx.navigateTo({ url: '/pages/pinyin/study?type=' + type });
  },

  onTapAdvanced() {
    wx.showToast({ title: '开发中，敬请期待', icon: 'none' });
  },
});
