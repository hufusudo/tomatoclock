# TomatoClock Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this plan) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有番茄钟交付为可从电脑图标打开的 Linux 自用应用，使用 SQLite 保存每日番茄数和各已完成工作段时长，为后续折线图保留数据。

**Architecture:** Electron 单窗口加载现有原生页面。页面继续使用纯计时状态机，主进程负责 SQLite、系统通知、窗口状态和退出协调；固定 preload 接口连接两者。网页和桌面使用不同持久化适配器，共用计时、界面与动画。

**Tech Stack:** Electron 44.6.0、better-sqlite3 13.0.3；开发工具 @electron/rebuild 4.2.1、playwright-core 1.63.0；原生 HTML/CSS/JS、Node test runner。版本于 2026-10-07 从 npm 注册表核验，使用精确版本与 package-lock.json。

**Spec:** `docs/superpowers/specs/2026-10-07-desktop-app-design.md`（用户已审阅回复“继续”）。

## Global Constraints

- CachyOS / KDE Plasma / Wayland，本机 x86_64；关闭窗口退出，无托盘、开机启动、自动更新、账号或云端。
- workMin 整数 1–180；短休 ÷5、长休 ×0.6，各 ±5 分钟，下限 1 分钟；设置仅 READY 修改；每 4 个番茄长休。
- 只统计已完成工作段；25 分钟 + 50 分钟 = 2 个番茄、4500 秒；休息/暂停/半截番茄不入账。
- deadline 判定、完成 deadline 的本地日期入账、唤醒至多转一格、休息结束手动开工，均保留。
- SQLite `${XDG_DATA_HOME:-~/.local/share}/tomatoclock/learning.sqlite` 与程序分离；测试使用临时目录，不触碰真实学习记录。
- UUID 幂等入账；仅数据库确认的数据进入统计；失败时保留事件供重试，阻止开始新工作段。
- 保留原 31 条测试和动画五依赖/play/dismiss/pending 契约；保留能静态打开的网页入口。
- Electron contextIsolation=true、sandbox=true、nodeIntegration=false；不加载远程页面，不暴露 Node/任意 SQL。
- 最小化继续计时；backgroundThrottling=false；演出以主进程窗口显示、未最小化且聚焦的状态为准。
- UI 新增每日记录分页，每页 30 个有记录的日期；零记录日查询返回 0；折线图本版不做。
- 旧网页数据通过用户选择的 JSON 文件预览确认后导入，原数据保留，重复导入按同来源同日期替换。
- 不修改 btrfs、内核、引导、/etc、关键服务、KDE 或 shell 配置，不运行系统更新；缺少系统包时按 AGENTS 强烈警告并取得明确确认。
- 不通过关闭 Electron 沙箱、修改内核配置或重定位 HOME 解决运行问题。项目依赖在项目内，下载缓存优先指定 /tmp 的任务目录；必要的工具默认缓存写入须遵守沙箱权限。
- 所有原有通知/按钮/阶段文案沿用；新固定文案：保存失败“学习记录保存失败，请重试。”，空记录“还没有完成的番茄”。

## Review Focus

1. 修改工作时长、暂停/恢复、跨日后仍按每个工作段快照统计 → Task 2/4 的 25+50 分钟及暂停测试。
2. 重复事件、重试并发、退出时正在保存，不重记或静默丢弃 → Task 2/3/4 的 UUID、单次 flush 和关闭协调测试。
3. 午夜附近的迟到查询结果不能覆盖新一天页脚 → Task 4 的延迟 Promise 与换日测试。
4. 损坏/高版本数据库、非法日期或超大数字导入，原文件与有效数据保留 → Task 2/5 的真实临时数据库与原子导入测试。
5. 系统 Node 通过不等于成品 SQLite 能加载；无图形环境不等于桌面验收通过 → Task 1/6 的 Electron 原生 ABI、打包后检查及真实 GUI 验收。

## File Structure

