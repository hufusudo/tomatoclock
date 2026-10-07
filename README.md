# TomatoClock 本地番茄钟

从应用菜单搜索“番茄钟”即可打开。关闭窗口会退出，未完成的番茄不计入学习记录；最小化时继续计时。休息结束后手动开始下一段。

## 第一版功能

- 自定义工作时长，自动计算短休和长休，每四个番茄长休。
- 完成后系统通知、全屏番茄动画和较响提示音。
- 今日番茄数、今日学习时长、历史累计时长。
- 每日学习记录，按日期倒序分页；按每个已完成工作段的实际设定时长累加。
- 数据仅保存在本机 SQLite，离线可用。折线图留待后续添加。

## 启动与安装

便携成品在 `dist/TomatoClock-linux-x64/`，双击 `start-tomatoclock` 启动。

用户级安装入口是 `scripts/install-user.cjs`；安装到 `~/.local/opt/tomatoclock`，应用菜单入口位于 XDG 用户 applications 目录。只替换本应用文件，拒绝覆盖不能确认归属的同名目录或入口。支持 `--dry-run` 预览及 `--prefix` 临时测试安装。

当前 CachyOS / KDE Wayland 上使用已存在的 XWayland 显示通道，解决 Electron 原生 Wayland 最小化/恢复限制。应用与测试均保持 Chromium 沙箱开启，不需要修改桌面、内核或引导配置。

## 数据与备份

默认数据库：`~/.local/share/tomatoclock/learning.sqlite`。若设置了 XDG_DATA_HOME，位于其下的 `tomatoclock/learning.sqlite`。

先关闭应用，再复制 learning.sqlite 即可备份。应用程序目录与数据库分离；更新前关闭应用，重新安装程序，数据库继续保留。恢复备份时也应先关闭应用。

“学习记录”中的“导入旧记录”接受网页版导出的 JSON，先预览，确认后写入。同来源同日期替换，重复导入不叠加，桌面完成记录保留。文件最大 1 MiB。导入不删除网页数据。

本地源码的网页入口包含“导出学习记录”；此前线上网页尚未发布这次更新，因此旧线上数据需要后续发布导出入口或单独导出，桌面版从空记录开始也可直接使用。

## 开发

精确依赖版本见 package.json/package-lock.json。首次安装 Electron 44 后显式下载运行时；better-sqlite3 13 的 Node-API 预编译模块已在真实 Electron 中验证，无需额外编译。

```sh
npm install
npx install-electron --no
npm start
npm test
npm run package:linux
npm run verify:ui -- --packaged
```

GUI 检查使用独立临时数据目录并断言实际配置路径，测试数据库不与正式记录混用。界面测试需要已有图形会话，缺少时明确报未验收。所有测试保持应用沙箱开启。
