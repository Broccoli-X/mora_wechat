const kn = require('../../utils/knowledge');
const auth = require('../../utils/auth');

Page({
  data: {
    loading: true,      // 无缓存可看时的加载态(有缓存直接呈现,不闪)
    loadError: false,   // 拉取失败且本机没有缓存
    empty: false,       // 服务端确认还没有维护过教材(与「失败」分开文案)
    total: 0,           // 教材数
    books: [],
  },

  onShow() {
    /* 家长登录门:服务端 /api/knowledge 读取只验 token(写入才限管理员、
       FEATURES 无 knowledge 键),不做功能键过滤 */
    if (!auth.ensure()) return;
    this.fetch();
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  retry() {
    this.fetch();
  },

  /* 本机缓存先渲染(离线也能看已拉过的书目),再拉服务端刷新 */
  fetch(done) {
    const cached = kn.loadBooks();
    if (cached.length) {
      this.render(cached);
      this.setData({ loading: false, loadError: false });
    } else {
      this.setData({ loading: true, loadError: false });
    }
    kn.fetchBooks(list => {
      if (list) this.render(list);
      else if (!cached.length) this.setData({ loadError: true });
      this.setData({ loading: false });
      if (done) done();
    });
  },

  render(list) {
    this.setData({
      books: list.map(b => ({
        bookKey: kn.bookKey(b.grade, b.subject, b.volume),
        grade: b.grade,
        subject: b.subject,
        volume: b.volume,
        title: b.title || (b.grade + b.volume + b.subject + ' · 单元必背知识'),
        meta: b.grade + ' · ' + b.subject + ' · ' + b.volume,
      })),
      total: list.length,
      empty: !list.length,
    });
  },

  /* 点书目卡:进单元列表 */
  onTapBook(e) {
    const d = e.currentTarget.dataset;
    if (!d.grade) return;
    const q = 'grade=' + encodeURIComponent(d.grade) +
      '&subject=' + encodeURIComponent(d.subject) +
      '&volume=' + encodeURIComponent(d.volume);
    wx.navigateTo({ url: '/pages/knowledge/book?' + q });
  },
});
