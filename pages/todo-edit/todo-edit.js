const td = require('../../utils/todo');
const auth = require('../../utils/auth');

const TEXT_MAX = 60;
/* 单条代办图片上限(与 utils/todo.IMGS_MAX 同源);dataURL 服务端上限 80 万字符,留余量 */
const PICS_MAX = td.IMGS_MAX;
const DATAURL_MAX = 760000;

Page({
  data: {
    state: 'loading',  // loading | ok | error
    blocked: false,    // 本家庭未开通「代办」:整页不呈现
    submitting: false,
    /* 表单 */
    textMax: TEXT_MAX,
    text: '',
    counter: '0/' + TEXT_MAX,
    repeats: td.REPEATS,
    repeat: 'daily',
    weekdays: td.WEEKDAY_CN,   // 展示顺序:日 一 二 …(值 = 下标,0=周日)
    weeks: [],                 // 每周几勾选(0~6)
    weekOn: {},                // wxml 不能调 indexOf,勾选状态预计算成映射
    date: '',
    dateEnd: '',               // 单次结束日期(选填;'' = 只当天,与网页端「到」同款)
    time: '08:00',
    editing: false,
    pics: [],             // 待上传图片的本地临时路径(展示用)
    existImgs: [],        // 编辑态保留的旧图片 {id, url}(展示用)
    picsMax: PICS_MAX,
    /* 列表(最近编辑在前,与网页端 todo-edit 一致) */
    rows: [],
  },

  editingId: null,
  entries: [],

  onLoad() {
    this.setData({ date: td.todayStr() });
    /* 家长登录门 + 功能权限:未开通整页不呈现;未登录跳登录页,登录后 reLaunch 回来重跑 */
    auth.ensurePerm('todo', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.fetch();
    });
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  retry() {
    this.fetch();
  },

  fetch(done) {
    if (!this.entries.length) this.setData({ state: 'loading' });
    td.fetchTodos(entries => {
      this.entries = entries;
      this.setData({ state: 'ok' });
      this.render();
      if (done) done();
    }, () => {
      this.setData({ state: 'error' });
      if (done) done();
    });
  },

  render() {
    const rows = td.sortByNew(this.entries).map(e => {
      const r = td.repeatOf(e.repeat) || { icon: '📌', main: '#5f6b7d' };
      return {
        id: e.id,
        chipBg: r.main,
        chipText: r.icon + ' ' + td.describe(e),
        time: '🕗 ' + e.time,
        text: e.text,
        pics: e.imgs.length,
      };
    });
    this.setData({ rows: rows });
  },

  /* ── 表单交互 ── */
  onText(e) {
    const text = e.detail.value || '';
    this.setData({ text: text, counter: text.length + '/' + TEXT_MAX });
  },

  pickRepeat(e) {
    this.setData({ repeat: e.currentTarget.dataset.r });
  },

  /* weeks 与 weekOn 同步更新:wxml 只能做成员访问,勾选态用映射表达 */
  setWeeks(weeks) {
    const weekOn = {};
    for (const w of weeks) weekOn[w] = true;
    this.setData({ weeks: weeks, weekOn: weekOn });
  },

  toggleWeek(e) {
    const w = Number(e.currentTarget.dataset.w);
    const weeks = this.data.weeks.slice();
    const i = weeks.indexOf(w);
    if (i >= 0) weeks.splice(i, 1); else weeks.push(w);
    this.setWeeks(weeks);
  },

  onDate(e) {
    this.setData({ date: e.detail.value });
  },

  onDateEnd(e) {
    if (!td.parseDate(e.detail.value)) return;
    this.setData({ dateEnd: e.detail.value });
  },

  onTime(e) {
    this.setData({ time: e.detail.value });
  },

  /* ── 配图:选图/压缩/上传,与作业维护页同款 ── */
  /* 选图:压缩档直取,超出上限的取前面的(含编辑保留的旧图一起算房间) */
  addPics() {
    const room = PICS_MAX - this.data.pics.length - this.data.existImgs.length;
    if (room <= 0) {
      wx.showToast({ title: '一条代办最多配 ' + PICS_MAX + ' 张图片哦', icon: 'none' });
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

  /* 删除编辑中保留的旧图(保存后按 payload 里的 g 全量覆盖,服务端级联清理弃图) */
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
        td.uploadImage(dataUrl, resolve, () => reject(new Error('upload-fail')));
      }, () => reject(new Error('pic-too-large')));
    });
  },

  resetForm() {
    this.editingId = null;
    this.setData({
      text: '',
      counter: '0/' + TEXT_MAX,
      repeat: 'daily',
      date: td.todayStr(),
      dateEnd: '',
      time: '08:00',
      editing: false,
      pics: [],
      existImgs: [],
    });
    this.setWeeks([]);
  },

  cancelEdit() {
    this.resetForm();
  },

  /* 添加 / 保存修改:同 id 覆盖即编辑(与网页端同协议)。
     新图先传 /api/image 换 id 再上报条目;任何一张失败就整条不落,
     避免少图同步出去(编辑时旧引用一直在,不会误删) */
  async submit() {
    if (this.data.submitting) return;
    const text = this.data.text;
    if (!text.trim()) {
      wx.showToast({ title: '先写一下要办的事哦', icon: 'none' });
      return;
    }
    if (this.data.repeat === 'once') {
      if (!td.parseDate(this.data.date)) {
        wx.showToast({ title: '单次的代办要选一下日期', icon: 'none' });
        return;
      }
      /* 结束日期(选填)显式拦截:非法/早于开始日期提示不放行,与网页端同文案;
         等于开始日期不拦——normalize 会静默退回单日 */
      const de = this.data.dateEnd;
      if (de && !td.parseDate(de)) {
        wx.showToast({ title: '结束日期没选好,检查一下哦', icon: 'none' });
        return;
      }
      if (de && de < this.data.date) {
        wx.showToast({ title: '结束日期不能早于开始日期哦', icon: 'none' });
        return;
      }
    }
    if (this.data.repeat === 'weekly' && !this.data.weeks.length) {
      wx.showToast({ title: '每周几至少勾一天哦', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const ids = this.data.existImgs.map(v => v.id);
      for (const path of this.data.pics) {
        ids.push(await this.uploadOne(path));
      }
      const entry = td.normalize({
        id: this.editingId || td.newId(),
        text: text,
        repeat: this.data.repeat,
        date: this.data.date,
        dateEnd: this.data.dateEnd,
        weekdays: this.data.weeks.slice(),
        time: this.data.time,
        imgs: ids,
        updatedAt: Date.now(),
      });
      if (!entry) {
        wx.showToast({ title: '时间没选好,检查一下哦', icon: 'none' });
        return;
      }
      /* 乐观上列表再上报;失败回滚该条并提示(下次进页以服务端为准) */
      const prev = this.entries.find(x => x.id === entry.id) || null;
      const rollback = quiet => {
        this.entries = prev
          ? td.sortByNew([...this.entries.filter(x => x.id !== prev.id), prev])
          : this.entries.filter(x => x.id !== entry.id);
        this.render();
        if (!quiet) wx.showToast({ title: '没同步上,检查下网络', icon: 'none' });
      };
      this.entries = td.sortByNew([...this.entries.filter(x => x.id !== entry.id), entry]);
      this.render();
      if (!td.pushEntry(entry, rollback)) {
        rollback(true);
        wx.showToast({ title: '登录状态失效,请重新进入', icon: 'none' });
        return;
      }
      const wasEditing = this.data.editing;
      this.resetForm();
      wx.showToast({ title: wasEditing ? '已保存' : '已添加', icon: 'success' });
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

  /* ── 列表操作 ── */
  editRow(e) {
    const id = e.currentTarget.dataset.id;
    const entry = this.entries.find(x => x.id === id);
    if (!entry) return;
    this.editingId = id;
    this.setData({
      editing: true,
      text: entry.text,
      counter: entry.text.length + '/' + TEXT_MAX,
      repeat: entry.repeat,
      date: entry.date || td.todayStr(),
      dateEnd: entry.dateEnd || '',
      time: entry.time,
      pics: [],
      existImgs: entry.imgs.map(g => ({ id: g, url: td.imgUrl(g) })),
    });
    this.setWeeks((entry.weekdays || []).slice());
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  delRow(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除代办',
      content: '确定删除这条代办吗?删除会同步到所有设备',
      confirmText: '删除',
      confirmColor: '#c9392b',
      success: res => {
        if (!res.confirm) return;
        const prev = this.entries;
        this.entries = this.entries.filter(x => x.id !== id);
        this.render();
        const ok = td.pushTombstone(id, () => {
          this.entries = prev;
          this.render();
          wx.showToast({ title: '没删掉,检查下网络', icon: 'none' });
        });
        if (!ok) {
          this.entries = prev;
          this.render();
          wx.showToast({ title: '登录状态失效,请重新进入', icon: 'none' });
        }
      },
    });
  },
});