| 文件 | 职责 |
|---|---|
| package.json / package-lock.json / .gitignore | 精确依赖、命令、排除构建缓存和产物 |
| desktop/main.cjs | 正式入口，定位数据目录并启动应用 |
| desktop/application.cjs / desktop/ipc.cjs | 窗口、单实例、原生通知、关闭协调；固定桥接与来源验证 |
| desktop/preload.cjs | contextBridge 的窄接口与事件订阅 |
| desktop/database.cjs / desktop/legacy-import.cjs | SQLite 数据服务、结构版本；旧 JSON 解析与预览 |
| js/controller.js | 纯事件协调、异步保存队列、设置提交、快照发布 |
| js/runtime-adapters.js / js/format.js | 网页/桌面异步数据接口适配；共享时间/文案格式化 |
| js/app.js | DOM 组装与渲染，使用 controller；不自行操作数据库 |
| js/records-view.js / index.html / style.css | 今日/累计、分页记录、重试、导入/导出 UI |
| assets/tomatoclock.svg / assets/tomatoclock.png | 原创本地图标；窗口使用 PNG，菜单可使用 SVG |
| scripts/package-linux.cjs / scripts/install-user.cjs | Linux 便携目录与用户级应用菜单入口 |
| tests/desktop-*.test.cjs | 在 Electron Node 模式中测试真实 SQLite 与桌面业务 |
| tests/controller.test.js / tests/runtime-adapters.test.js | 纯逻辑与适配器回归，系统 Node 运行 |
| tests/fixtures/electron-test-main.cjs / tests/desktop-ui.cjs | 同一 application 工厂的临时数据 GUI 验收，不新增生产调试接口 |

## Shared Interfaces

- `Settings = {workMin, shortAdj, longAdj}`；`Totals = {pomodoros, studySeconds}`；`DayRow = Totals & {day}`。
- `CompletedInput = {id: UUID, completedAt: Unix整数毫秒, workMs: 整数分钟×60000}`。有效 workMs 为 60000–10800000；日期必须可解析，数字必须为安全整数。
- `Summary = {day, today: Totals, all: Totals}`；`DailyPage = {rows: DayRow[], totalDays}`。
- `Result<T> = {ok:true,value:T} | {ok:false,error:{code,message}}`，跨 IPC 不传 Error、SQL、路径或 Electron event。
- `RecordsBackend`：异步 `getSettings()`、`saveSettings(raw)`、`saveCompletedPomodoro(input)`、`getSummary(day)`、`listDaily({offset,limit})`，返回业务值；适配器将 Result 失败转为可被 controller 捕获的业务错误。
- 预览 `LegacyPreview = {token, summary:{from,to,dayCount,pomodoros,studySeconds}}`；主进程保留验证后的数据，token 只在当前进程内有效。
- 页面全局仅 `window.tomatoDesktop`：上述数据方法返回 Result，另提供 `previewLegacyImport()`、`commitLegacyImport(token)`、`notifyPhase({phase,kind,durationMs})`、`getVisibility()`、`onVisibilityChange(callback)->unsubscribe`、`onPrepareClose(callback)->unsubscribe`。preload 自行回应关闭请求，不向页面暴露 IPC 对象。

---

### Task 1: 验证桌面运行时与原生 SQLite，保存现有基线

**Files:** Create `package.json`, `package-lock.json`, `tests/desktop-runtime.test.cjs`; Modify `.gitignore`。
**Produces:** 精确依赖、已验证的 Electron SQLite ABI；`npm run start`、`test:web`、`test:desktop`、`rebuild:native`，后续任务沿用。

- [x] **Step 1: 保存已完成动画基线。** 核对现有七个未提交文件属于本次动画/交接工作，运行现有全量 31 用例后单独提交；不丢弃、不 stash、不合入其他未知修改。沿用用户选定的当前分支或工作区偏好。
- [x] **Step 2: 写真实原生边界测试。** `desktop-runtime.test.cjs` 要求 `process.versions.electron` 存在，使用 better-sqlite3 在临时文件创建表、写入 1500/3000、查询 sum=4500，关闭并重开后仍有 2 行；清理只针对该测试目录。
- [x] **Step 3: 确认依赖缺失时失败。** `node --test tests/desktop-runtime.test.cjs` 初始应因缺少模块/非 Electron 环境失败，记录原因。
- [x] **Step 4: 配置项目依赖。** package type=module，main=`desktop/main.cjs`；runtime dependency better-sqlite3=13.0.3；dev dependencies electron=44.6.0、@electron/rebuild=4.2.1、playwright-core=1.63.0。仅 `npm install --cache /tmp/tomatoclock-npm-cache`；Electron 下载缓存使用任务专用目录，不安装浏览器。
- [x] **Step 5: 重建并验证。** `electron-rebuild -f -w better-sqlite3 -v 44.6.0`；`test:web` 为 `node --test --test-isolation=none tests/*.test.js`，`test:desktop` 为 `ELECTRON_RUN_AS_NODE=1 electron --test --test-isolation=none tests/desktop-*.test.cjs`。原生测试必须在此 Electron 中通过，不能用系统 Node 的结果替代。
- [x] **Step 6: 提交。** 确认原有 31 用例及原生边界测试通过，提交 `build: verify Electron and SQLite runtime`。若工具缺系统依赖，记录具体错误，停止相关安装，按系统安全规则处理；继续能独立完成的测试和实现。

