# 成语卡片(小程序端)设计

日期:2026-10-28
状态:已实现

总设计见 mora 仓库 `docs/superpowers/specs/2026-10-28-chengyu-module-design.md`
(服务端接口、词典、网页端录入都在那边;本文件只管小程序侧)。

## 目标

分类 tab「语文」组新增「成语卡片」:列表(可搜索、按拼音排序、逐字注音)+
详情(意思/典故)。内容来自 mora 网页端 `chengyu-edit.html` 录入,
家长登录后小程序只读展示,照古诗/知识点的「网页端维护、小程序读取」模式。
配色以低饱和绿色为主(浅豆绿底 + 白卡 + 深绿字),不刺眼、保护小朋友视力。

## 接口与数据(utils/chengyu.js)

- `GET /api/chengyu` → `{ok, data:[{w,p,m,d}]|null, updatedAt}`,登录即可读
  (整库一个接口,不需要知识点那种两步拉取)。
- 本机缓存 `mora-chengyu-v1` 为第一读取点(离线可看已拉过的内容),拉取成功
  再以服务端为真源覆盖,updatedAt 变了才通知订阅者。
- 截断保护照 knowledge.js 的 clean 口径(只按上限截断,不复刻服务端校验,
  规则以后再变也不悄悄吃内容);`data:null` 视为空库。
- 导出 `load(cb)` / `subscribe(fn)` / `current()`;另有 `tokensOf(entry)`
  (逐字注音,拼音与汉字一一对应)、`sortByPinyin(list)`(去声调按字母序,
  没拼音的排最后,不改原数组)。

## 页面(pages/chengyu/)

- **chengyu 列表页**:顶部搜索框(按成语/拼音/意思/典故子串过滤,不分大小写);
  卡片只呈现**成语 + 逐字拼音(拼音在每个字上方)**,按拼音排序;不显示意思
  (信息密度低、护眼);点卡片进详情;空库给引导文案(「请家长在网页端录入」);
  下拉刷新。绿色系配色。
- **detail 详情页**:大字成语逐字注音(拼音在字上方)、意思卡、典故卡
  (d 为空不显示典故卡);从列表传 w 定位,取当前缓存数据渲染。绿色系同款。

## 入口与权限

- `pages/category/category.js` 语文组 items 追加:
  `{ name: '成语卡片', desc: '看成语 · 懂意思 · 知典故', status: 'ok',
     url: '/pages/chengyu/chengyu', perm: 'chengyu' }`。
- `app.json` 注册两个页面。
- 服务端 `FEATURES` 新增 `chengyu` 键(mora 仓库同步加),入口按
  `auth.hasPerm('chengyu')` 过滤,与古诗同款;服务端读接口只验 token。

## 测试

- `tests/chengyu.test.js`:utils 缓存读写、截断保护、null 库、订阅通知、
  逐字注音对齐、拼音排序。
- `tests/chengyu-pages.test.js`:列表渲染与拼音排序、列表不展示意思、
  逐字注音结构、详情意思/典故条件渲染、空库文案、绿色配色、category 入口与
  perm 过滤、app.json 页面注册。
