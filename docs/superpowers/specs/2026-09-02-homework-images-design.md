# 作业图片查看功能设计

日期：2026-09-02
状态：已实现

## 需求

网页端作业录入（zuoye-edit.html）已支持携带图片，小程序端作业本需要能查看这些图片。

## 数据来源（mora 侧现状，只读对接）

- 作业 payload 短键 JSON 扩展为 `{d:日期, s:科目, t:内容, g:[图片id]}`；`g` 可省略（无图）。
- 图片引用是服务端 id（`/^img[0-9a-z]{4,30}$/`），单条最多 9 张；dataURL 是网页端离线兜底，不进 payload，小程序无需处理。
- 图片本体：`GET /api/image?id=<id>`，返回图片字节。**不带 token**（服务端有意为之，id 含随机段，家庭场景可接受），因此小程序 `<image>` 与 `wx.previewImage` 可直接使用。

## 方案选择

- **缩略图 + `wx.previewImage` 原生大图预览（采用）**：与网页端「缩略图 + lightbox」体验一致，预览由微信原生提供（全屏、双指缩放、左右滑动同条目图片），列表性能好。
- 内联铺大图：列表长、流量大，放弃。
- 只显示「含 N 图」文字：不满足"查看"，放弃。

## 设计

### utils/homework.js

- `decodeItems` 解析 `o.g`：数组 → 过滤合法 id（同网页端 `IMG_ID_RE`）→ 截到 9 张 → `entry.imgs`；`g` 缺失/非法 → `[]`。条目有效性仍只看日期/科目/文本。
- 新增导出 `imgUrl(ref)` → `API_BASE + '/api/image?id=' + ref`。

### 作业本页 pages/zuoye

- `render` 时把 `entry.imgs` 映射为完整 url 数组放进条目。
- 条目布局：色块 chip + 右侧列（文本 + 缩略图行）。缩略图 `<image mode="aspectFill" lazy-load>`，128rpx 方形圆角，flex 换行。
- 点击缩略图 `wx.previewImage({ current, urls })`：current 为所点图，urls 为该条目全部图，可在预览内左右滑动。

### 首页 pages/index

- 今日作业卡片保持紧凑单行，不铺缩略图；有条目的作业在文本后追加 `📎N` 徽标。
- 作业条目整行可点，跳作业本页查看图片（复用 `goZuoye`）。

## 边界

- 图片加载失败：微信默认破图样式，不做特殊处理（服务端同源可用性由 mora 保证）。
- 域名：`<image>` 与 `wx.previewImage` 不受 request 合法域名限制；`/api/progress` 的域名要求与现状一致。

## 验证

- 全部改动 JS `node --check` 语法通过。
- node 断言测试：payload 带/不带 `g`、坏 id 过滤、超 9 张截断、imgUrl 拼接。
