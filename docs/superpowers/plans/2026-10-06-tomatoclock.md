# TomatoClock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个零构建的自用网页番茄钟：只填工作时长，短休/长休自动推算（±5 微调），到点以系统通知为主提醒，今日番茄数与学习时长存 localStorage。

**Architecture:** 浏览器原生 ES modules 单页应用。`js/timer.js` 为纯逻辑状态机（注入时钟，不碰 DOM/storage），`storage.js`/`notify.js`/`celebration.js` 各管一件事，`app.js` 只做组装与事件分发。计时一律用 deadline 与 `now()` 相减判定，到点转换只通过事件数组上报，实时与唤醒补记走同一路径。

**Tech Stack:** 原生 HTML/CSS/JS（ES modules）、Notification API、Web Audio、localStorage；测试用 `node --test`（Node v26，零依赖）。不引入任何 npm 依赖、不加打包器。

**Spec:** `docs/superpowers/specs/2026-10-06-tomatoclock-design.md`（实现照它抄；本文补足它留给实现者的具体值）

## Global Constraints

- 零构建零依赖：文件树严格等于 spec §2（`index.html`、`style.css`、`js/{timer,storage,notify,celebration,app}.js`、`tests/{timer,storage,celebration}.test.js`），**不加 package.json、不加 node_modules**（已实测 Node v26 对 `.js` 的 ESM 语法自动探测，`node --test` 可直接跑；若未来 Node 报模块错，唯一允许的补救是加 `{"type":"module"}`）
- `timer.js` 不碰 DOM、不碰 storage；时间只经注入的 `now()` 进出
- 公式：短休 = 工作 ÷ 5，长休 = 工作 × 0.6，各 ±5 分钟钳制；`workMin` 整数 1–180，**仅 READY 态可改**；**有效休息时长下限 1 分钟**（钳制后不足 60000ms 按 60000ms 计，堵死"借微调取消休息"）
- storage 单键 `tomatoclock:v1`；写入时机仅两处：工作段归零入账、用户改设置；派生值（有效短休/长休）不落盘
- 进行中番茄随页面关闭作废（不落盘即作废）；今日学习总时长 = 已完成番茄数 × 工作时长（按完成段实际时长累加）
- 休息结束**不自动开工**（手动闸门）；一轮 4 个番茄后进长休
- `celebration.js` 的 `play(phase)` / `dismiss()` 接口冻结，phase 仅 `'work-done' | 'break-done'`；除本文件外任何模块不得感知演出细节
- 范围外一律不做（任务清单、统计报表、账号云同步、Web Push、强制锁页、睡眠补休、半截番茄计时、移动端适配、真实动画演出）
- 每个任务一次 TDD 循环 + 一次提交；提交信息用 `feat:`/`test:`/`docs:` 前缀

**UI / 通知文案（全文固定，实现者不得改写）：**

| 位置 | 文案 |
|---|---|
| 相位标签 | `准备开始` / `专注中` / `已暂停` / `短休` / `长休` |
| 主按钮 | READY 且（`completedInRound > 0` 或今日番茄数 > 0）→ `开始下一个番茄`；否则（新一天首个番茄）→ `开始番茄` |
| 次按钮 | WORKING → `暂停`；PAUSED → `恢复`；READY/BREAK → 禁用 |
| 重置按钮 | `重置`（任意态可用） |
| 页脚 | `今日 {N} 个番茄 · 累计 {duration}` |
| 设置旁推算预览 | `短休 {duration} · 长休 {duration}` |
| 通知 work-done | title `番茄完成 🍅`，body `该休息了：{短休|长休} {duration}。` |
| 通知 break-done | title `休息结束`，body `该开工了：点“开始下一个番茄”。` |
| 通知降级提示（`#notify-hint`） | `通知被拒绝或不可用：请在浏览器地址栏的锁形图标里允许通知，才能在后台收到提醒。` |
| 存储降级横幅（`#storage-warning`） | `浏览器存储不可用，本次数据不会保存。` |

