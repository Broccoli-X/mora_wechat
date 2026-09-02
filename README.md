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
├── app.json                # 小程序全局配置（页面注册、窗口样式）
├── app.js                  # 小程序入口
├── app.wxss                # 全局样式
├── sitemap.json            # 页面收录配置
├── utils/
│   ├── kebiao.js           # 课表静态数据 + 工具（与 mora 网页端 lib/kebiao-data.js 同步维护）
│   └── homework.js         # 作业只读同步（/api/progress, module=homework）+ 日期工具
└── pages/
    ├── index/              # 首页（课程表、作业本两张入口卡片）
    ├── kebiao/             # 课程表（按天查看，当前节次高亮）
    └── zuoye/              # 作业本（按周查看，只读，下拉刷新）
```

## 注意事项

- 作业数据来自 mora 项目的进度同步服务（`https://www.tcued.com/api/progress`），录入/删除在网页端维护，小程序端只做查看。
- 上线前需在小程序管理后台把 `https://www.tcued.com` 配置为 request 合法域名；开发阶段可在开发者工具里勾选「不校验合法域名」调试。
