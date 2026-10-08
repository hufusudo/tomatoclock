# TomatoClock 当前维护交接

最后更新：2026-10-08。先读根目录 `AGENTS.md`；这里是当前状态入口。历史任务已经结束，不重新执行历史设计/计划中的审批清单。

## 当前状态

- 项目：本机自用番茄钟，Electron 44.6.0 + better-sqlite3 13.0.3，保留共用网页入口。
- 当前分支：`codex/desktop-app`；未合并、未推送，不自动发布网页。
- 正式已安装：0.3.2（本次只读核实），用户菜单“番茄钟”。0.3.3 更新包已发布到本地更新源，下次从菜单打开时可选择更新。
- 已有功能：计时/统计/设置三页导航，暖白计时页与圆形倒计时，开始/结束及暂停/恢复切换，三枚立体按压按钮；原生通知、提醒动画和音效；按天/按周统计、本地数据库、升级清理和启动时一键更新。
- 暂未实现：学习时长折线图、托盘、自动在线更新。关闭窗口即退出，最小化继续计时，未完成工作段不入账。

## 目录与数据

| 内容 | 位置 |
|---|---|
| 源代码 | `/home/hf/项目/TomatoClock` |
| 最新便携构建 | `dist/TomatoClock-linux-x64` |
| 本地更新源 | `dist/updates`，最近两份发布 |
| 用户程序入口 | `~/.local/opt/tomatoclock/start-tomatoclock` |
| 实际程序 | 安装目录 `versions/<SHA256>/package`，由 `current` 指向 |
| 固定恢复运行时 | 安装目录 `.bootstrap/runtime`，保留它指向的版本 |
| 学习数据库 | `~/.local/share/tomatoclock/learning.sqlite`（或 XDG_DATA_HOME 下） |
| 自动数据库备份 | 同数据目录的 `backups/`；**用户要求全部保留** |

安装程序与源码、数据库分离。改源码不直接修改已安装程序。移动源码后，程序仍能用，更新源绝对路径需重新安装配置。

## 代码职责

| 需求 | 优先阅读/修改 |
|---|---|
| 计时与工作规则 | `js/timer.js`、`js/controller.js` |
| 页面与记录展示 | `index.html`、`style.css`、`js/app.js`、`js/records-view.js`、`js/record-periods.js` |
| 提醒动画/音效 | `js/celebration.js` |
| 数据库/导入 | `desktop/database.cjs`、`desktop/legacy-import.cjs` |
| 桌面生命周期/安全桥接 | `desktop/application.cjs`、`desktop/ipc.cjs`、`desktop/preload.cjs` |
| 本地发布/复制/更新 | `desktop/releases.cjs`、`desktop/local-update.cjs`、`scripts/publish-local.cjs` |
| 失败恢复/固定启动器 | `desktop/launch-bootstrap.cjs`、`scripts/install-user.cjs` |
| 安全清理/维护协调 | `desktop/cleanup.cjs`、`desktop/maintenance-lock.cjs`、`scripts/cleanup.cjs` |
| 打包 | `scripts/package-linux.cjs` |

## 必须保留的行为

- 工作整数 1–180 分钟；短休=工作÷5，长休=工作×0.6，微调 ±5 分钟，休息至少 1 分钟；仅准备状态可改设置。
- 每四个完成工作段长休；总时长是每段完成工作的设定时长相加，暂停和未完成部分不计入。
- 到期补记最多一段；休息结束必须手动开工。动画保留 pending/幂等及点击/Esc 退出语义。
- 提前结束未完成工作段不会入账；已完成的记录保留。暂停在到期时按原截止时间结算，不能冻住零秒或丢失已完成番茄；恢复进度冻结，重置始终叫“重置”。
- 完成记录 UUID 去重，确认保存后展示统计；失败记录可重试且阻止开始下一段。关闭等待保存，放弃须用户明确选择。
- Chromium 沙箱、上下文隔离开启，页面没有 Node/SQL/路径访问权限。当前使用已存在的 XWayland，不改系统配置。
- 更新前有数据库事务文件时暂缓更新；失败保留旧程序。程序恢复不自动覆盖数据库。
- 周一至周日为一周，包含当月1日的那周为该月第1周，跨月也统计完整七天；空日期补零。周总计使用已有每日汇总，数据库版本仍为1。`getDailyRange` 限制最多62天，旧分页接口保留。
- 更新成功才清理已安装旧版本，保留当前、上一版与固定恢复运行时。无法确认的文件不清理；学习记录、全部备份、手工文件和旧平铺安装保留。

## 固定维护流程

1. 读当前需求涉及的模块，局部修改，补必要行为测试。
2. `npm run release:local`：打包 → 全部自动测试 → 公布本地新版 → 清理旧更新包。
3. UI 或更新改动用对应 GUI 检查，保持临时 XDG 数据目录和沙箱；证据放会话可视化目录。
4. 更新本文件及已有专题说明，告知用户下次打开可一键更新。不要手改已安装代码或正式数据库。

常用检查：`npm test`；`npm run verify:ui -- --packaged`；`npm run verify:update`。手动清理：先 `npm run cleanup:preview`，再 `npm run cleanup`。不重复安装已有依赖或无理由重复测试。

## 进一步资料

- 用户使用、备份、更新：`README.md`
- 更新/清理机制和验收：`docs/local-update-notes.md`
- 桌面版初次实现与特殊处理：`docs/desktop-implementation-notes.md`
- 原网页/动画历史分析：`docs/analysis.md`
- 决策记录：`_bmad-output/initiative-tomatoclock/brief-tomato-clock/.memlog.md`

历史 spec/plan、BMad 文件只在需要追溯具体决策时读取。最新验证结果记在专题文档，不用遍历旧任务重新发现状态。

本次验证：93 网页/计时/桌面测试通过；成品 GUI 核验三页导航、圆环进度、按钮按压、提前结束/暂停恢复、统计、键盘焦点、减少动画与小窗口。只读复制当前0.3.2安装后可升级至0.3.3，学习记录和设置保留。只读审阅无阻塞问题；证据在当前会话可视化目录 `tomatoclock-redesign/`。
