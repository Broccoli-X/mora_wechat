const rc = require('../../utils/recognition');
const auth = require('../../utils/auth');

Page({
  data: {
    blocked: false,     // 本家庭未开通「识记练习」:整页不呈现内容
    loading: true,      // 无缓存可看时的加载态(有缓存直接呈现,不闪)
    loadError: false,   // 拉取失败且本机没有缓存
    empty: false,       // 服务端确认还没有录入过批次(与「失败」分开文案)
    total: 0,           // 批次数
    itemCount: 0,       // 条目总数
    sections: [],       // 按学科分节(识汉字→认单词→识图,空科不呈现)
  },

  onShow() {
    /* 家长登录门 + recognition 功能权限(与网页端识记练习同一功能键) */
    auth.ensurePerm('recognition', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.fetch();
    });
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  retry() {
    this.fetch();
  },

  /* 本机缓存先渲染(离线也能看已拉过的批次),再拉服务端刷新;列表接口只给概要 */
  fetch(done) {
    const cached = rc.loadBatches();
    if (cached.length) {
      this.render(cached);
      this.setData({ loading: false, loadError: false });
    } else {
      this.setData({ loading: true, loadError: false });
    }
    rc.fetchBatches(list => {
      if (list) this.render(list);
      else if (!cached.length) this.setData({ loadError: true });
      this.setData({ loading: false });
      if (done) done();
    });
  },

  render(list) {
    const st = rc.statsOf(list);
    this.setData({
      sections: rc.sections(list),
      total: st.batches,
      itemCount: st.items,
      empty: !st.batches,
    });
  },

  /* 点批次卡:进批次详情(卡片网格),再点卡片进禅模式 */
  onTapBatch(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/recognition/batch?id=' + id });
  },
});
