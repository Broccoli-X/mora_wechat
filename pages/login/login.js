const auth = require('../../utils/auth');
const HOME = '/pages/index/index';

Page({
  data: {
    family: '',
    password: '',
    error: '',
    busy: false,
  },

  onLoad(options) {
    auth.gateShown();
    try {
      this.from = decodeURIComponent(options.from || '');
    } catch (e) { this.from = ''; }
    this.setData({ family: auth.getFamily() });
  },

  onFamily(e) { this.setData({ family: e.detail.value, error: '' }); },
  onPw(e) { this.setData({ password: e.detail.value, error: '' }); },

  cancelPending() {
    if (this.cancelRequest) {
      this.cancelRequest();
      this.cancelRequest = null;
    }
  },

  onUnload() { this.cancelPending(); },

  cancel() {
    if (this.leaving) return;
    this.leaving = true;
    this.cancelPending();
    this.setData({ busy: false, password: '', error: '' });
    const home = () => wx.reLaunch({
      url: HOME,
      fail: () => {
        this.leaving = false;
        this.setData({ error: '返回失败，请重试' });
      },
    });
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1, fail: home });
    else home();
  },

  submit() {
    if (this.leaving || this.data.busy) return;
    const pw = this.data.password;
    if (!pw) { this.setData({ error: '请输入家长密码' }); return; }
    this.setData({ busy: true, error: '' });
    this.cancelRequest = auth.login(pw, this.data.family.trim(), () => {
      this.cancelRequest = null;
      const pages = getCurrentPages();
      const previous = pages[pages.length - 2];
      const target = this.from || HOME;
      const path = target.split('?')[0];
      const home = () => wx.reLaunch({ url: HOME });
      if (previous && '/' + previous.route === path) {
        wx.navigateBack({ delta: 1, fail: home });
      } else if (previous) {
        // 从分类选功能时，用功能页替换登录页，保留分类的返回路径。
        wx.redirectTo({ url: target, fail: home });
      } else {
        wx.reLaunch({ url: target, fail: home });
      }
    }, msg => {
      this.cancelRequest = null;
      this.setData({ busy: false, error: msg || '登录失败,请重试', password: '' });
    });
  },
});
