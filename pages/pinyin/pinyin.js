const py = require('../../utils/pinyin');
const auth = require('../../utils/auth');

Page({
  data: {
    total: py.countAll(),
    masteredCount: 0,
    tables: [],
    blocked: false, // 本家庭未开通「拼音」:整页不呈现内容
  },

  onShow() {
    /* 家长登录门 + 功能权限:未开通整页不呈现 */
    auth.ensurePerm('pinyin', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.renderTables();
      /* 拉取远端掌握进度合并(与网页端共享,离线时用本地原样) */
      py.syncMastered(() => this.renderTables());
    });
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
