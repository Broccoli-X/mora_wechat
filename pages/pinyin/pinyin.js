const py = require('../../utils/pinyin');
const auth = require('../../utils/auth');

Page({
  data: {
    total: py.countAll(),
    masteredCount: 0,
    tables: [],
  },

  onShow() {
    this.renderTables();
    /* 家长登录门:未登录跳登录页(本地缓存照常先渲染),登录后回来再同步 */
    if (!auth.ensure()) return;
    /* 拉取远端掌握进度合并(与网页端共享,离线时用本地原样) */
    py.syncMastered(() => this.renderTables());
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
