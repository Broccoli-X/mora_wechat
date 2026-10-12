# 待办事项配图(小程序端,对齐网页端已落盘协议)

日期：2026-10-12
状态：已实现

## 需求

- 网页端代办附件图片已落盘(mora 3fda12d,设计稿 docs/superpowers/specs/2026-10-12-todo-image-attachments-design.md),
  小程序端同步支持:
  - 维护页(pages/todo-edit)添加/编辑代办时可配图(选图/压缩/上传/删图)。
  - 详情页(pages/todo)展示某天代办时,条目下方显示缩略图,点按进微信原生大图预览(同条目图片可左右滑动)。
  - 首页「今日代办」行与维护页列表行显示 📎 数量角标,提示有条目带图。

## 协议(以网页端落盘实现为准)

- 条目形状加 `imgs: []`,payload 短键 `g` = 纯服务端图片 id 数组
  (`/^img[0-9a-z]{4,30}$/`,与 homework 的 `g` 同规则);**上限 `IMGS_MAX = 3`**。
- dataURL 不进 payload(网页端的「本机 dataURL 离线兜底」只在网页端本地存在;
  小程序端无本地存储,上传失败整条不落、由家长重试,协议上等价安全)。
- 图片本体:`POST /api/image` 上传(dataURL ≤ 80 万字符,客户端留余量),
  `GET /api/image?id=<id>` 直连展示/预览(不带 token)。
- **无图条目不带 `g` 键**,与老版本 payload 字节级一致(老客户端照常解码)。
- 服务端图片级联清理已随网页端扩展到 todo(`homework`+`todo`):编辑移除单张图、
  墓碑删整条后,不再被引用的图片自动删库。**上报必须带全 g**,少带会把还想要的图清掉
  (小程序端保存按「保留旧引用 + 新上传 id」全量覆盖,与网页端同口径)。
- 最坏 payload(t60 + weekly + 3 图)远在服务端 `MAX_PAYLOAD = 500` 内,服务端零改动。

## 实现

- utils/todo.js:`IMG_ID_RE`/`IMGS_MAX`(=3)/`imgsOf`(清洗)/`imgUrl`(直连地址),
  normalize 增 `imgs`,decodeItems 解 `o.g`,encodeEntry 有图才带 `g`,
  `uploadImage`(POST /api/image 换 id)。
- pages/todo-edit:配图编辑区与作业维护页(hw-edit)同款交互——
  `wx.chooseMedia` 压缩档选图、`wx.compressImage` 60/30 两档压到 76 万字符内
  (压不下去整条不落并提示换图)、新图先上传换 id 再上报条目,任何一张失败整条不落;
  编辑态旧图 {id,url} 可删,保存按剩余引用全量覆盖 `g`。提交按钮「处理图片中…」防重入。
- pages/todo:rows 增 `imgs`(直连地址数组),缩略图 aspectFill + 懒加载,
  点按 `wx.previewImage`(从点的那张看起)。
- pages/index:今日代办行增 📎 数量角标(看大图在代办详情页)。

## 测试

- tests/todo.test.js:配图编解码(g 键/坏 id/封顶 3)、imgUrl、最满条目 payload < 500、
  uploadImage 形状与 401/失败分支。
- tests/todo-pages.test.js:静态契约(接线在位)、选图房间/上限、带图提交顺序
  (image 先、条目后、g=id)、无图字节级兼容、编辑旧图删存、压不下去整条不落、
  详情页缩略图与预览。
