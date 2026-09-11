const hw = require('../../utils/homework');
const auth = require('../../utils/auth');

/* 单条作业图片上限(与网页端 zuoye-edit 一致);dataURL 服务端上限 80 万字符,留余量 */
const PICS_MAX = 5;
const DATAURL_MAX = 760000;
const TEXT_MAX = 300;

Page({
  data: {
    blocked: false,       // 本家庭未开通「作业」:整页不呈现
    submitting: false,
    today: '',
    date: '',
    dateLine: '',         // 「9月11日 · 星期五」,列表标题用
    subjects: [],         // {name, icon, main, on}
    text: '',
    counter: '0/' + TEXT_MAX,
    textPlaceholder: '例:读课文第5课3遍,生字每字写一行',
    pics: [],             // 待上传图片的本地临时路径(展示用)
    picsMax: PICS_MAX,
    /* 按日期列表:呈现表单日期当天已登记的作业,点条目载入表单修改 */
    listState: 'loading', // loading | ok | error
    rows: [],
    /* 编辑态:正在修改某条(同 id 覆盖),旧图可删、可补新图 */
    editing: false,
    editingLabel: '',
    existImgs: [],        // 保留的旧图片 {id, url}(展示用)
  },

  editingEntry: null,
  entries: [],

  onLoad() {
    const today = hw.todayStr();
    this.setData({
      today: today,
      subjects: hw.SUBJECTS.map((s, i) => ({
        name: s.name, icon: s.icon, main: s.main, on: i === 1, // 默认「语文」,与网页端一致
      })),
    });
    this.setDate(today);
    /* 家长登录门 + 功能权限:未开通整页不呈现;未登录跳登录页,登录后 reLaunch 回来重跑 */
    auth.ensurePerm('homework', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.fetchList();
    });
  },

  onPullDownRefresh() {
    this.fetchList(() => wx.stopPullDownRefresh());
  },

  /* ── 按日期列表:整表拉一次,换日期只本地重筛 ── */
  fetchList(done) {
    if (!this.entries.length) this.setData({ listState: 'loading' });
    hw.fetchHomework(entries => {
      this.entries = entries;
      this.setData({ listState: 'ok' });
      this.renderList();
      if (done) done();
    }, () => {
      this.setData({ listState: 'error' });
      if (done) done();
    });
  },

  retryList() {
    this.fetchList();
  },

  renderList() {
    const rows = this.entries.filter(e => e.date === this.data.date).map(e => {
      const m = hw.metaOf(e.subject);
      return {
        id: e.id,
        icon: m.icon,
        color: m.main,
        subject: e.subject,
        text: e.text,
        pics: e.imgs.length,
        done: !!e.done,
      };
    });
    this.setData({ rows: rows });
  },

  setDate(date) {
    this.setData({
      date: date,
      dateLine: hw.fmtCN(date) + ' · ' + hw.weekdayCN(date),
    });
  },

  /* 换日期:列表跟着换,编辑中的表单内容不动(提交才落) */
  onDate(e) {
    if (!hw.parseDate(e.detail.value)) return;
    this.setDate(e.detail.value);
    this.renderList();
  },

  pickSubject(e) {
    const name = e.currentTarget.dataset.s;
    this.setData({
      subjects: this.data.subjects.map(s => ({ ...s, on: s.name === name })),
      textPlaceholder: name === '整体要求'
        ? '例:全部作业 8 点前完成,写完自己检查一遍'
        : '例:读课文第5课3遍,生字每字写一行',
    });
  },

  onText(e) {
    const text = e.detail.value || '';
    this.setData({ text: text, counter: text.length + '/' + TEXT_MAX });
  },

  /* 选图:压缩档直取,超出上限的取前面的(与网页端 addFiles 同口径); room 含编辑保留的旧图 */
  addPics() {
    const room = PICS_MAX - this.data.pics.length - this.data.existImgs.length;
    if (room <= 0) {
      wx.showToast({ title: '一条作业最多配 ' + PICS_MAX + ' 张图片哦', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: room,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => {
        let files = (res.tempFiles || []).map(f => f.tempFilePath);
        if (files.length > room) {
          files = files.slice(0, room);
          wx.showToast({ title: '最多还能加 ' + room + ' 张,多的没加上哦', icon: 'none' });
        }
        this.setData({ pics: this.data.pics.concat(files) });
      },
    });
  },

  removePic(e) {
    const i = Number(e.currentTarget.dataset.pi);
    const pics = this.data.pics.slice();
    pics.splice(i, 1);
    this.setData({ pics: pics });
  },

  /* 删除编辑中保留的旧图(保存后服务端会按 g 清理不再被引用的图) */
  removeExistImg(e) {
    const i = Number(e.currentTarget.dataset.ei);
    const existImgs = this.data.existImgs.slice();
    existImgs.splice(i, 1);
    this.setData({ existImgs: existImgs });
  },

  /* 本地文件 → base64 dataURL */
  readDataUrl(path) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: path,
        encoding: 'base64',
        success: res => resolve('data:image/jpeg;base64,' + res.data),
        fail: reject,
      });
    });
  },

  compressImg(path, quality) {
    return new Promise((resolve, reject) => {
      wx.compressImage({ src: path, quality: quality, success: res => resolve(res.tempFilePath), fail: reject });
    });
  },

  /* 压到服务端上限内:先压 60,还超再压 30,仍超则放弃这张(开发工具无压缩接口用原图) */
  async toUploadable(path) {
    let src = path;
    try { src = await this.compressImg(path, 60); } catch (e) { src = path; }
    let dataUrl = await this.readDataUrl(src);
    if (dataUrl.length > DATAURL_MAX) {
      try {
        const q2 = await this.compressImg(path, 30);
        dataUrl = await this.readDataUrl(q2);
      } catch (e) { /* 保住第一次的结果 */ }
    }
    if (dataUrl.length > DATAURL_MAX) throw new Error('pic-too-large');
    return dataUrl;
  },

  uploadOne(path) {
    return new Promise((resolve, reject) => {
      this.toUploadable(path).then(dataUrl => {
        hw.uploadImage(dataUrl, resolve, () => reject(new Error('upload-fail')));
      }, () => reject(new Error('pic-too-large')));
    });
  },

  resetForm() {
    this.editingEntry = null;
    this.setDate(this.data.today);
    this.setData({
      subjects: this.data.subjects.map(s => ({ ...s, on: s.name === '语文' })),
      text: '',
      counter: '0/' + TEXT_MAX,
      textPlaceholder: '例:读课文第5课3遍,生字每字写一行',
      pics: [],
      existImgs: [],
      editing: false,
      editingLabel: '',
    });
    this.renderList();
  },

  cancelEdit() {
    this.resetForm();
  },

  /* 点列表条目:载入表单编辑(同 id 覆盖) */
  editRow(e) {
    const id = e.currentTarget.dataset.id;
    const entry = this.entries.find(x => x.id === id);
    if (!entry) return;
    this.editingEntry = entry;
    this.setData({
      editing: true,
      editingLabel: hw.fmtCN(entry.date) + ' · ' + entry.subject,
      date: entry.date,
      subjects: this.data.subjects.map(s => ({ ...s, on: s.name === entry.subject })),
      text: entry.text,
      counter: entry.text.length + '/' + TEXT_MAX,
      textPlaceholder: entry.subject === '整体要求'
        ? '例:全部作业 8 点前完成,写完自己检查一遍'
        : '例:读课文第5课3遍,生字每字写一行',
      pics: [],
      existImgs: entry.imgs.map(g => ({ id: g, url: hw.imgUrl(g) })),
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  async submit() {
    if (this.data.submitting) return;
    const date = this.data.date;
    const subject = (this.data.subjects.filter(s => s.on)[0] || {}).name || '语文';
    const text = (this.data.text || '').trim();
    if (!hw.parseDate(date) || !text) {
      wx.showToast({ title: '日期或作业内容没填好,检查一下哦', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      /* 保留的旧图引用在前,新图先传服务器换 id 追加;任何一张失败就整条不落,
         避免少图同步出去(旧引用一直在,不会误删) */
      const ids = this.data.existImgs.map(v => v.id);
      for (const path of this.data.pics) {
        ids.push(await this.uploadOne(path));
      }
      let entry;
      if (this.data.editing) {
        entry = hw.buildEntry(this.editingEntry, { date: date, subject: subject, text: text, imgs: ids });
        if (!entry) {
          wx.showToast({ title: '日期或内容没填好,检查一下哦', icon: 'none' });
          return;
        }
      } else {
        entry = { id: hw.newId(), date: date, subject: subject, text: text, done: 0, imgs: ids };
      }
      const ok = hw.saveEntry(entry, () => {
        /* 失败不清表单:文字还在,家长修好网络可直接再存(图已传过会重复上传,无害) */
        wx.showToast({ title: '没同步上,检查下网络', icon: 'none' });
      }, () => {
        /* 乐观上列表(同 id 原位替换/新增),不整页重拉 */
        this.entries = hw.sortByDay([...this.entries.filter(x => x.id !== entry.id), entry]);
        const wasEditing = this.data.editing;
        this.resetForm();
        wx.showToast({ title: wasEditing ? '已保存 ✓' : '已登记 ✓', icon: 'success' });
      });
      if (!ok) {
        wx.showToast({ title: '登录状态失效,请重新进入', icon: 'none' });
      }
    } catch (err) {
      if (err && err.message === 'pic-too-large') {
        wx.showToast({ title: '这张图压不下去,换一张试试', icon: 'none' });
      } else {
        wx.showToast({ title: '图片没传上,请重试', icon: 'none' });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },
});
