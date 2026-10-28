const cg = require('../../utils/chengyu');
const auth = require('../../utils/auth');

Page({
  data: {
    blocked: false,      // 本家庭未开通「成语卡片」:整页不呈现内容
    loading: true,       // 无缓存可看时的加载态(有缓存直接呈现,不闪)
    loadError: false,    // 拉取失败且本机没有缓存
    empty: false,        // 服务端确认还没有维护过成语(与「失败」分开文案)
    noMatch: false,      // 有库但搜索没命中
    keyword: '',
    total: 0,
    items: [],
  },

  onShow() {
    /* 家长登录门 + chengyu 功能权限(与网页端/服务端 FEATURES 同一功能键) */
    auth.ensurePerm('chengyu', allowed => {
      if (!allowed) { this.setData({ blocked: true, loading: false }); return; }
      this.setData({ blocked: false });
      const cached = cg.current();
      this.render(cached);
      this.setData({ loading: !cached.length });
      this.fetch();
    });
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  retry() {
    this.fetch();
  },

  /* 本机缓存先渲染(离线也能看已拉过的成语),再拉服务端刷新 */
  fetch(done) {
    cg.refresh((changed, err) => {
      const list = cg.current();
      this.render(list);
      this.setData({
        loading: false,
        loadError: !list.length && !!err,
        empty: !list.length && !err,
      });
      if (done) done();
    });
  },

  render(list) {
    /* 列表只呈现成语 + 逐字拼音(意思/出处进详情);按拼音排序,搜索后仍保持顺序 */
    const items = cg.sortByPinyin(cg.search(list, this.data.keyword)).map(e => ({
      w: e.w,
      tokens: cg.tokensOf(e),
    }));
    this.setData({
      total: list.length,
      items: items,
      noMatch: list.length > 0 && items.length === 0,
    });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
    this.render(cg.current());
  },

  onClearSearch() {
    this.setData({ keyword: '' });
    this.render(cg.current());
  },

  /* 点卡片进详情:按成语定位(中文 URL 编码) */
  onTapItem(e) {
    const w = e.currentTarget.dataset.w;
    if (!w) return;
    wx.navigateTo({ url: '/pages/chengyu/detail?w=' + encodeURIComponent(w) });
  },
});