`formatDuration(ms)`（app.js 内部）：`< 1 小时` → `M 分` 或 `M 分 S 秒`；`≥ 1 小时` → `H 小时 M 分`；`0` → `0 分`。例：600000 → `10 分`，330000 → `5 分 30 秒`，7500000 → `2 小时 5 分`。
`formatClock(ms)`（app.js 内部）：`MM:SS`，分钟不进位到小时（180 分显示 `180:00`）。

## Review Focus

1. **脏输入/极端输入**（workMin 空、`25.7`、`0`、`181`、`'abc'`，adj `±99`）→ 期望：全部钳制成整数 `workMin∈[1,180]`、`adj∈[-5,5]`，页面不崩。→ 钉在 Task 1 Step 1 的 `sanitizeSettings 钳制边界` 测试 + Task 6 手工步骤。
2. **后台/睡眠期间连续到点**（工作到点后休息也到点，或同一点被 tick 两次）→ 期望：补放/发声**恰好一次**，最新事件胜出，不连锁空转。→ 钉在 Task 3 Step 1 幂等测试 + Task 6 手工步骤。
3. **通知权限被拒或 API 不支持** → 期望：永不重复弹权限框，`#notify-hint` 出现，计时/动画/统计一切照常。→ 钉在 Task 4 Step 1 的 smoke 断言 + Task 6 手工步骤。
4. **localStorage 不可用（隐私模式）** → 期望：内存兜底、`isPersistent === false`、`#storage-warning` 出现、功能照常。→ 钉在 Task 2 Step 1 测试 + Task 6 手工步骤。
5. **暂停很久后恢复 / 睡眠跨午夜** → 期望：恢复不漂移（`deadline = now + remainingMs`）；入账按 **deadline** 的本地日期分桶，实时与补记同口径。→ 钉在 Task 1 Step 1 测试 + Task 2 Step 1 测试。

---

### Task 1: 计时状态机 `js/timer.js`

**Files:**
- Create: `js/timer.js`
- Test: `tests/timer.test.js`

**Interfaces (Produces):**
- `sanitizeSettings(raw) -> { workMin, shortAdj, longAdj }`：`workMin` 取 `Math.round` 后钳 `[1,180]`（缺失/NaN → 50）；`shortAdj`/`longAdj` 取 `Math.round` 后钳 `[-5,5]`（缺失/NaN → 0）
- `effectiveDurations(settings) -> { workMs, shortBreakMs, longBreakMs }`：`workMs = workMin * 60000`；`shortBreakMs = Math.max(60000, workMs / 5 + shortAdj * 60000)`；`longBreakMs = Math.max(60000, workMs * 0.6 + longAdj * 60000)`（此处不钳 ±5，钳制责任只在 `sanitizeSettings`）
- `createTimer({ settings, now = () => Date.now() }) -> timer`，timer 提供：
  - getters `state`（`'ready'|'working'|'paused'|'break'`）、`segment`（`'work'|'short-break'|'long-break'|null`，paused 时仍为 `'work'`）、`completedInRound`（0–3）
  - `remainingMs() -> number`（≥0；ready 时返回 `effectiveDurations(settings).workMs`）
  - `start() / pause() / resume() / reset() / tick() -> Event[]`；`setSettings(next) -> void`（非 ready 态抛 `Error`）
- `Event` 三种：`{ type: 'work-done', completedAt, workMs }`、`{ type: 'break-started', kind: 'short'|'long', durationMs }`、`{ type: 'break-done' }`
- 语义（实现者不可自行决定）：`completedAt` = 该工作段的 **deadline**（实时与补记同口径）；`tick()` **至多走一格**（新段 deadline = `now() + durationMs`，结构上保证不连锁）；`reset()` 只放弃当前段、**不改** `completedInRound`、不产生事件；第 4 个 work-done → `kind: 'long'` 且 `completedInRound` 归 0；非法转换（如非 ready 态 `start()`）抛 `Error`；paused 态 `tick()` 恒返回 `[]`

