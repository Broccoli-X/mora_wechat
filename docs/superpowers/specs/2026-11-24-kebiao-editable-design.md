# 课表在线读取(小程序端)设计

日期:2026-11-24
状态:已实现

总设计见 mora 仓库 `docs/superpowers/specs/2026-11-24-kebiao-editable-design.md`
(服务端接口、网页端维护页都在那边;本文件只管小程序侧)。

## 目标

小程序的课表现在是 `utils/kebiao.js` 里写死的静态副本,与网页端各改各的。
网页端改成在线维护(每个家庭一张课表)后,小程序改为**只读**在线课表:
缓存优先、后台拉服务端、内置默认课表兜底。小程序里不做任何维护入口。

## 接口与数据(utils/kebiao.js)

- `GET /api/kebiao?token=…` → `{ok, data:课表文档|null, updatedAt}`,登录即可读,
  按家庭隔离(与 mora `server/README.md`「九」同协议)。课表文档形状:
  `{school, cls, term, days[], periods[{label, half, time}], routine[[名称, 时间]],
  grid[[[科目, 老师, 备注]]], meta:{科目:{icon, main}}}`,网格行数 = 节次数、
  列数 = 天数;科目为空的格子是空堂。
- 现有的静态 `KEBIAO` / `KEBIAO_META` 原样保留,冻结成**内置默认课表**:服务端
  没保存过(`data:null`)时看到的就是它,与网页端一致。
- 本机缓存 `mora-kebiao-doc`(`{updatedAt, data}`)为第一读取点,离线可看已拉过的
  课表;`mora-` 前缀,换家庭登录时照旧被清掉。脏缓存当没有。
- 只做渲染保护(`normalizeDoc`),不复刻服务端校验(照 chengyu.js / knowledge.js
  口径):文本按字符截断、`days` / `periods` 截到上限、`grid` 整形成
  「节次 × 星期」的长方形(缺的格子补空格子)、空堂格子清老师 / 备注、`meta`
  整形为 `{icon, main}`。不是对象、或清洗后没有星期 / 节次的文档视为坏数据,不采用。
- 导出 `current()`(当前课表文档)与 `refresh(done)`:`done(changed, err)`,`err`
  为 `'auth'` / `'bad'` / `'net'`(失败时)。`updatedAt` 更新才替换缓存并返回
  `changed = true`;`data:null`、坏数据、网络失败都不动当前课表;401 / 403 照旧
  `auth.on401()`。
- 工具函数签名不变,改为读**当前课表文档**而不再是静态 `KEBIAO`:
  `metaOf(subject)`(没有配色的科目回落 📌 + 灰色 `#5f6b7d`)、`todayIdxOf(d)`、
  `toMin(s)`、`periodAtNow(d)`、`currentOrNextLesson(d)`、`homeLesson(now)`。
  非法或缺失的 `time` 只是匹配不到(不高亮),不抛错。

## 页面

- **pages/kebiao 课表页**:`onLoad` 改 `onShow`——登录门 + `kebiao` 权限就绪后,
  用 `kb.current()` 渲染星期页签(`星期X` → `周X`)、学校 / 班级 / 学期与当天课程;
  随后 `kb.refresh()`,有更新就重绘。已选中的星期在重绘后保持(越界才回到今天)。
  新增下拉刷新(`kebiao.json` 开 `enablePullDownRefresh`,与成语页同款)。
  列表项的 `wx:key` 由 `label`(可能重复)改为序号。空堂一行显示灰底「空」,
  不显示老师 / 备注。学校 / 班级 / 学期为空的段不显示。
- **pages/index 首页「今日课程」卡**:`renderCourse()` 照旧调 `kb.homeLesson()`,
  但 `applyPerms` 里在开通课程表时多排一个 `kb.refresh()` 任务,拉到更新就重画;
  下拉刷新等它完成再收起。
- **homeLesson 跳过空堂**:今天当前节有课 →「现在」;当前节是空堂,或在课前 /
  课间 → 今天接下来第一个有课的节 →「下一节」;今天剩下的节都没课 → 次日第一个
  有课的节(标题「次日课程」);次日是周末或没有课 → 整块隐藏。周末仍整块隐藏。
- **pages/category 入口与权限**:不变(`perm: 'kebiao'`)。不新增任何页面。

## 测试

- `tests/kebiao.test.js`(扩展;现有 7 个默认数据用例不动):默认兜底、缓存优先、
  脏缓存当没有、`normalizeDoc` 渲染保护、`updatedAt` 更新才替换并写缓存、
  `data:null` / 坏数据 / 网络失败不动当前课表、无 token 不发请求、401 弹登录门、
  工具函数读当前课表(`periodAtNow` / `homeLesson` 跳过空堂、次日、周末隐藏)。
- `tests/kebiao-pages.test.js`(新):课表页 `onShow` 权限门 / 缓存先渲染 / 远端
  刷新重绘 / 页签与标题来自在线课表 / 空堂行 / 下拉刷新;首页课程卡随刷新更新、
  未开通不发课表请求;`kebiao.json` 开了下拉刷新;category 入口仍挂 `kebiao`。
- README:`utils/kebiao.js` 一行与注意事项同步(课表改为读网页端维护的在线课表)。

## 上线

改完需在微信开发者工具上传、提交审核并发布。顺序:先服务端,再网页静态页,
最后小程序;小程序先上也不会出错——接口 404 时继续显示默认课表。

## 不做(本期)

小程序端维护入口、课表编辑页、多张课表。
