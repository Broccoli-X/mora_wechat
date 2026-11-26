const hz = require('../../utils/hanzi');
const auth = require('../../utils/auth');

Page({
  data: {
    total: 0,
    masteredCount: 0,
    groups: [],
    query: '',
    searchResult: null,
    blocked: false, // 本家庭未开通「识字」:整页不呈现内容
  },

  onShow() {
    /* 家长登录门 + 功能权限:未开通整页不呈现 */
    auth.ensurePerm('chars', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.render();
      /* 更新字库后同步掌握进度，新加入的字也能识别已有星标。 */
      hz.fetchDataset(() => {
        this.render();
        hz.syncMastered(() => this.render());
      });
    });
  },

  render() {
    const masteredMap = hz.loadMastered();
    this.setData({
      total: hz.countAll(),
      masteredCount: hz.countMastered(masteredMap),
      groups: hz.groupCardViews(masteredMap),
      searchResult: hz.findCard(this.data.query.trim()) || null,
    });
  },

  onSearchInput(e) {
    const query = e.detail.value;
    this.setData({ query, searchResult: hz.findCard(query.trim()) || null });
  },

  onClearSearch() {
    this.setData({ query: '', searchResult: null });
  },

  onTapSearchResult() {
    const card = this.data.searchResult;
    if (!card) return;
    wx.navigateTo({ url: '/pages/hanzi/detail?g=' + encodeURIComponent(card.groupKey) + '&c=' + encodeURIComponent(card.char) });
  },

  onTapAll() {
    wx.navigateTo({ url: '/pages/hanzi/study?g=' + hz.ALL_KEY });
  },

  onTapGroup(e) {
    const g = e.currentTarget.dataset.g;
    if (!g) return;
    wx.navigateTo({ url: '/pages/hanzi/study?g=' + encodeURIComponent(g) });
  },
});