- [ ] **Step 1: 写失败测试 `tests/timer.test.js`**（假时钟 `let t = 0; const now = () => t`，用 `import { test } from 'node:test'` + `node:assert/strict`）。至少覆盖（测试名照抄）：
  - `ready→working→break 全路径`：workMin=50 起跑，`t` 前进 3000000ms 后 `tick()` → `[{type:'work-done', completedAt: 3000000, workMs: 3000000}, {type:'break-started', kind:'short', durationMs: 600000}]`，`state === 'break'`
  - `第 4 个番茄进长休`：连续 4 轮归零 → 第 4 次 `break-started` 的 `kind === 'long'` 且 `durationMs === 1800000`，`completedInRound` 归 0
  - `暂停/恢复不漂移`：工作至 `t=1000000` 暂停 → `remainingMs() === 2000000`；`t` 走 1 小时后恢复，再走 1999999ms `tick()` 无事件，走 1ms 后 `tick()` 产生 `work-done`
  - `唤醒补记最多一格`：起跑后 `t` 直接跳 3 小时，一次 `tick()` → 恰好 `work-done + break-started`，`remainingMs()` 等于完整 `shortBreakMs`；再 `tick()` 无事件
  - `break 归零回 ready 且不自动开工`：休息段过期 `tick()` → `[{type:'break-done'}]`，`state === 'ready'`；随后任意 `tick()` 返回 `[]`
  - `重置不回滚轮次且不入账`：2 次归零后中途 `reset()` → `completedInRound === 2`、`state === 'ready'`、`tick()` 无 `work-done`
  - `sanitizeSettings 钳制边界`：`{workMin: 0}`→1、`{workMin: 181}`→180、`{workMin: 25.7}`→26、`{workMin: 'abc'}`→50、`{shortAdj: 99, longAdj: -99}`→5/-5
  - `有效休息 1 分钟下限与 ±5`：`{workMin: 1, shortAdj: -5}` → `shortBreakMs === 60000`；`{workMin: 25, shortAdj: 5}` → 600000；`{workMin: 25, longAdj: -5}` → 600000
  - `WORKING 中 setSettings 抛错`
- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/timer.test.js`
Expected: FAIL（`Cannot find module .../js/timer.js`）

- [ ] **Step 3: 实现 `js/timer.js`**（按 Interfaces 内部闭包持有 `state/segment/completedInRound/deadline/pausedRemainingMs/segmentWorkMs`；`tick()` 只比较 `now() >= deadline`）
- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/timer.test.js`
Expected: PASS（全绿）

- [ ] **Step 5: 提交**

```bash
git add js/timer.js tests/timer.test.js
git commit -m "feat: 计时状态机 timer.js（deadline 判定、补记最多一格、±5 与 1 分钟下限）"
```

### Task 2: 存储 `js/storage.js`

