# TomatoClock v1 分析与完善交接（给下一个 AI）

- **日期**：2026-10-06 · **状态**：v1 已实现、已上线、27/27 测试绿
- **线上**：`https://hufusudo.github.io/tomatoclock/`（GitHub Pages，push `main` 即发布）
- **仓库**：`https://github.com/hufusudo/tomatoclock`（本地根：`/home/hf/项目/TomatoClock`）
- **你的任务**：按 §5 的优先级**完善**它。动手前必读 §3 约束（破坏了就违背产品公理）与 §6 范围外清单（别顺手加功能）。

## 1. 项目速览

自用网页番茄钟：只填工作时长，短休（÷5）与长休（×0.6）自动推算、各 ±5 分钟微调；一轮 4 个番茄后长休；到点以**系统通知**为主提醒（用户专注时在用 AI，几乎不在本页面），切回页面补放动画彩蛋（恰好一次、幂等）。数据只存 localStorage，按自然日分桶；进行中番茄随页面关闭作废；休息结束不自动开工（手动闸门防统计造假）。

三条设计公理（来自 brief，任何改动不得违背）：
1. **休息不是商量出来的，是算出来的**——只有一个输入框；±5 微调是唯一活口，且有效休息有 1 分钟下限（堵死"借微调取消休息"）
2. **提醒必须追着人走**——通知是主角，动画/声音是配角
3. **工具不越界**——无账号、无云端、无强制锁页，"只叫醒，不押送"

## 2. 代码地图

```
index.html          页面骨架，DOM id 是与 app.js 的契约（改 id 必须两边同步）
style.css           布局 B（极简数字派）：巨大倒计时 + 四点轮次 + 页脚今日数据
js/timer.js         纯计时状态机（139 行）：不碰 DOM/storage，时间只经注入 now()
js/storage.js       localStorage（157 行）：单键 tomatoclock:v1、本地日期分桶、损坏容错、内存兜底
js/notify.js        通知权限（48 行）：只请求一次、被拒不重弹、恒 resolve 不外溢异常
js/celebration.js   动画接缝（165 行）：play/dismiss 冻结接口 + pending 幂等 + 占位演出 ★你要替换的部分
js/app.js           组装（223 行）：tick 循环、事件分发、渲染、设置闸门
tests/              node --test 零依赖，27 用例（timer 11 / storage 8 / celebration 8）
```

**状态机**（timer.js，四态一环）：`READY → WORKING(可暂停) → BREAK(短/长) → READY`。
关键语义（都有测试钉死）：
- 判定只用 `deadline - now()`，**不逐秒计数**（切页/睡眠不丢时）
- `tick()` **至多走一格**（新段 deadline = now + durationMs），杜绝唤醒后连锁空转刷时长
- 入账 `completedAt = 该段 deadline`（实时与补记同口径，跨午夜分桶稳定）
- `reset()` 只弃当前段，不回滚轮次与今日统计
- 第 4 个番茄归零 → 长休（`durationMs = workMs*0.6 + longAdj`），轮次计数归 0

**到点行为链**（app.js `handleEvents`，实时与补记同路径）：
`work-done → storage.recordPomodoro → 页脚 → notify → celebration.play('work-done')`；
`break-done → notify → celebration.play('break-done')`，然后**停在 READY 等手动开始**。

**存储 schema**（单键 `tomatoclock:v1`）：
```json
{ "days": { "2026-10-06": { "pomodoros": 2, "studySeconds": 6000 } },
  "settings": { "workMin": 50, "shortAdj": 0, "longAdj": 0 } }
```
派生值不落盘：短休 = `workMin/5 + shortAdj`，长休 = `workMin*0.6 + longAdj`，钳 ±5 分钟、下限 1 分钟；`workMin` 整数 1–180，仅 READY 态可改。**写入时机只有两处**：工作段归零入账、用户改设置。

## 3. 不可破坏的约束（先读这个再动手）