### Task 2: SQLite 完成明细、设置、每日统计与旧数据解析

**Files:** Create `desktop/database.cjs`, `desktop/legacy-import.cjs`, `tests/desktop-database.test.cjs`, `tests/desktop-import.test.cjs`。
**Consumes:** Shared Interfaces 与 Task 1 原生运行环境。
**Produces:** `openDatabase({filePath})->Promise<DatabaseService>`；service 同步业务方法与 RecordsBackend 同名，另 `importLegacyDays(days)`、`close()`；`parseLegacyImport(raw)->{days,summary}`，失败抛业务错误。

- [x] **Step 1: 写字面量结果测试。** 两个不同 UUID、同日本地完成时间、workMs=1500000/3000000：
  ```js
  assert.deepEqual(db.getSummary('2026-10-07').today, {pomodoros:2, studySeconds:4500});
  db.close(); // 再 open 同一临时文件，today 仍为上述值。
  ```
  同 UUID 同内容重试仍为 2 行；同 UUID 不同内容拒绝且数据不变。非法 UUID/NaN/不安全整数/负时长拒绝。settings 保存后重开保留，默认 50/0/0，坏参数按 Shared Interfaces 验证后复用 sanitizeSettings。
- [x] **Step 2: 写日期与失败测试。** 本地 23:59 和次日 00:01 各入对应桶；无记录日返回 0/0；31 个日期分页返回 30+1、倒序；跨日累计正确。损坏 SQLite、user_version=99、版本1缺失预期表均拒绝，不重建；比较原文件内容。正常重开不迁移或清空已有记录。
- [x] **Step 3: 写导入测试。** 旧 JSON 合法日汇总与桌面明细共同统计；重复导入不累加；同来源同日更新替换；未提供日期和桌面明细保留。2026-02-30、负数、非整数、超出安全整数、非法根结构或任意一天无效时整体拒绝，之前的数据不变。
- [x] **Step 4: 跑红测试。** `npm run test:desktop` 应因缺少服务模块失败。
- [x] **Step 5: 实现 schema version 1。** completed_pomodoros、settings、imported_daily_totals 和 local_day 索引；DELETE journal，参数化语句与事务；用本地日期 getter 派生日，不接受页面 day 字段。新空库初始化，已有高版本/异形库不覆盖。import source 固定 web-v1；输入日期逐条日历校验。范围查询来自独立日期日汇总，累计来自同一数据源。
- [x] **Step 6: 绿测试与提交。** 在 Asia/Shanghai、UTC、America/New_York 下运行 `test:desktop`；原 `test:web` 继续通过；提交 `feat: persist completed pomodoros in SQLite`。

### Task 3: 桌面窗口、受限桥接、通知与退出协调

**Files:** Create `desktop/main.cjs`, `desktop/application.cjs`, `desktop/ipc.cjs`, `desktop/preload.cjs`, `tests/desktop-application.test.cjs`, `tests/desktop-ipc.test.cjs`。
**Consumes:** `openDatabase`；Shared Interfaces。
**Produces:** `createDesktopApplication({electron,dataDir,htmlPath,openDatabaseImpl})->Promise<{window,close}>`，正式入口使用真实 Electron 和默认数据目录，测试注入临时目录；`registerIpc({ipcMain,window,db,dialog,notify})->dispose`。

