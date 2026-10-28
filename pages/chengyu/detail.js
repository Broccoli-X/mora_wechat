const cg = require('../../utils/chengyu');
const auth = require('../../utils/auth');

Page({
  data: {
    loading: true,     // 缓存里没有时先显示同步中
    loadError: false,  // 拉取失败(离线且没有缓存)
    notFound: false,   // 服务端/缓存里都没有这条(可能已被家长删除)
    entry: null,
  },

  w: '',

  onLoad(options) {
    if (!auth.ensure()) return;
    this.w = decodeURIComponent(options.w || '');
    if (!this.w) { this.setData({ loading: false, notFound: true }); return; }
    if (this.show()) return;      // 列表页已把缓存拉下来:直接渲染,不闪
    this.fetch();
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  retry() {
    this.setData({ loadError: false });
    this.fetch();
  },

  /* 从当前缓存(本机第一读取点)定位这条成语;找不到返回 false */
  show() {
    const entry = cg.find(cg.current(), this.w);
    if (!entry) return false;
    this.setData({ entry: entry, loading: false, loadError: false, notFound: false });
    return true;
  },

  /* 缓存没有就拉一次服务端;失败且仍没有则按失败/不存在区分文案 */
  fetch(done) {
    cg.refresh((changed, err) => {
      if (!this.show()) {
        this.setData({
          loading: false,
          loadError: !!err,
          notFound: !err,
        });
      }
      if (done) done();
    });
  },

  onShareAppMessage() {
    const e = this.data.entry;
    return {
      title: e ? e.w + ' · ' + e.m.slice(0, 20) : '成语卡片',
      path: '/pages/chengyu/detail?w=' + encodeURIComponent(this.w),
    };
  },
});