1. **零构建零依赖**：不加 package.json、node_modules、CDN、框架、外部字体。Node ≥ 22.7 靠 ESM 语法自动探测跑 `node --test`（已实测 v26）；若被迫加 `{"type":"module"}` 之外的任何配置，先说明理由。
2. **`celebration.js` 接口冻结**：`createCelebration(deps) → { play(phase), dismiss() }`，`phase ∈ 'work-done' | 'break-done'`。除该文件外任何模块不得感知演出细节。**pending/幂等语义必须保留**（隐藏时只记 pending、后到覆盖先到、补放恰好一次、playing 时重复 play 忽略、dismiss 后可再播）——`tests/celebration.test.js` 8 条是你的回归网，一条都不许删。
3. **`timer.js` 纯逻辑**：不碰 DOM/storage；测试与 app 依赖注入的 `now()`。
4. **手动闸门**：休息结束绝不自动开工（防"不在场的学习时长"）。
5. **进行中番茄不落盘**：无 `beforeunload`，关页即作废。
6. **通知权限只请求一次**（用户手势内）；被拒/不支持永不重弹，且其余功能完全不受影响。
7. **固定文案**在计划文件的 Global Constraints 文案表（通知/按钮/页脚/提示行全文），改文案=改需求，先过用户。
8. **决策留痕**：重要决策追加进 memlog：
   `uv run ./_bmad/scripts/memlog.py append --workspace "_bmad-output/initiative-tomatoclock/brief-tomato-clock" --type decision --text "..."`

## 4. 工作方式与验证

```bash
node --test                    # 全量 27 用例，必须全绿；改完至少跑三种时区：
TZ=UTC node --test && TZ=America/New_York node --test
python3 -m http.server 8000    # 本地预览（通知/动画需真实浏览器手工验）
git push origin main           # 即发布 GitHub Pages（HTTPS 需 PAT 或 SSH 密钥）
```

- 文档权威顺序：**spec**（`docs/superpowers/specs/2026-10-06-tomatoclock-design.md`，最终权威）> **计划**（`docs/superpowers/plans/2026-10-06-tomatoclock.md`，含文案表、接口签名、裁定史）> **brief**（`_bmad-output/.../brief-tomato-clock.md`，范围边界与验收标准）。
- 提交信息前缀 `feat:` / `fix:` / `docs:` / `test:`。
- 浏览器行为（后台通知、AudioContext 自动播放策略、节流）无法自动化——写 /tmp 假 DOM harness 冒烟（不入库）+ 给用户手工验收清单，这是本仓库既定惯例。

## 5. 待完善清单（按优先级）

### A 类（约定好的正主）：替换 `celebration.js` 内部实现

背景：v1 的演出是**故意做丑的占位**（全屏遮罩 + 大字 + MM:SS 倒计时 + Web Audio 三声 + 点任意处关闭），按产品决策留给后续 AI 做成真正的"全屏演出派"动画。

替换契约（`js/celebration.js:121` 注释为准）：
- 只换**内部实现**，冻结接口、deps 五成员（`isVisible`/`watchVisibility`/`getRemainingMs`/`show`/`playSound`，全可选）与 pending/幂等语义不变
- **实现方须经 `onClose` 汇报关闭**，`dismiss()` 才能关掉注入的演出（这条坑别踩）
- 模块 import 时不得触碰 `document`/`AudioContext`（默认实例惰性创建；否则 Node 测试 import 即炸）
- 固定大字文案：`work-done → 该休息了`，`break-done → 该开工了`
- 可用技术：CSS 动画 / Web Animations API / Canvas / Web Audio 合成——**零依赖原生**，不许引库
- 验收：8 条既有测试全绿 + 视觉/声音手工验收（演出不强制锁页，点任意处可退）

### B 类（最终审阅留下的可留项，半天量级，可零碎修）

按"改一处、跑一次 `node --test`、单独提交"的节奏做：