- [x] **Step 1: 写 IPC 与生命周期测试。** 对实际 handler 传入真实临时 db 与窗口/对话框边界替身：错误 sender/子 frame 拒绝且无写入；分页越界拒绝；合法完成成功并持久化。单实例第二次打开只聚焦首窗；窗口配置锁定三项安全值与 backgroundThrottling=false；导航/新窗拒绝。
- [x] **Step 2: 写退出和窗口状态测试。** visible = 显示且非最小化且聚焦；focus/blur/minimize/restore/show/hide 发布一致状态。关闭时先等待 renderer prepareClose；无未保存记录退出；正在保存须等待；失败有待重试记录时支持重试/取消/明确放弃。renderer 尚未初始化时无可保存记录，关闭不悬挂；渲染崩溃退出，SQLite 已提交数据仍保留。
- [x] **Step 3: 跑红测试。** `npm run test:desktop` 缺少 application/ipc 时失败。
- [x] **Step 4: 实现固定 channel、来源检查与 preload。** 白名单对应 Shared Interfaces；移除事件中的 Electron event；subscribe 返回 unsubscribe；API 无任意 invoke/query/路径参数。关闭请求由 preload 等待页面注册的 callback，回报 request id 和 pending 数，未注册 callback 时回报 0。主进程收口退出决策、数据库 close 和连接清理。
- [x] **Step 5: 实现通知和 CSP。** 两个阶段文案沿用现有 app，点击通知只恢复/聚焦窗口；不自动开工。只加载本地页面，script-src self、style-src self unsafe-inline、img-src self data、connect-src none、object-src none，兼容已有 SVG/CSS 演出。数据库打开失败显示清楚错误，页面不可开工。
- [x] **Step 6: 验证提交。** `npm run test:desktop`、`npm run test:web` 通过，提交 `feat: add secure desktop lifecycle and bridge`。真实最小化/通知送达的 GUI 检查留 Task 6，不把边界替身称为系统验收。

### Task 4: 异步学习记录协调与网页/桌面适配

**Files:** Create `js/controller.js`, `js/runtime-adapters.js`, `js/format.js`, `tests/controller.test.js`, `tests/runtime-adapters.test.js`; Modify `js/app.js`。
**Consumes:** createTimer、createCelebration 原接口；RecordsBackend；桌面 preload API。
**Produces:** `createController({timer,records,notifier,celebration,now,uuid,onChange})` → `init/start/pause/resume/reset/tick/saveSettings/retryPending/prepareClose/getSnapshot`；异步方法返回 Promise，按钮动作须检查 getSnapshot().canStart。
**Snapshot:** `{state,segment,remainingMs,completedInRound,settings,summary,saving,pendingCount,error,canStart}`；`prepareClose()->Promise<{pendingCount}>`。`createRuntime({desktopApi,storage,notifier,document})` → `{records,notifier,isVisible,watchVisibility,legacy}`。

- [x] **Step 1: 写计时与入账测试。** 假时钟执行工作/暂停/恢复/休息/重置：25+50 分钟得到 4500 秒，暂停一小时不新增，退出中途不入账，休息结束停 READY；重复 tick 没有第二次入账。UUID 仅每个新工作段生成，暂停恢复保持。
- [x] **Step 2: 写异步失败/关闭/午夜测试。** 保存 reject：pendingCount=1、canStart=false、统计不伪增，提醒仍一次；retry 成功清队列且只 1 行。并发 retry 只有一次 flush；prepareClose 等待 in-flight 结束。设置保存失败回退旧值，保存中不能开工。昨日 getSummary 的延迟响应在换日后不覆盖今日摘要。
- [x] **Step 3: 写适配契约测试。** 网页使用现有 storage/notifier 并聚合 history，返回 Promise 业务值；桌面正确解包 Result，主窗口状态驱动动画可见性并可取消订阅；网页不暴露桌面 API 时启动正常。
- [x] **Step 4: 跑红测试。** `npm run test:web` 应因新模块缺失失败。
- [x] **Step 5: 实现 controller 与适配器。** 保存队列串行，单条 CompletedInput 保持 UUID；异步统计请求带修订号与 day 校验。初始化成功才启用开始，保存错误可重试。适配器统一数据接口，日期与固定格式移到 format.js；现有 timer.js/celebration.js 的业务与接缝不改。
- [x] **Step 6: 接线和验证提交。** app 只管 DOM、250ms tick/deadline 兜底与 controller 快照，设置失败回填旧值，页面可见状态从 runtime 注入。运行全量两套测试并提交 `feat: coordinate desktop persistence without changing timer rules`。

