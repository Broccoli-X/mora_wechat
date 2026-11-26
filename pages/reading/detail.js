const auth = require('../../utils/auth');
const reading = require('../../utils/reading');

Page({
  data: {
    article: null, paragraphs: [], titleTokens: [], titleAnnotated: false, hidePinyin: false,
    titleNoteTokens: [], titleNoteOpen: false,
    pos: 0, total: 0, read: false, loading: true, message: '',
    strokeChar: '', strokePinyin: '',
  },

  onLoad(options) {
    this.id = options.id || '';
    this.grade = Number(options.grade) || 0;
    this.volume = ['', '上册', '下册'][Number(options.volume)] || '';
    this.loadSeq = 0;
  },

  onShow() { this.load(); },

  load() {
    const seq = ++this.loadSeq;
    auth.ensurePerm('reading', async allowed => {
      if (seq !== this.loadSeq) return;
      if (!allowed) {
        this.setData({ article: null, loading: false, message: '本家庭未开通文章阅读。' });
        return;
      }
      reading.syncProgress().catch(() => {}).then(() => {
        if (seq === this.loadSeq) this.renderRead();
      });
      try {
        this.items = await reading.refreshList();
      } catch (e) {
        if (seq !== this.loadSeq) return;
        if (e.status === 403) {
          this.setData({ article: null, loading: false, message: '本家庭未开通文章阅读。' });
          return;
        }
        this.items = reading.list() || [];
      }
      if (seq === this.loadSeq) this.open(this.id);
    });
  },

  async open(id, turn = false) {
    const seq = ++this.loadSeq;
    this.closeStroke();
    this.id = id;
    const brief = (this.items || []).find(item => item.id === id);
    const current = this.data.article;
    // 返回前台时保留未变化文章的阅读位置和展开状态。
    if (current && brief && current.id === id && current.revision === brief.revision) {
      this.renderRead();
      return;
    }
    this.setData({ article: null, loading: true, message: '' });
    try {
      const article = await reading.article(id, brief && brief.revision);
      if (seq !== this.loadSeq) return;
      const titleTokens = reading.splitText(article.title, article.pinyin);
      const paragraphs = article.paragraphs.map((p, index) => ({
        index, tokens: reading.splitText(p.text, p.pinyin), annotated: Boolean(p.pinyin), note: Boolean(p.note),
        noteTokens: p.note ? reading.splitText(p.note) : [], noteOpen: false,
      }));
      const scope = this.scope();
      this.setData({
        article: { id, revision: article.revision, progressKey: article.progressKey,
          caption: reading.caption(article), author: article.author || '' },
        titleTokens, titleAnnotated: Boolean(article.pinyin), paragraphs, loading: false,
        titleNoteTokens: reading.splitText(article.titleNote || ''), titleNoteOpen: false,
        pos: scope.findIndex(item => item.id === id) + 1, total: scope.length,
        read: reading.isRead(article.progressKey),
      });
      wx.setNavigationBarTitle({ title: article.title });
      if (turn) wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (e) {
      if (seq !== this.loadSeq) return;
      this.setData({ loading: false,
        message: e.status === 404 ? '这篇文章已移除。' : '暂时打不开文章，请检查网络后重试。' });
    }
  },

  onUnload() { this.loadSeq++; },
  onHide() { this.closeStroke(); },

  scope() { return reading.group(this.items || [], this.grade, this.volume); },
  renderRead() {
    if (this.data.article) this.setData({ read: reading.isRead(this.data.article.progressKey) });
  },
  toggleRead() { this.setData({ read: reading.toggle(this.data.article.progressKey) }); },
  togglePinyin() { this.setData({ hidePinyin: !this.data.hidePinyin }); },
  toggleTitleNote() { this.setData({ titleNoteOpen: !this.data.titleNoteOpen }); },
  toggleNote(e) {
    const i = e.currentTarget.dataset.index;
    this.setData({ ['paragraphs[' + i + '].noteOpen']: !this.data.paragraphs[i].noteOpen });
  },
  tapChar(e) {
    const { char, pinyin } = e.currentTarget.dataset;
    this.setData({ strokeChar: char, strokePinyin: pinyin });
  },
  closeStroke() {
    if (this.data.strokeChar) this.setData({ strokeChar: '', strokePinyin: '' });
  },
  turn(e) {
    const items = this.scope();
    const pos = items.findIndex(item => item.id === this.id);
    if (pos >= 0 && items.length > 1) {
      const step = Number(e.currentTarget.dataset.step);
      this.open(items[(pos + step + items.length) % items.length].id, true);
    }
  },
});
