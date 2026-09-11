const rc = require('../../utils/recognition');
const auth = require('../../utils/auth');

Page({
  data: {
    blocked: false,     // 本家庭未开通「识记练习」
    loading: true,      // 无缓存可看时的加载态
    loadError: false,   // 拉取失败且本机没有缓存
    gone: false,        // 404:批次已被家长删除/换家庭
    batch: null,        // 批次视图(rc.batchView):标题/学科/日期/卡片数组
  },

  id: '',

  onLoad(options) {
    this.id = (options && options.id) || '';
  },

  onShow() {
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

  /* 第二步接口:按 id 取整批内容。缓存/上一步交接的批次先渲染,再拉服务端刷新 */
  fetch(done) {
    const cached = rc.loadBatch(this.id) || rc.current(this.id);
    if (cached) {
      this.render(cached);
      this.setData({ loading: false, loadError: false });
    } else {
      this.setData({ loading: true, loadError: false, gone: false });
    }
    rc.fetchBatch(this.id, (b, err) => {
      if (b) this.render(b);
      else if (err === 'notfound') this.setData({ gone: true, batch: null, loading: false });
      else if (!cached) this.setData({ loadError: true });
      this.setData({ loading: false });
      if (done) done();
    });
  },

  render(batch) {
    /* 交接给禅模式:点卡片进 zen 免一次拉取(离线也能翻完这一批) */
    rc.setCurrent(batch);
    const view = rc.batchView(batch);
    this.setData({ batch: view, loading: false, loadError: false, gone: false });
    if (view && view.title) wx.setNavigationBarTitle({ title: view.title });
  },

  /* 点卡片进禅模式,从该张开始 */
  onTapCard(e) {
    const i = e.currentTarget.dataset.i;
    if (i == null) return;
    wx.navigateTo({ url: '/pages/recognition/zen?id=' + this.id + '&i=' + i });
  },

  /* 开始认读:从第一张进禅模式 */
  onStart() {
    wx.navigateTo({ url: '/pages/recognition/zen?id=' + this.id + '&i=0' });
  },

  /* 识图图片加载失败(离线/图片已清):该卡就地回退 emoji,不白屏(与人物卡一致) */
  onImgError(e) {
    const i = Number(e.currentTarget.dataset.i);
    const b = this.data.batch;
    if (!b || !b.items[i]) return;
    const items = b.items.slice();
    items[i] = Object.assign({}, items[i], { failed: true });
    this.setData({ 'batch.items': items });
  },

  /* 批次已不在:退回列表页 */
  onBack() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/recognition/recognition' }) });
  },
});