**Files:**
- Create: `js/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: Task 1 的 `sanitizeSettings`
- Produces:
  - `STORAGE_KEY = 'tomatoclock:v1'`
  - `dayKey(ms) -> 'YYYY-MM-DD'`（**本地时区**日期）
  - `createStorage({ backend } = {}) -> { isPersistent, load(), saveSettings(settings), recordPomodoro({ completedAt, workMs }) }`
  - `backend` 默认 `globalThis.localStorage`；构造时探测（访问/读写均 try/catch），不可用 → 内存 Map 兜底且 `isPersistent === false`
  - `load() -> { days, settings }`：JSON 损坏/形状不符 → 丢弃重建为 `{ days: {}, settings: sanitizeSettings({}) }`，不崩、不强制写回
  - `saveSettings(settings) -> settings`（先 `sanitizeSettings` 再落盘）
  - `recordPomodoro({ completedAt, workMs }) -> { key, day }`：`key = dayKey(completedAt)`；`day.pomodoros += 1`；`day.studySeconds += Math.round(workMs / 1000)`；落盘后返回 `{ key, day: { pomodoros, studySeconds } }`

- [ ] **Step 1: 写失败测试 `tests/storage.test.js`**（假 backend：`{ store: Map 的 getItem/setItem/removeItem 包装 }`，`now` 不需要注入）。至少覆盖：
  - `按完成时刻分桶`：`recordPomodoro({completedAt: Date.parse('2026-10-06T10:00:00'), workMs: 3000000})` → `key === '2026-10-06'`，`day = {pomodoros: 1, studySeconds: 3000}`
  - `跨午夜分桶`：23:59 与次日 00:01 两次入账 → 两个不同 `key`，各自 pomodoros 为 1
  - `损坏 JSON 容错`：backend 预置 `'{oops'` → `load()` 返回默认值（`settings.workMin === 50`、`days` 为空），不抛错
  - `设置读写与钳制`：`saveSettings({workMin: 999, shortAdj: -99})` 落盘值为 `{workMin: 180, shortAdj: -5, longAdj: 0}`，重开 `load()` 一致
  - `存储不可用时内存兜底`：`createStorage({ backend: 抛错的假实现 })` → `isPersistent === false`，`recordPomodoro` 后 `load()` 仍能看到该记录
  - `多次入账累加 studySeconds`：同一天两笔 workMs 1500000 + 3000000 → `studySeconds === 4500`
- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/storage.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `js/storage.js`**（`dayKey` 用 `new Date(ms)` 的 `getFullYear/getMonth/getDate` 手工拼串，**禁用 `toISOString`**（那是 UTC））
- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/storage.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add js/storage.js tests/storage.test.js
git commit -m "feat: localStorage 分日存储 storage.js（本地日期分桶、损坏容错、内存兜底）"
```

### Task 3: 动画接缝 `js/celebration.js`

**Files:**
- Create: `js/celebration.js`
- Test: `tests/celebration.test.js`

**Interfaces:**
- Produces（**接口冻结**，未来 AI 只换内部实现）：`createCelebration(deps) -> { play(phase), dismiss() }`，`phase ∈ 'work-done' | 'break-done'`
  - deps：`isVisible: () => boolean`、`watchVisibility: (onChange) => unlisten`、`getRemainingMs: () => number`、`show: ({ phase, remainingMs, onClose }) => void`、`playSound: (phase) => void | Promise`
  - （接口形态澄清：spec §5 写的是 `export function play(phase)` / `dismiss()`；因 spec 同条要求"页面可见性可注入"，落实为工厂返回的同名同签名方法。`app.js` 只调用 `play`/`dismiss`，不得触碰其余细节。）
  - 内部 pending/幂等规则：`play` 时 `isVisible()` 为真 → `show` + `playSound` 各恰好一次；为假 → 只记 pending（**后到覆盖先到**，最多一条），不显示不发声；可见性回调触发且 `isVisible()` → 补放 `show` + `playSound` 各恰好一次并清 pending；已有未 dismiss 的演出时再次 `play` → 忽略（幂等）；`dismiss()` 关闭当前演出（无演出时 no-op），此后新转换可再 `play`；非法 phase 抛 `Error`
  - 占位实现（默认 `show`/`playSound`，app.js 之外唯一允许感知 DOM 的地方）：`show` 建全屏遮罩（`role="dialog"`）+ 大字 phase 文案 + `formatClock(getRemainingMs())` 每秒刷新倒计时，点任意处调 `onClose`；`playSound` 用 Web Audio 三声合成（`AudioContext` 需 `resume()`）；默认实例惰性创建，**模块 import 时不碰 `document`/`AudioContext`**（否则 Node 测试 import 即炸）