1. `js/timer.js` `sanitizeSettings`：`false`/`[]` 经 `Number()` 归 0 再钳 1（`''`/null 已修）。建议：非 string/number 一律走 fallback。
2. `tests/timer.test.js` 测试缺口：ready 态 `setSettings` 合法路径、break 态 `reset()` 各补一条。
3. `js/storage.js` 探测边角：无 `removeItem` 的假 backend 上探测写 `''` 会残留；`dayKey(NaN)` 得 `'NaN-NaN-NaN'` 仍入桶。建议：探测失败路径补还原、`recordPomodoro` 拒绝非有限 `completedAt`。
4. `js/celebration.js` 占位音效：`startAt` 在 `resume()` 完成前就算好，AudioContext 恢复延迟 >50ms 时三声挤压——把排程挂进 `resume().then()`（若 A 类做了，这条自然消失）。
5. `js/celebration.js` 占位细节无入库测试：固定文案、`role="dialog"`、逐秒刷新、点击关闭、`getRemainingMs()` 返回 `NaN` 显示 `NaN:NaN`；两条边缘无测试（隐藏 pending 时 `dismiss()` 保留 pending；playing 中隐藏再 `play` 被忽略——行为符合语义，缺测试）。
6. `js/notify.js`：`notify({title,body}={})` 默认参数比签名宽容（`notify()` 会弹 undefined 标题）；非函数注入归 `'unsupported'` 无测试。
7. `js/app.js`：① footer 的 `aria-label` 整句与可见文本重复（读屏双播），改短 landmark 名即可；② 运行期 storage 降级（写失败切内存）后 UI 不补显"数据不会保存"警告（只在启动查一次 `isPersistent`）；③ 已知精度边缘：隐藏页单次定时器若在无事件窗口触发会被丢弃，退化回 250ms 轮询（interval 兜底，最坏晚 ≤250ms，可不修）。
8. 观感项：`style.css` 的 `--accent-fg` 死变量；`#time` 的 `letter-spacing` 无 `text-indent` 补偿（`#phase-label` 有，不对称）；`#notify-hint`/`#storage-warning` 长句居中可读性差；`#break-preview` 独占一行（800px 下同行必换行，可保留现状）。

### C 类（别自作主张）

范围外清单（想做必须先让用户改 brief/spec）：任务清单/TODO、历史统计报表、账号云同步、Web Push 关页提醒、强制锁页、睡眠补休、半截番茄计时、移动端专门适配。
brief 的 Vision 节留了远期方向（周/月番茄曲线、疲劳时段热力图、个性化节奏建议）——**都是 v2+ 的事**。

## 6. 已知限制（spec §9，别当 bug 修）

- 关闭标签页 = 计时与提醒全部终止（既定边界）
- 隐藏标签页的定时器被浏览器节流，后台到点提醒可能**延迟约 1 分钟**（零构建无 service worker；app.js 有 deadline 对齐单次定时器缓解）
- localStorage 运行期写失败（配额满）自动切内存后端继续运行，本次数据不保存
- 系统时间被手动修改会导致判定错乱（YAGNI，不防护）
- 依赖浏览器 ES modules 与 Notification API（现代浏览器均满足）

## 7. 验收清单（v1 遗留，接手后建议先跑一遍）

线上 `https://hufusudo.github.io/tomatoclock/`（工作时长填 2 分钟实测）：
1. 前台到点：系统通知 + 全屏演出 + 提示音各一次，自动进休息
2. **后台到点**（切走标签页）：系统通知送达（brief 硬性项；允许延迟约 1 分钟）
3. 睡眠/拨快时间唤醒：补记入账 + 通知 + 切回补放**恰好一次**；休息结束停在「开始下一个番茄」不自动开工
4. 关浏览器重开：今日番茄数/总时长**零丢失**（硬性项），进行中番茄作废
5. 拒绝通知权限：不重弹、提示行出现、其余照常
6. 隐私窗口：「本次数据不会保存」横幅 + 功能照常
7. 设置边界：workMin 填 0/181/清空/小数 → 钳制并回填输入框；工作/休息中输入框禁用
8. 布局：1280px / 800px 下倒计时数字不换行不溢出

## 8. 起手式（给下一个 AI 的建议顺序）

1. 读本文 → 读 spec → `node --test` 确认 27/27 绿
2. 挑 A 类（动画替换）或 B 类零碎项开工；每完成一项跑全量测试 + 单独提交 + memlog 留痕
3. 交付时给用户一份手工验收清单（§7 的子集），浏览器行为必须真人确认
