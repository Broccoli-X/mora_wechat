# 代办单次提醒日期范围(小程序端)

日期：2026-10-12
状态：已实现

## 需求

- 与网页端(mora,设计稿 docs/superpowers/specs/2026-10-12-todo-date-range-design.md,同日实现)同款:
  单次代办支持一段日子,如「夏令营」10月1日到10月7日,范围内每天都会出现在
  首页今日待办与代办详情里;不填结束日期就还是原来的一天。

## 协议(照抄网页端口径)

- `repeat:"once"` 新增可选 `dateEnd`(YYYY-MM-DD),不加新重复类型。
- payload 短键:`e` = 结束日期,`{t,m,r,d,e,…}`;无结束日期不带 `e` 键,
  老 payload 字节不变;最坏约 +30 字符,服务端 `MAX_PAYLOAD = 500` 内零改动。
- `normalize`:dateEnd 仅当合法日期且**严格大于** date 才保留(等于/早于/非法/
  非 once 一律静默退回单日 ""),与网页端同口径的静默清洗;
  UI 层另做显式拦截提示,不让用户猜。
- `occursOn`:dateEnd 非空按字符串区间比较(YYYY-MM-DD 字典序即时间序),
  含首尾两天;dateStr 先过 parseDate,坏日期串不算。
- `describe`:单日 `单次·9月5日` 不变;范围 `单次·10月1日~10月7日`。

## 实现

- utils/todo.js:normalize/decodeItems(`o.e`)/encodeEntry(`o.e` 仅在范围时携带)/
  occursOn/describe 五处,与网页端 lib/todo-core.js 逐条对齐。
- pages/todo-edit:日期行下加「到(选填,选了就是一段日子)」日期选择器
  (picker 值缺省落到开始日期,未选显示「不限」);提交时结束日期非法
  「结束日期没选好,检查一下哦」/早于开始日期「结束日期不能早于开始日期哦」
  显式 toast 拦截(库内静默清洗只作同步兜底),等于开始日期不拦、静默退单日;
  编辑回填 dateEnd,重置清空(选填语义,非回到今天);
  单次说明文案改为「只在选中的日子,填上『到』就是一段日子(如夏令营)」。
- pages/todo / pages/index:零改动,todosOn/ describe 自动获得范围口径。

## 测试

- tests/todo.test.js:dateEnd 保留/等于退单日/早于退单日/非法退单日/非 once 无 dateEnd、
  e 短键往返与无范围不带键、occursOn 含首尾与界外与坏日期串、describe 两种文案。
- tests/todo-pages.test.js:静态契约(「到」选择器与提示文案在位)、
  早于开始日期拦截不放行、范围落库带 e 键、等于退单日不带 e、
  编辑回填与重置清空、详情页范围条目首尾含当天可见/翻出消失/文案带 ~。