- [ ] **Step 1: 写失败测试 `tests/celebration.test.js`**（注入假 `isVisible`/`watchVisibility`/`show`/`playSound`，用计数器断言）。至少覆盖（测试名照抄）：
  - `隐藏时 play 只记 pending，切回补放恰好一次`：`play('work-done')` → `show` 调 0 次；触发可见性回调 → `show` 与 `playSound` 各 1 次，phase 为 `'work-done'`
  - `同一转换重复 play 只播一次`：隐藏下 `play('work-done')` 两次 → 可见后 `show` 1 次
  - `可见时立即播放且幂等`：可见下 `play('break-done')` 两次 → `show` 1 次、`playSound` 1 次
  - `pending 后到覆盖先到`：隐藏下 `play('work-done')`、`play('break-done')` → 可见后 `show` 1 次且 phase 为 `'break-done'`
  - `dismiss 后新转换可再播`：可见下 `play` → `dismiss()` → `play` 同 phase → `show` 共 2 次
  - `非法 phase 抛错`
- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/celebration.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `js/celebration.js`**（pending/幂等状态机 + 默认 DOM/Web Audio 占位实现；文案用固定表：`work-done` 大字 `该休息了`，`break-done` 大字 `该开工了`）
- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/celebration.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add js/celebration.js tests/celebration.test.js
git commit -m "feat: 动画接缝 celebration.js（play/dismiss 冻结接口、pending 幂等、占位演出与提示音）"
```

### Task 4: 通知 `js/notify.js`

**Files:**
- Create: `js/notify.js`

**Interfaces (Produces):**
- `createNotifier({ NotificationImpl = globalThis.Notification } = {}) -> { permissionStatus(), requestPermission(), notify({ title, body }) }`
  - `permissionStatus() -> 'granted'|'denied'|'default'|'unsupported'`（`NotificationImpl` 缺失 → `'unsupported'`）
  - `requestPermission() -> Promise<状态>`：内部记录"已请求过"，**重复调用不再触发系统权限弹框**，直接返回当前状态；非 `'default'` 同样直接返回
  - `notify({ title, body }) -> boolean`：状态非 `'granted'` 或构造 `NotificationImpl` 抛错 → `false`；成功弹出 → `true`
- （spec §7：通知不写自动化测试，手工验收见 Task 6）

- [ ] **Step 1: 写 `js/notify.js`**（按 Interfaces；不碰 DOM，不导入其他模块）
- [ ] **Step 2: smoke 验证一次性请求与降级**

Run:
```bash
node --input-type=module -e "
import { createNotifier } from './js/notify.js';
let calls = 0;
const Fake = class { constructor() {} };
Fake.requestPermission = async () => { calls++; return 'denied' };
const n = createNotifier({ NotificationImpl: Fake });
await n.requestPermission(); await n.requestPermission();
console.log(n.permissionStatus(), n.notify({title:'x'}), calls);
"
```
Expected: 输出 `denied false 1`（请求只发生一次、拒绝后 `notify` 返回 false）

- [ ] **Step 3: 提交**

```bash
git add js/notify.js
git commit -m "feat: 通知权限与降级 notify.js（只请求一次、被拒不重弹）"
```

### Task 5: 页面骨架 `index.html` + `style.css`

**Files:**
- Create: `index.html`
- Create: `style.css`

**Interfaces (Produces):** `app.js`（Task 6）依赖的 DOM 锚点，id 一个不能差：
- 设置区：`#work-input`（`type=number`，`min=1 max=180 step=1`）、`#short-adj-input`、`#long-adj-input`（`type=number`，`min=-5 max=5 step=1`）、`#break-preview`
- 计时区：`#phase-label`、`#time`、`#round-dots`（内含 4 个 `<span class="dot">`）
- 按钮：`#start-btn`、`#pause-btn`、`#reset-btn`
- 页脚：`#today-count`、`#today-time`
- 提示：`#notify-hint`、`#storage-warning`（默认 `hidden`）
- 引入：`<script type="module" src="js/app.js">`

