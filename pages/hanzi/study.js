const hz = require('../../utils/hanzi');

Page({
  data: {
    g: '',
    groups: [],
    total: 0,
    masteredCount: 0,
    percent: 0,
  },

  onLoad(options) {
    const g = options && options.g ? options.g : hz.ALL_KEY;
    if (!hz.isValidScope(g)) {
      wx.showToast({ title: '内容不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const name = g === hz.ALL_KEY ? '全部汉字' : this.groupName(g);
    wx.setNavigationBarTitle({ title: name || '识字卡片' });
    this.render(g);
    /* 拉取远端掌握进度合并(与网页端共享,离线时用本地原样) */
    hz.syncMastered(() => this.render(g));
  },

  /* 从详情页标记返回时刷新星标 */
  onShow() {
    if (this.data.g) this.render(this.data.g);
  },

  groupName(g) {
    const grp = hz.viewIndex().GROUPS.find(x => x.key === g);
    return grp ? grp.name : '';
  },

  render(g) {
    const masteredMap = hz.loadMastered();
    const groups = hz.studyGroups(g, masteredMap);
    const total = hz.countOf(g);
    const masteredCount = hz.countMasteredIn(g, masteredMap);
    this.setData({
      g,
      groups,
      total,
      masteredCount,
      percent: total ? Math.round((masteredCount / total) * 100) : 0,
    });
  },

  onToggleStar(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const group = this.data.groups[gi];
    const item = group && group.items[ii];
    if (!item) return;
    /* 本地先落盘,再异步上报服务端(多端共享) */
    hz.markMastered(item.char, !item.mastered);
    this.render(this.data.g);
  },

  onTapCard(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const group = this.data.groups[gi];
    const item = group && group.items[ii];
    if (!item) return;
    wx.navigateTo({
      url: '/pages/hanzi/detail?g=' + this.data.g + '&c=' + encodeURIComponent(item.char),
    });
  },
});
