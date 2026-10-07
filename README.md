# TomatoClock 本地番茄钟

从应用菜单搜索“番茄钟”即可打开。关闭窗口会退出，未完成的番茄不计入学习记录；最小化时继续计时。休息结束后手动开始下一段。

## 第一版功能

- 自定义工作时长，自动计算短休和长休，每四个番茄长休。
- 完成后系统通知、全屏番茄动画和较响提示音。
- 今日番茄数、今日学习时长、历史累计时长。
- 每日学习记录，按日期倒序分页；按每个已完成工作段的实际设定时长累加。
- 数据仅保存在本机 SQLite，离线可用。折线图留待后续添加。
- 启动时检查本地新版，提示“立即更新 / 暂时跳过”；一键更新后自动重新打开。

## 启动与安装

便携成品在 `dist/TomatoClock-linux-x64/`，双击 `start-tomatoclock` 启动。

用户级安装入口是 `scripts/install-user.cjs`；安装到 `~/.local/opt/tomatoclock`，应用菜单入口位于 XDG 用户 applications 目录。只替换本应用文件，拒绝覆盖不能确认归属的同名目录或入口。支持 `--dry-run` 预览及 `--prefix` 临时测试安装。

安装目录中的 `start-tomatoclock` 是固定入口；实际程序放在 `versions/<更新标识>/package`，`current` 指向当前版本。旧程序保留，启动恢复入口使用固定的、已经验证过的 Electron 运行时。首次从旧安装升级时，原来的平铺程序和额外文件保留，不覆盖正在运行的旧程序。

当前 CachyOS / KDE Wayland 上使用已存在的 XWayland 显示通道，解决 Electron 原生 Wayland 最小化/恢复限制。应用与测试均保持 Chromium 沙箱开启，不需要修改桌面、内核或引导配置。

## 数据与备份

默认数据库：`~/.local/share/tomatoclock/learning.sqlite`。若设置了 XDG_DATA_HOME，位于其下的 `tomatoclock/learning.sqlite`。

先关闭应用，再复制 learning.sqlite 即可备份。应用程序目录与数据库分离；更新继续使用原数据库。恢复备份时也应先关闭应用。

一键更新前会自动复制数据库到同目录的 `backups/before-update-*.sqlite`。存在待恢复的 SQLite 事务文件时暂缓更新，先打开当前版恢复数据库。程序恢复不会自动覆盖数据库；今后涉及数据库结构变化的版本必须先明确设计迁移和兼容规则。

“学习记录”中的“导入旧记录”接受网页版导出的 JSON，先预览，确认后写入。同来源同日期替换，重复导入不叠加，桌面完成记录保留。文件最大 1 MiB。导入不删除网页数据。

本地源码的网页入口包含“导出学习记录”；此前线上网页尚未发布这次更新，因此旧线上数据需要后续发布导出入口或单独导出，桌面版从空记录开始也可直接使用。

## 本地一键更新

从应用菜单打开时检查 `dist/updates/latest.json` 指向的已打包新版。发现不同的、版本号不低于当前版本的更新后，提示“立即更新 / 暂时跳过”；选择更新后先校验、备份、复制，再原子切换程序并重新打开。没有新版或源码目录已移动时，正常打开当前版。

更新检查只在启动时进行。已打开的计时不会被打断，运行时再次点菜单入口只唤起已有窗口。校验或安装失败时继续使用当前版；新版未完成首次启动而失败时，恢复到上一版，并暂时跳过这一份失败的更新包。

更新源的绝对路径写在 `~/.local/opt/tomatoclock/.tomatoclock-install.json`。当前使用本项目的 `dist/updates`，无需联网或服务器。移动项目后需要重新运行安装脚本来设置新位置。程序版本和更新包保留在本机，会占用额外空间；不自动删除旧版本或备份。

以后维护此项目时：修改代码 → 验证相关功能 → 运行 `npm run release:local` → 告知用户下次打开可一键更新。这个命令会打包、运行全部自动测试，通过后才公布本地更新。只保存源码或运行 `package:linux` 不会公布更新。首次安装更新能力才需要运行安装脚本，之后发布新版不需要覆盖正在运行的安装目录。

## 开发

精确依赖版本见 package.json/package-lock.json。首次安装 Electron 44 后显式下载运行时；better-sqlite3 13 的 Node-API 预编译模块已在真实 Electron 中验证，无需额外编译。

```sh
npm install
npx install-electron --no
npm start
npm test
npm run package:linux
npm run verify:ui -- --packaged
npm run verify:update
npm run release:local
```

GUI 检查使用独立临时数据目录并断言实际配置路径，测试数据库不与正式记录混用。界面测试需要已有图形会话，缺少时明确报未验收。所有测试保持应用沙箱开启。

更新 GUI 检查通过实际安装 shell 入口和 Electron relaunch 验证升级，只在临时包中自动回答原生对话框。正式程序不包含自动批准更新的测试开关。