- [ ] **Step 1: 写 `index.html` 与 `style.css`**（布局 B 极简数字派：巨大倒计时数字居中、四点轮次在其下、设置一行、按钮一行、页脚一行今日数据；`#time` 用大号等宽数字；`.dot.is-done` 表示本轮已完成，样式自定但对比清晰；全站无外部字体/CDN）
- [ ] **Step 2: 本地起服务手工核对布局**

Run: `python3 -m http.server 8000`，浏览器开 `http://localhost:8000`
Expected: 上列 id 全部存在（可开 DevTools 检查）；窗口宽度 1280px 与 800px 下倒计时数字不换行不溢出

- [ ] **Step 3: 提交**

```bash
git add index.html style.css
git commit -m "feat: 页面骨架与布局 B 样式（巨大倒计时、四点轮次、页脚今日数据）"
```

### Task 6: 组装 `js/app.js` 与到点行为链

**Files:**
- Create: `js/app.js`
- Modify: `index.html`（仅当锚点与实际取用不符时）

**Interfaces (Consumes):**
- Task 1：`createTimer({ settings, now })`、`sanitizeSettings`、`effectiveDurations`、`Event` 三型
- Task 2：`createStorage({ backend })`、`dayKey`
- Task 3：`createCelebration({ isVisible, watchVisibility, getRemainingMs, show, playSound })`（`show`/`playSound` 用其默认实现即可不传；`isVisible = () => document.visibilityState === 'visible'`，`watchVisibility` 注册 `visibilitychange`，`getRemainingMs = () => timer.remainingMs()`）
- Task 4：`createNotifier()`

**组装规则（实现者不可自行决定）：**
- 启动：`storage.load()` → `timer` 用加载的 settings → 渲染全部区块；`#storage-warning` 依 `storage.isPersistent` 显隐
- tick 循环：`setInterval(tick, 250)` + `visibilitychange`/`focus` 事件触发同一 `tick()`；`tick()` 取 `timer.tick()` 事件数组并渲染
- 事件处理（实时与补记同一路径）：
  - `'work-done'` → `storage.recordPomodoro({ completedAt, workMs })` + 更新页脚 + `notify({title: '番茄完成 🍅', body: '该休息了：{短休|长休} {duration}。'})`（短休/长休与 duration 取随后 `'break-started'` 事件）+ `celebration.play('work-done')`
  - `'break-done'` → `notify({title: '休息结束', body: '该开工了：点“开始下一个番茄”。'})` + `celebration.play('break-done')`
- 设置：三个输入框 `change` 时 `timer.setSettings(...)` + `storage.saveSettings(...)` + 重渲染 `#break-preview`（用 `effectiveDurations` + `formatDuration`）；**非 ready 态输入框 `disabled`**（每次渲染同步）
- 通知权限：`#start-btn` 点击（用户手势）内调 `requestPermission()`，仅首次真正请求；`permissionStatus()` 为 `'denied'`/`'unsupported'` → 显示 `#notify-hint`；被拒/不支持时其余功能完全不受影响
- 按钮态：按文案表渲染；`#start-btn` 仅 ready 可点（文案：ready 且 `completedInRound > 0` 或今日番茄数 > 0 → `开始下一个番茄`，否则 `开始番茄`），`#pause-btn` 仅 working/paused 可点
- 四点：`completedInRound` 点亮 `.dot.is-done`
- 页面关闭不落盘（不写 `beforeunload`）——进行中番茄自然作废

- [ ] **Step 1: 写 `js/app.js`**（按组装规则；`formatDuration`/`formatClock` 用固定表的规则）
- [ ] **Step 2: 全量回归**

Run: `node --test`
Expected: 3 个测试文件全绿（timer/storage/celebration 共 ≥20 用例，0 fail）

