const hw = require('../../utils/homework');
const pt = require('../../utils/points');
const td = require('../../utils/todo');
const auth = require('../../utils/auth');
const letters = require('../../utils/letters');

// 首页认读只用内置卡面。访客翻卡不读取或写入家庭掌握记录。
const letterCards = letters.views();

Page({
  data: {
    title: 'Mora 学习卡片',
    subtitle: '碎片时间 · 高效记忆',
    dateLine: '',
    guest: false,
    letterCard: letterCards[0],
    letterCount: letterCards.length,
    course: { show: false },
    tdState: 'loading', // loading | ok | error
    tdItems: [],
    hwState: 'loading', // loading | ok | error
    hwItems: [],
    ptState: 'loading', // loading | ok | error
    ptEmoji: '',
    ptEmpty: true,
    ptEarned: 0,
    ptRemaining: 0,
    ptYuan: '0',
    ptAllowed: false,    // 功能权限:未开通的区块整个不呈现
    tdAllowed: false,
    courseAllowed: false,
    hwAllowed: false,
  },

  onShow() {
    this.renderDate();
    if (!auth.getToken()) { this.showGuest(); return; }
    this.setData({ guest: false });
    /* 功能权限:先按本地缓存摆区块,再拉最新纠正(没变化不重取数据) */
    this.applyPerms();
    auth.refreshPerms(ok => { if (ok) this.applyPermsIfChanged(); });
  },

  onPullDownRefresh() {
    this.renderDate();
    if (!auth.getToken()) {
      this.showGuest();
      wx.stopPullDownRefresh();
      return;
    }
    const token = auth.getToken();
    auth.refreshPerms(() => {
      if (auth.getToken() === token) this.applyPerms(() => wx.stopPullDownRefresh());
      else wx.stopPullDownRefresh();
    });
  },

  showGuest() {
    this.setData({
      guest: true,
      ptAllowed: false, tdAllowed: false, courseAllowed: false, hwAllowed: false,
      course: { show: false }, hwItems: [], tdItems: [],
      ptEmoji: '', ptEmpty: true, ptEarned: 0, ptRemaining: 0, ptYuan: '0',
    });
  },

  turnLetter(e) {
    const step = Number(e.currentTarget.dataset.step);
    const index = (this.data.letterCard.i + step + letterCards.length) % letterCards.length;
    this.setData({ letterCard: letterCards[index] });
  },

  openLogin() { auth.openLogin(); },

  /* 页面定义了 onShareAppMessage 右上角胶囊菜单的「转发」才会亮起,否则提示"当前页面不可转发";
     onShareTimeline 点亮「分享到朋友圈」。页内不放分享按钮,分享只走胶囊菜单 */
  onShareAppMessage() {
    return {
      title: 'Mora 学习卡片 · 今日作业与代办一查便知',
      path: '/pages/index/index',
    };
  },

  onShareTimeline() {
    return { title: 'Mora 学习卡片 · 碎片时间高效记忆' };
  },

  /* 按当前家庭的权限摆区块:未开通的整个不呈现,也不发起取数 */
  applyPerms(done) {
    const flags = {
      ptAllowed: auth.hasPerm('points'),
      tdAllowed: auth.hasPerm('todo'),
      courseAllowed: auth.hasPerm('kebiao'),
      hwAllowed: auth.hasPerm('homework'),
    };
    this.setData(flags);
    this.renderCourse();
    const jobs = [];
    if (flags.courseAllowed) jobs.push(d => this.loadCourse(d));
    if (flags.tdAllowed) jobs.push(d => this.loadTodos(d));
    if (flags.hwAllowed) jobs.push(d => this.loadHomework(d));
    if (flags.ptAllowed) jobs.push(d => this.loadPoints(d));
    let pending = jobs.length;
    const one = () => { pending -= 1; if (pending === 0 && done) done(); };
    if (!pending) { if (done) done(); return; }
    jobs.forEach(job => job(one));
  },

  /* 权限没变化就不重取数据(缓存 + 刷新两次 apply 只取一次) */
  applyPermsIfChanged() {
    const d = this.data;
    if (d.ptAllowed === auth.hasPerm('points') &&
        d.tdAllowed === auth.hasPerm('todo') &&
        d.courseAllowed === auth.hasPerm('kebiao') &&
        d.hwAllowed === auth.hasPerm('homework')) return;
    this.applyPerms();
  },

  renderDate() {
    const d = new Date();
    this.setData({
      dateLine: (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + hw.WEEKDAY_CN[d.getDay()],
    });
  },

  /* 课程模块:单条展示,判定逻辑在 utils(当前节 → 下一节 → 次日 → 隐藏);没权限整个隐藏 */
  renderCourse() {
    // 课表模块在首次载入时读取家庭缓存，只在已开通课表时载入。
    const course = this.data.courseAllowed
      ? require('../../utils/kebiao').homeLesson(new Date())
      : { show: false };
    this.setData({ course });
  },

  /* 课程模块取数:拉一次在线课表,有更新就重画(缓存 / 默认课表已由 renderCourse 同步画出) */
  loadCourse(done) {
    const kb = require('../../utils/kebiao');
    kb.refresh(() => { this.renderCourse(); if (done) done(); });
  },

  /* 今日代办:只读展示当天清单(内容在网页端家长页维护),按时间先后 */
  loadTodos(done) {
    this.setData({ tdState: 'loading' });
    td.fetchTodos(entries => {
      const items = td.todosOn(entries, td.todayStr()).map(e => {
        const m = td.repeatOf(e.repeat);
        return {
          id: e.id,
          icon: m.icon,
          color: m.main,
          time: e.time,
          text: e.text,
          pics: e.imgs.length, // 有配图的角标提示(图片在代办详情页看大图)
        };
      });
      this.setData({ tdState: 'ok', tdItems: items });
      if (done) done();
    }, () => {
      this.setData({ tdState: 'error' });
      if (done) done();
    });
  },

  retryTodos() {
    this.loadTodos();
  },

  loadHomework(done) {
    this.setData({ hwState: 'loading' });
    hw.fetchHomework(entries => {
      const today = hw.todayStr();
      const items = entries.filter(e => e.date === today).map(e => {
        const m = hw.metaOf(e.subject);
        return {
          id: e.id,
          icon: m.icon,
          color: m.main,
          subject: e.subject,
          text: e.text,
          done: !!e.done,
          pics: e.imgs.length,
        };
      });
      this.setData({ hwState: 'ok', hwItems: items });
      if (done) done();
    }, () => {
      this.setData({ hwState: 'error' });
      if (done) done();
    });
  },

  retryHw() {
    this.loadHomework();
  },

  /* 积分总览:emoji 只看累计(兑换不掉),剩余积分折算零钱;明细与规则在「我的」tab */
  loadPoints(done) {
    this.setData({ ptState: 'loading' });
    pt.fetchPoints(entries => {
      const t = pt.totalsOf(entries);
      const emoji = pt.emojiFor(t.earned);
      this.setData({
        ptState: 'ok',
        ptEmoji: emoji,
        ptEmpty: !emoji,
        ptEarned: t.earned,
        ptRemaining: t.remaining,
        ptYuan: pt.yuanText(t.remaining),
      });
      if (done) done();
    }, () => {
      this.setData({ ptState: 'error' });
      if (done) done();
    });
  },

  retryPoints() {
    this.loadPoints();
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  goKebiao() {
    wx.navigateTo({ url: '/pages/kebiao/kebiao' });
  },

  goTodoDetail() {
    wx.navigateTo({ url: '/pages/todo/todo' });
  },

  goZuoye() {
    wx.navigateTo({ url: '/pages/zuoye/zuoye' });
  },
});
