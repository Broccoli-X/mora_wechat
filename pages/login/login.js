/* 家长登录页:utils/auth.js 登录门的 UI 端。
   未登录/会话失效时被 reLaunch 到这里(带 from 来源路由),登录成功后
   reLaunch 回来源页重新加载(onLoad 重跑,各页初始化照常走同步)。
   文案与交互对齐 mora 网页端 lib/auth.js 的登录遮罩。 */
const auth = require('../../utils/auth');

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
      this.from = options && options.from ? decodeURIComponent(options.from) : '';
    } catch (e) { this.from = ''; }
    this.setData({ family: auth.getFamily() });
  },

  onFamily(e) { this.setData({ family: e.detail.value, error: '' }); },
  onPw(e) { this.setData({ password: e.detail.value, error: '' }); },

  submit() {
    if (this.data.busy) return;
    const pw = this.data.password;
    if (!pw) { this.setData({ error: '请输入家长密码' }); return; }
    this.setData({ busy: true, error: '' });
    auth.login(pw, this.data.family.trim(), () => {
      wx.reLaunch({ url: this.from || '/pages/index/index' });
    }, msg => {
      this.setData({ busy: false, error: msg || '登录失败,请重试', password: '' });
    });
  },
});
