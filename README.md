# mora_wechat

Mora 学习卡片微信小程序。

- **AppID**: `wxf251bca64dd09232`
- **远程仓库**: `git@github.com:Broccoli-X/mora_wechat.git`

## 开发

1. 克隆本仓库
2. 使用 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 导入项目根目录（AppID 会自动从 `project.config.json` 读取）
3. 编译即可在模拟器预览

## 目录结构

```
.
├── project.config.json     # 项目配置（AppID、编译选项等）
├── app.json                # 小程序全局配置（页面注册、tabBar、窗口样式）
├── app.js                  # 小程序入口
├── app.wxss                # 全局样式
├── sitemap.json            # 页面收录配置
├── assets/
│   └── tabbar/             # tabBar 图标
├── utils/
│   ├── auth.js             # 家长登录会话（/api/login 换 token、401 登录门，与 mora 网页端 lib/auth.js 同协议）
│   ├── kebiao.js           # 课表静态数据 + 工具（与 mora 网页端 lib/kebiao-data.js 同步维护）
│   ├── homework.js         # 作业同步（/api/progress, module=homework，可勾选完成）+ 图片地址 + 日期工具
│   └── pinyin.js           # 拼音卡片数据 + 工具（与 mora 网页端 lib/pinyin-data.js 同步维护）
└── pages/
    ├── index/              # 首页 tab（今日信息：当前课程单条 + 今日作业）
    ├── category/           # 分类 tab（功能入口，未开发条目隐藏）
    ├── kebiao/             # 课程表（按天查看，当前节次高亮）
    ├── zuoye/              # 作业本（按周查看，可勾选完成，含图片缩略图与大图预览，下拉刷新）
    ├── pinyin/             # 拼音学习卡（pinyin 基础入口大卡 + study 卡片与掌握标记；进阶占位未开发）
    └── login/              # 家长登录页（未登录/会话失效时整页接管，登录后回到来源页）
```

## 注意事项

- 全部 `/api/` 数据接口已启用家长密码鉴权（与 mora 网页端同协议）：首次使用在登录页输入家长密码（可填家庭ID）换长期会话 token（服务端滑动 180 天过期），本设备登录一次长期有效；会话失效收到 401 会自动清 token 弹回登录页。换家庭登录会清掉上一家的本地缓存防串数据，「我的」页可查看当前家庭并退出登录。
- 作业数据来自 mora 项目的进度同步服务（`https://www.tcued.com/api/progress`），录入/删除在网页端维护，小程序端可查看与勾选完成：条目 `done` 标记随 payload 短键 `c` 同步（与网页端 `lib/homework-core.js` 同协议，未完成不产生 `c` 键兼容旧数据），切换完成走单条上报、payload 始终带全图片引用（服务端会清理不再被引用的图片）。
- 作业图片存于同一服务：payload 内是图片 id（短键 `g`），本体经 `GET /api/image?id=<id>` 读取（不带 token，与网页端一致）；作业本页点缩略图可全屏预览。
- 拼音学习卡数据与 mora 网页端 `lib/pinyin-data.js` 同源；卡片为纯视觉学习卡（不带发音）。
- 拼音掌握进度多端共享：与 mora 网页端（`pinyin-flashcards.html`/`report.html`）走同一服务（`/api/progress`，module=`pinyin`），协议同 `lib/progress-sync.js`——本地存储为第一写入点，进页面拉取合并、点标记异步上报，同键位 `updatedAt` 新者胜；离线时纯本地，联网后自动补传。键位/存储键与网页端一致。
- 上线前需在小程序管理后台把 `https://www.tcued.com` 配置为 request 合法域名；开发阶段可在开发者工具里勾选「不校验合法域名」调试。