### Task 5: 每日记录视图与按需网页导出/桌面导入

**Files:** Create `js/records-view.js`; Modify `index.html`, `style.css`, `js/app.js`, `desktop/ipc.cjs`; Extend `tests/runtime-adapters.test.js`, `tests/desktop-import.test.cjs`。
**Consumes:** listDaily、getSummary、LegacyPreview 与 import service；controller snapshot。
**Produces:** `createRecordsView({root,records,onBack,onImport,onExport})->{show,refresh,hide}`；主进程 `previewLegacyImport()` 与 `commitLegacyImport(token)`，网页 `legacy.exportJson()->string`。

- [x] **Step 1: 写导入预览/确认行为测试。** 用户取消文件选择无变化；JSON 上限 1 MiB，非法内容不生成 token；预览只读，commit 后才写；只缓存一个最新 token，旧/未知 token 拒绝；commit 使用预览时验证的数据，不重新读已变更的文件。
- [x] **Step 2: 写数据导出/分页行为测试。** 导出只序列化 tomatoclock:v1 的 days/settings，不清理数据；30+1 页调用正确，零记录提示固定文案；仅以 textContent 展示日期/数字，非法导入不能进入表格。
- [x] **Step 3: 跑红测试。** 相关测试对导入 handler 和 exportJson 先失败，确认错误来自未实现的行为。
- [x] **Step 4: 实现 UI。** 保留现有计时 DOM id；新增 `records-toggle`、`records-view`、`records-body`、`records-prev`、`records-next`、`records-back`、`all-time`、`retry-save-btn`、`legacy-import-btn`、`legacy-export-btn`、`import-confirm`。主页显示今日与全部累计，提供“学习记录”；记录页倒序日期、番茄数、时长、上一页/下一页、“回到计时”。桌面展示“导入旧记录”，网页展示“导出学习记录”。导入预览展示范围/总计，点击确认才提交；本版不加折线图。切换视图不创建新 timer。
- [x] **Step 5: 浏览器冒烟与提交。** 检查 1280/800 宽度、加载/空/失败/分页、正在计时切换记录页、返回后计时连续、动画退出；保存临时浏览器 harness 和结果。两套测试通过，提交 `feat: show daily study records and migrate web totals`。

### Task 6: Linux 成品打包、用户入口与完整验收

**Files:** Create `assets/tomatoclock.svg`, `assets/tomatoclock.png`, `scripts/package-linux.cjs`, `scripts/install-user.cjs`, `tests/desktop-package.test.cjs`, `tests/fixtures/electron-test-main.cjs`, `tests/desktop-ui.cjs`; Modify `package.json`, `HANDOFF.md`, `docs/analysis.md`。
**Consumes:** 上述全部业务模块与精确依赖。
**Produces:** `npm run package:linux` → `dist/TomatoClock-linux-x64/`，含正式可执行文件、resources/app、本地图标与可点击启动器；`npm run verify:ui`；用户级安装脚本不操作系统级目录。