- [ ] **Step 3: 手工验收（逐条打勾，= brief Success Criteria + 错误表）**
  1. `python3 -m http.server 8000` 起服务，允许通知；开 2 分钟工作时长实测
  2. 前台到点：系统通知 + 遮罩演出 + 提示音各一次；自动转入休息倒计时
  3. **后台到点**：切到别的标签页/窗口等到点 → 系统通知送达（Success Criteria 硬性项）
  4. **睡眠唤醒**：工作中睡眠或把系统时间临时拨快，唤醒 → 补记入账 + 通知 + 切回补放**恰好一次**；休息到点后**停在"开始下一个番茄"不自动开工**
  5. **数据可信**：关掉浏览器重开 → 今日番茄数/总时长零丢失，回 READY，进行中番茄作废（Success Criteria 硬性项）；今日总时长 = 番茄数 × 工作时长
  6. **通知被拒**：浏览器设置里拒绝通知 → 不重弹权限框、`#notify-hint` 出现、计时/动画/统计照常
  7. **存储不可用**：隐私窗口实测 → `#storage-warning` 出现、功能照常
  8. **设置边界**：`workMin` 填 0/181/小数、adj 填 ±99 → 钳制生效；工作/休息中输入框禁用
  9. 跨午夜（可临时拨时间）：23:59 前完成的番茄记在当天
- [ ] **Step 4: 记录决策进 memlog**

```bash
uv run ./_bmad/scripts/memlog.py append --workspace "_bmad-output/initiative-tomatoclock/brief-tomato-clock" --type decision --text "实施计划获批并执行：celebration 接口落实为 createCelebration(deps)->{play,dismiss}（可注入假可见性）；有效休息时长下限 1 分钟；入账 completedAt=deadline 口径；部署=GitHub Pages。"
```

- [ ] **Step 5: 提交**

```bash
git add js/app.js index.html
git commit -m "feat: app.js 组装与到点行为链（事件入账、通知、补放、设置闸门、今日统计）"
```

### Task 7: 部署（已定：GitHub Pages）

- [ ] **Step 1**：建 GitHub 仓库并推送，Settings → Pages 选 `main` 根目录 → 拿到 `https://<user>.github.io/<repo>`（推送方式若需鉴权，与用户当场确认凭证）
- [ ] **Step 2: 线上验收**：线上地址允许通知 → 重跑 Task 6 Step 3 的第 3、5、6 条（后台通知、数据持久、拒绝权限）——静态托管必须是 HTTPS（两者都满足）
- [ ] **Step 3: 提交（如产生部署配置文件）**

```bash
git add -A && git commit -m "docs: 部署信息记录"
```

## Self-Review 结论（写完自查）

1. **Spec 覆盖**：§2 文件结构 → 各任务 Files + Global Constraints；§3 七条转换规则 → Task 1（规则 1–7：start/归零入账/暂停/重置/补记一格/关页不落盘为不作为）；§4 存储 → Task 2；§5 行为链 + 接缝 → Task 3 + Task 6；§6 错误表四行 → Task 4（拒权）、Task 2（存储不可用）、Task 3（AudioContext 在 show 时 resume）、关页（不作为）；§7 测试策略 → 各测试任务 + Task 6 手工验收。无缺口。
2. **Step 扫描**：无 TBD；每个测试步给了名字与断言值，每个实现步给了签名与语义决定，验证步给了命令与期望输出。
3. **类型一致性**：`createTimer/createStorage/createNotifier/createCelebration` 的签名在 Produces 与 Consumes 两处逐字一致；`Event` 三型一致；`{ key, day }` 返回形状一致。
4. **Review Focus**：5 条各钉到具体测试或手工步（见上）。
5. **比例**：计划 ≈ spec 的 2 倍长度；代码块仅为签名、测试名与断言值，无函数体。
