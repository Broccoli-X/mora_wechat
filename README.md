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
├── assets/tabbar/          # tabBar 图标
├── utils/
│   ├── kebiao.js           # 课表静态数据 + 工具（与 mora 网页端 lib/kebiao-data.js 同步维护）
│   └── homework.js         # 作业只读同步（/api/progress, module=homework）+ 图片地址 + 日期工具
└── pages/
    ├── index/              # 首页 tab（今日信息：当前课程单条 + 今日作业）
    ├── category/           # 分类 tab（功能入口，未开发条目隐藏）
    ├── kebiao/             # 课程表（按天查看，当前节次高亮）
    └── zuoye/              # 作业本（按周查看，只读，含图片缩略图与大图预览，下拉刷新）
```

## 注意事项

- 作业数据来自 mora 项目的进度同步服务（`https://www.tcued.com/api/progress`），录入/删除在网页端维护，小程序端只做查看。
- 作业图片存于同一服务：payload 内是图片 id（短键 `g`），本体经 `GET /api/image?id=<id>` 读取（不带 token，与网页端一致）；作业本页点缩略图可全屏预览。
- 上线前需在小程序管理后台把 `https://www.tcued.com` 配置为 request 合法域名；开发阶段可在开发者工具里勾选「不校验合法域名」调试。
