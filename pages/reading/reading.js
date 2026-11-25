const reading = require('../../utils/reading');
const auth = require('../../utils/auth');

const VOLUMES = ['', '上册', '下册'];

Page({
  data: {
    gradeNames: ['全部年级', ...reading.GRADES],
    volumeNames: ['全部册别', ...VOLUMES.slice(1)],
    grade: 0, volume: 0, keyword: '', onlyRead: false,
    loading: true, message: '', articles: [], readCount: 0, total: 0,
  },

  onShow() { this.load(); },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },

  load(done) {
    const seq = this.loadSeq = (this.loadSeq || 0) + 1;
    auth.ensurePerm('reading', async ok => {
      if (seq !== this.loadSeq) { if (done) done(); return; }
      if (!ok) {
        this.items = [];
        this.setData({ loading: false, message: '本家庭未开通文章阅读。' });
        this.render();
        if (done) done();
        return;
      }
      const cache = reading.list();
      if (cache) {
        this.items = cache;
        this.setData({ loading: false, message: '' });
        this.render();
      }
      reading.syncProgress().catch(() => {}).then(() => {
        if (seq === this.loadSeq) this.render();
      });
      try {
        const list = await reading.refreshList();
        if (seq !== this.loadSeq) return;
        this.items = list;
        this.setData({ loading: false, message: '' });
        this.render();
      } catch (e) {
        if (seq !== this.loadSeq) return;
        if (e.status === 403) { this.items = []; this.render(); }
        this.setData({ loading: false, message: e.status === 403 ? '本家庭未开通文章阅读。' :
          cache ? '暂时连不上服务器，当前显示已缓存的目录。' : '文章目录加载失败，下拉重试。' });
      } finally { if (done) done(); }
    });
  },

  onUnload() { this.loadSeq++; },

  render() {
    const { grade, volume, onlyRead, keyword } = this.data;
    const scope = reading.group(this.items || [], grade, VOLUMES[volume]);
    const q = keyword.trim().toLowerCase();
    const articles = scope.map(a => ({ ...a, caption: reading.caption(a), read: reading.isRead(a.progressKey) }))
      .filter(a => (!onlyRead || a.read) && (!q || [a.title, a.pinyin, a.caption].some(s => s.toLowerCase().includes(q))));
    this.setData({ articles, total: scope.length, readCount: scope.filter(a => reading.isRead(a.progressKey)).length });
  },

  onGrade(e) { this.setData({ grade: Number(e.detail.value) }); this.render(); },
  onVolume(e) { this.setData({ volume: Number(e.detail.value) }); this.render(); },
  onSearch(e) { this.setData({ keyword: e.detail.value }); this.render(); },
  onFilter() { this.setData({ onlyRead: !this.data.onlyRead }); this.render(); },
  onOpen(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/reading/detail?id=' + encodeURIComponent(id) +
      '&grade=' + this.data.grade + '&volume=' + this.data.volume });
  },
});
