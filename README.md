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
└── pages/
    └── index/              # 首页
```
