# 小程序「我的」tab 与积分功能设计

日期：2026-09-03
状态：已实现

## 需求

1. 新增「我的」tab。
2. 「我的」tab 内提供积分总览与积分明细；点击积分卡片展开/收起「积分明细」与「积分规则」。
3. 首页显示积分信息（不显示积分规则）。
4. 积分功能参考网页版（/Volumes/Data/UserData/projects/mora 的 `lib/points-core.js`、`index.html`、`points-edit.html`）。

## 关键决策

- **小程序端积分只读**：发放/兑换仍在网页端家长页 `points-edit.html` 维护（带家长算术门），小程序只做查看。与作业模块先例一致（`utils/homework.js`「录入/删除在网页端维护，小程序端只做查看」）。用户需求只提到展示、明细、规则展开，未要求发放/兑换表单。
- **数据多端共享**：读同一进度同步服务 `GET /api/progress?token=…`，客户端按 `module='points'` 过滤（服务端不按模块过滤，与作业一致）。payload 为短键 JSON `{d:日期, r:理由, s:分数, j:科目, n:备注}`，空 payload 是删除墓碑（跳过）。
- **统计口径与网页端一致**：累计 = 发放合计（兑换不掉，emoji 只看它）；剩余 = 累计 − 已兑换；可换零钱 = 剩余/10（10 积分 = 1 元）；emoji 星级 ⭐1/🌙10/☀️100/💎1000/👑10000 进位。

## 单元

### 1. `utils/points.js`（新）
- 常量与网页端同源：`LEVELS`、`REASONS`、`CONSUMES`、`RULES`、`POINTS_PER_YUAN`、`SUBJECTS`。
- 纯函数：`normalize`（校验清洗一条记录：理由必须在规则表、消耗恒为负、自定义限幅）、`decodeItems`（服务端 items → 积分记录数组，只认 module='points'，跳过墓碑/坏 payload，最新在前）、`totalsOf`、`emojiFor`、`yuanText`、`describe`（"理由·科目/备注"）、`fmtScore`（+3 / −2）。
- 拉取：`fetchPoints(done, fail)`，`API_BASE`/`TOKEN` 与 `utils/homework.js` 同源。
- 不移植：`mathChallenge` 家长算术门、`loadLocal/saveLocal`（localStorage）、推送/合并写路径——小程序端只读。

### 2. `assets/tabbar/mine.png` / `mine-active.png`（新）
- 81×81 RGBA，人形剪影（圆头 + 肩身），普通 #9aa1b0、选中 #4f7cff，PIL 生成，与现有图标规格一致。

### 3. `pages/mine/mine.*`（新，「我的」tab 页）
- 品牌头部（复用首页 head 风格）。
- 积分卡片：emoji 行 + 「累计/剩余/可换元」三个 chips；整体点按展开/收起明细与规则。
- 展开区：
  - 积分明细：`日期 · 描述 · ±分`（得分绿 / 扣分红），最新在前，默认 10 条，「展开更早的 N 条 / 收起」。
  - 积分规则：`RULES` 六条。
- 状态与交互沿用首页作业模块：loading / 空态 / 失败 + 重试、下拉刷新。
- 底部提示「发放与兑换请在网页端家长页操作」。

### 4. `app.json`
- `pages` 注册 `pages/mine/mine`；`tabBar.list` 追加第三项「我的」。

### 5. `pages/index/index.*`
- 头部下、课程区块上新增「积分」区块：emoji（空态文案）+ 累计/剩余/可换元 chips，**不含规则**；点击区块 `wx.switchTab` 到「我的」。
- `onShow` 拉取（与作业互不影响），下拉刷新一并刷新。

## 数据流

`onShow → fetchPoints → decodeItems（module='points'）→ totalsOf/emojiFor/yuanText → 渲染总览`；明细直接用 `decodeItems` 输出（已按最新在前排序）。

## 错误处理

- 网络失败：区块显示「积分同步失败 + 重试」，总览隐藏避免展示误导性 0 分。
- 无记录：空态文案「还没有积分记录，完成作业就能挣星星哦 ✨」。
- 坏 payload / 墓碑：跳过。

## 验证

- node 自测 `utils/points.js` 纯函数（decode/统计/换算/描述，参考网页端 tests/points-core.test.js 的口径）。
- UI 目检需微信开发者工具（用户完成）。