- [x] **Step 1: 写成品验收断言。** 包内含页面、五个原模块/新适配模块、desktop、生产依赖及匹配 ABI 的 SQLite .node；不嵌入第二份 Electron、dev 工具、测试数据库、真实用户数据、.git 或 node_modules 全目录。生产依赖按锁文件递归复制，不凭猜测删传递依赖。
- [x] **Step 2: 先验证未打包时失败。** 成品测试期望明确报缺少 dist；不能把缺产物跳过后称为通过。
- [x] **Step 3: 实现便携目录和用户安装。** 使用已下载 Electron prebuilt 手工打包，native 模块以普通文件保存，不放进未解包 asar。原创 SVG 另渲染为 PNG 并纳入版本控制，NativeImage/窗口用 PNG；打包不引入额外图片转换依赖。启动器定位自身目录，设置合法应用名/图标；用户安装到 `~/.local/opt/tomatoclock` 和 XDG 用户 applications，仅替换本应用程序，数据库目录不删除。脚本支持 `--dry-run` 和 `--prefix <临时目录>`，先验收临时安装，真实安装在成品检查后执行；遵守沙箱权限。成品路径和临时安装路径包含中文/空格的情况也要验证。
- [x] **Step 4: 运行成品 SQLite 检查。** 使用成品可执行文件的 Electron Node 模式执行测试入口，在临时数据库写入并重开，验证 4500 秒及 settings；删除构建源目录依赖的引用后仍能加载生产模块。以实际 file hash/相对依赖位置确认包不依赖项目 node_modules。
- [x] **Step 5: 运行真实 Electron UI 测试。** 用 playwright-core `_electron.launch({chromiumSandbox:true,...})` 启动相同 application 工厂，测试 fixture 注入临时 dataDir。验证有效 CSP、Node 不暴露、窗口安全值、真实 SQLite 入账、重开、计时/记录切换、minimize/restore 最新演出一次、退出半截作废、两种通知触发。进程实际不得带 no-sandbox；系统通知触发不等于 KDE 实际送达，另做本机验收。
- [x] **Step 6: 处理真实图形环境边界。** 当前工具 DISPLAY/WAYLAND_DISPLAY 为空，Xvfb 不在 PATH。执行时先检查已有图形会话/工具；GUI 不可用则输出具体未验收项，让用户在本机以临时数据运行成品进行验收，不自动安装图形服务器、不修改内核或 Electron 沙箱。无显示时 UI 命令应明确失败/报未验收，不算全绿。
- [x] **Step 7: 回归和独立整体验收。** `npm run test:web`、三个时区的 `test:desktop`、成品检查和真实 UI；GUI 可用时检查实际桌面图标、系统通知和声音。按 requesting-code-review 提交独立只读整轮审阅；修复实质问题后重跑受影响检查。整理实际通过/失败/未验收，不宣称未运行的检查已通过。
- [x] **Step 8: 更新交接并提交。** 写出数据库位置、启动/更新方法、用户级安装范围、备份方法、后续折线图接口、已知限制和验收证据；提交 `feat: package local desktop app for Linux`。不自动推送 GitHub 或覆盖网页线上版本。

## Self-Review / Coverage

- Spec 1/7：Task 3/5/6 覆盖可启动应用、界面、通知、记录分页和安全边界。
- Spec 2：Task 4 保留纯状态机，Task 3/6 覆盖最小化、退出与本机行为。
- Spec 3/4：Task 1/2 固定驱动与结构；Task 2/6 验证持久化、日期、版本与程序/数据分离。
- Spec 5/8：Task 2/3/4 覆盖幂等、保存失败、退出等待、损坏数据保护；渲染崩溃只保障已提交记录。
- Spec 6：Task 2/5 保留原日汇总、预览确认、重复导入不叠加、原子回滚。
- Spec 9/10：Task 6 的成品、用户级安装、三时区、原有回归、真实 GUI 与系统安全验收。
- 类型统一为 CompletedInput 的 completedAt/workMs；数据库内部才转 completed_at_ms/work_seconds，页面不计算 SQL 字段或 local_day。
- 所有数据读写测试隔离在临时目录；Playwright 显式开启 Chromium sandbox，避免默认测试选项降低成品安全要求。

## Execution Handoff

用户已回复“执行”，按 Native 方式完成全部任务、一次独立审阅与修复回归；程序已用户级安装。

建议 **Native：主 Sol 沿用当前 codex/desktop-app 分支实施，必要时做边界清楚的只读调查，最后由 Sol 专项代理独立审阅整套改动**。六个任务共享数据库、preload 和 controller 接口，主执行能减少交接与重复上下文；本版数据保存可靠性仍由完整测试和最终独立审阅保证。

另一方式是 Subagent-driven：各任务分别由实现代理执行、逐任务审阅，再做整轮审阅。用户审阅本计划并选择方式后才开始安装项目依赖和产品实现；如选择当前分支，即沿用现有工作区，不另建 worktree。

## Sources

- [Electron 原生模块重建](https://github.com/electron/rebuild)
- [better-sqlite3 Electron 注意事项](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)，chromiumSandbox 默认 false，本计划显式 true。
- 本次 npm view 核验：electron 44.6.0；better-sqlite3 13.0.3（Node >=22）；@electron/rebuild 4.2.1（Node >=22.12）；playwright-core 1.63.0（Node >=20）；当前系统 Node v26.10.0。
