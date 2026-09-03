const py = require('../../utils/pinyin');

Page({
  data: {
    type: '',
    isSd: false,
    groups: [],
    total: 0,
    masteredCount: 0,
    percent: 0,
  },

  onLoad(options) {
    const type = options && options.type ? options.type : '';
    if (!py.TABLES[type]) {
      wx.showToast({ title: '内容不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    wx.setNavigationBarTitle({ title: py.TABLES[type].title });
    this.render(type);
    /* 拉取远端掌握进度合并(与网页端共享,离线时用本地原样) */
    py.syncMastered(() => this.render(type));
  },

  render(type) {
    const masteredMap = py.loadMastered();
    const groups = py.studyGroups(type, masteredMap);
    const total = py.countOf(type);
    const masteredCount = py.countMasteredIn(type, masteredMap);
    this.setData({
      type,
      isSd: type === 'sd',
      groups,
      total,
      masteredCount,
      percent: total ? Math.round((masteredCount / total) * 100) : 0,
    });
  },

  onToggleStar(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const item = this.data.groups[gi] && this.data.groups[gi].items[ii];
    if (!item) return;
    /* 本地先落盘,再异步上报服务端(多端共享) */
    py.markMastered(item.key, !item.mastered);
    this.render(this.data.type);
  },
});
