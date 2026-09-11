const td = require('../../utils/todo');
const auth = require('../../utils/auth');

const TEXT_MAX = 60;

Page({
  data: {
    state: 'loading',  // loading | ok | error
    blocked: false,    // 本家庭未开通「代办」:整页不呈现
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
    time: '08:00',
    editing: false,
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

  onTime(e) {
    this.setData({ time: e.detail.value });
  },

  resetForm() {
    this.editingId = null;
    this.setData({
      text: '',
      counter: '0/' + TEXT_MAX,
      repeat: 'daily',
      date: td.todayStr(),
      time: '08:00',
      editing: false,
    });
    this.setWeeks([]);
  },

  cancelEdit() {
    this.resetForm();
  },

  /* 添加 / 保存修改:同 id 覆盖即编辑(与网页端同协议) */
  submit() {
    const text = this.data.text;
    if (!text.trim()) {
      wx.showToast({ title: '先写一下要办的事哦', icon: 'none' });
      return;
    }
    if (this.data.repeat === 'once' && !td.parseDate(this.data.date)) {
      wx.showToast({ title: '单次的代办要选一下日期', icon: 'none' });
      return;
    }
    if (this.data.repeat === 'weekly' && !this.data.weeks.length) {
      wx.showToast({ title: '每周几至少勾一天哦', icon: 'none' });
      return;
    }
    const entry = td.normalize({
      id: this.editingId || td.newId(),
      text: text,
      repeat: this.data.repeat,
      date: this.data.date,
      weekdays: this.data.weeks.slice(),
      time: this.data.time,
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
      time: entry.time,
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
