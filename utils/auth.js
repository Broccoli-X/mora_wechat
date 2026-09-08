/* 家长登录门:与 mora 网页端 lib/auth.js 同协议——家长密码 POST /api/login 换长期
   会话 token(服务端滑动 180 天过期),token/家庭ID 存本地 storage(键名与网页端
   一致),本设备登录一次长期有效。多家庭同站:登录可填「家庭ID」区分各家,
   换家庭登录时清掉上一家的本地缓存(进度/作业/考试记录等 mora-* 键),防串数据。
   页面数据加载前调 ensure() 把门:未登录 → 整页跳登录页(pages/login);任何同步
   收到 401(会话过期/被注销)→ 清 token 跳回登录页,登录成功回到来源页。
   密码只出现在登录请求里,不再内置静态凭证(旧静态 TOKEN 已废弃)。 */
const API_BASE = 'https://www.tcued.com';
const TOKEN_KEY = 'mora-auth-token';
const FAMILY_KEY = 'mora-auth-family';
const DEVICE_KEY = 'mora-device';

function getToken() {
  try { return wx.getStorageSync(TOKEN_KEY) || ''; }
  catch (e) { return ''; }
}

function getFamily() {
  try { return wx.getStorageSync(FAMILY_KEY) || ''; }
  catch (e) { return ''; }
}

function clearAll() {
  try {
    wx.removeStorageSync(TOKEN_KEY);
    wx.removeStorageSync(FAMILY_KEY);
  } catch (e) { /* 存储不可用忽略 */ }
}

/* 与 pinyin/hanzi 的上报设备名同源(共用 mora-device 键),仅作服务端日志展示 */
function deviceTag() {
  let d = '';
  try { d = wx.getStorageSync(DEVICE_KEY); } catch (e) { /* 取不到现生成 */ }
  if (d) return d;
  let prefix = 'wx';
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    prefix = (info && info.platform) || 'wx';
  } catch (e) { /* 取不到平台信息用默认前缀 */ }
  d = prefix + '-' + Math.random().toString(16).slice(2, 6);
  try { wx.setStorageSync(DEVICE_KEY, d); } catch (e) { /* 同上 */ }
  return d;
}

/* 换家庭登录时清掉本设备上一家的本地缓存(进度/作业/积分等 mora-* 键),
   服务端数据不受影响;登录态与设备名保留 */
function purgeLocalFamilyData() {
  try {
    const keep = {};
    keep[TOKEN_KEY] = 1;
    keep[FAMILY_KEY] = 1;
    keep[DEVICE_KEY] = 1;
    const info = wx.getStorageInfoSync();
    (info && info.keys || []).forEach(k => {
      if (k && k.indexOf('mora-') === 0 && !keep[k]) wx.removeStorageSync(k);
    });
  } catch (e) { /* 存储不可用跳过 */ }
}

/* 登录:成功则 token/家庭ID 入库;失败 fail(中文错误,可直接展示)。
   family 留空 = 本站原住家庭;家庭变化时清本地上一家缓存(共用设备防串) */
function login(password, family, done, fail) {
  const prevFamily = getFamily();
  wx.request({
    url: API_BASE + '/api/login',
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    data: { password: password, family: family || '', device: deviceTag() },
    success(res) {
      const j = res.data;
      if (res.statusCode === 401) { if (fail) fail('家庭ID或密码不对,请再试一次'); return; }
      if (res.statusCode === 429) { if (fail) fail('尝试次数太多,请过几分钟再试'); return; }
      if (res.statusCode !== 200 || !(j && j.ok && j.token)) { if (fail) fail('登录失败,请重试'); return; }
      const newFamily = j.family || family || '';
      /* 清本地判定与网页端一致:明确的旧家庭 → 新家庭必清;无家庭记录(老设备)
         只在登录的是别家时清——自家(owner)首次登录要保住既有本地数据 */
      if (prevFamily ? prevFamily !== newFamily : !j.owner) purgeLocalFamilyData();
      try {
        wx.setStorageSync(TOKEN_KEY, j.token);
        wx.setStorageSync(FAMILY_KEY, newFamily);
      } catch (e) { /* 存储不可用:本次能用,重开需重登 */ }
      if (done) done(j.token);
    },
    fail() { if (fail) fail('连不上服务器,请检查网络'); },
  });
}

/* 注销:通知服务端删会话(尽力而为)+ 清本地 */
function logout() {
  const tok = getToken();
  clearAll();
  if (tok) {
    wx.request({
      url: API_BASE + '/api/logout',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { token: tok },
      fail() { /* 尽力而为 */ },
    });
  }
}

/* ── 登录门跳转:未登录/会话失效 → reLaunch 登录页,登录成功回到来源页 ── */
let gating = false;

/* 当前页完整路由(带 query,登录成功后原样回来);取不到兜底首页 */
function currentRoute() {
  try {
    const pages = getCurrentPages();
    const top = pages && pages.length ? pages[pages.length - 1] : null;
    if (!top || !top.route) return '/pages/index/index';
    const opts = top.options || {};
    const qs = Object.keys(opts)
      .map(k => k + '=' + encodeURIComponent(opts[k])).join('&');
    return '/' + top.route + (qs ? '?' + qs : '');
  } catch (e) {
    return '/pages/index/index';
  }
}

function gate() {
  try {
    const pages = getCurrentPages();
    const top = pages && pages.length ? pages[pages.length - 1] : null;
    if (top && top.route === 'pages/login/login') return; // 已在登录页,不重复跳
  } catch (e) { /* 取不到页面栈照常跳 */ }
  if (gating) return;
  gating = true;
  wx.reLaunch({ url: '/pages/login/login?from=' + encodeURIComponent(currentRoute()) });
}

/* 登录页 onLoad 回调:门已展示,放行下一次 gate(处理再次过期/注销) */
function gateShown() { gating = false; }

/* 页面数据加载前调用:已登录返回 true;未登录弹门并返回 false(页面跳过取数) */
function ensure() {
  if (getToken()) return true;
  gate();
  return false;
}

/* 同步层 401 钩子:会话失效 → 清 token 弹回登录门 */
function on401() {
  clearAll();
  gate();
}

module.exports = {
  getToken, getFamily, deviceTag,
  login, logout, ensure, gate, gateShown, on401,
};
