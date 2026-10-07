# TomatoClock 设计文档（Spec）

- **日期**：2026-10-06
- **状态**：待用户审阅
- **来源**：`_bmad-output/initiative-tomatoclock/brief-tomato-clock/brief-tomato-clock.md`（`status: final`）——产品意图、范围边界与成功标准以 brief 为准，本文只定义**如何实现**
- **路径类型**：architectural（brainstorming 技能判定），设计已经用户逐节批准（第 1 节：状态机与数据流；第 2 节：错误处理、接缝契约、测试）

## 1. 意图摘要（来自 brief，非本文新决定）

自用网页番茄钟。唯一输入是工作时长；短休 = 工作 ÷ 5、长休 = 工作 × 0.6，各允许 ±5 分钟微调；一轮 4 个番茄后进长休。用户专注时几乎不停留在本页面，因此**系统通知是主提醒路径**，页面动画是切回后的补放彩蛋。数据仅存本地（localStorage，按自然日分组），无账号无云端。进行中番茄随页面关闭作废。

## 2. 技术栈与文件结构（已批准：方案 C，零构建）

```
TomatoClock/
├── index.html          # 页面骨架 + <script type="module" src="js/app.js">
├── style.css           # 布局 B（极简数字派）的全部样式
├── js/
│   ├── timer.js        # 纯计时状态机：不碰 DOM、不碰 storage、不碰 Date 之外的全局
│   ├── storage.js      # localStorage 读写：按日分桶、设置持久化、容错
│   ├── notify.js       # 通知权限请求（仅一次）+ 弹通知 + 降级分支
│   ├── celebration.js  # 动画接缝：play(phase) / dismiss() + 占位实现 + Web Audio 提示音
│   └── app.js          # UI 组装：读 DOM、把事件接到上面四个模块
├── tests/              # node --test，零依赖
│   ├── timer.test.js
│   ├── storage.test.js
│   └── celebration.test.js   # 触发幂等（假页面可见性）
└── docs/superpowers/specs/    # 本文档
```

浏览器原生 ES modules（`type="module"`），静态托管直接跑。**部署**：免费静态托管，实现时二选一（GitHub Pages 需 GitHub 账号；Netlify 可拖拽上传）——计划阶段确认，两者对设计无影响。

## 3. 状态机（已批准）

四个状态，一条环：

```
        ┌────────────── 手动「开始下一个番茄」 ──────────────┐
        ▼                                                   │
   ┌─────────┐  开始   ┌──────────┐  归零   ┌──────────┐    │
   │  READY  │ ──────▶ │ WORKING  │ ──────▶ │  BREAK   │──┐ │
   │ 待开始   │ ◀────── │ (可暂停) │         │短休/长休  │  │ │
   └─────────┘  重置    └──────────┘         │(自动倒数) │  │ │
        ▲                                    └──────────┘  │ │
        └────────────── 归零 ◀──────────────────────────────┘ │
              （休息结束 = 回到 READY）───────────────────────┘
```

**转换规则：**

| # | 触发 | 动作 |
|---|---|---|
| 1 | READY 点「开始」 | 进入 WORKING，记 `deadline = now + 有效工作时长`；同时（用户手势内）请求通知权限（仅首次） |
| 2 | WORKING 归零 | **立即入账**（见 §4），判定轮次：本轮第 4 个 → LONG_BREAK，否则 SHORT_BREAK；自动进入 BREAK 倒数；调用 `notify` 与 `celebration.play('work-done')` |
| 3 | WORKING 点「暂停」/「恢复」 | 暂停记 `remainingMs`；恢复时 `deadline = now + remainingMs`（不漂移） |
| 4 | 任意状态点「重置」 | 当前段回到段起点，**不回滚今日统计**；WORKING/BREAK 中重置 = 放弃本段（工作段未归零则不入账） |
| 5 | BREAK 归零 | 回到 READY，**不自动开始下一段**；调用 `notify` 与 `celebration.play('break-done')` 提示"该开工了" |
| 6 | 标签页隐藏 / 电脑睡眠 / 唤醒 | 判定只用 `deadline - now`。唤醒发现过期：WORKING → 补记一次并进 BREAK；BREAK → 停在 READY。两种补记都**走规则 2/5 的同一路径**（含通知与演出触发，§5 幂等机制兑底）。**补记最多走一格**（规则 5 的手动开始卡住链条，杜绝空转刷时长） |
| 7 | 页面被关闭 | 不落盘（进行中番茄本来就未写入），重开进 READY，今日统计保留 |

**手动开始（规则 5）是防造假闸门**：休息结束若人已离开，自动开工会凭空产生"不在场的学习时长"。

## 4. 数据与存储（已批准）

**localStorage 单键 `tomatoclock:v1`：**

```json
{
  "days": { "2026-10-06": { "pomodoros": 2, "studySeconds": 6000 } },
  "settings": { "workMin": 50, "shortAdj": 0, "longAdj": 0 }
}
```

- **派生值不落盘**：有效短休 = `workMin/5 + shortAdj`，有效长休 = `workMin*0.6 + longAdj`；`shortAdj`/`longAdj` 被钳制在 `[-5, +5]`（分钟，可为负）
- **输入边界**：`workMin` 为整数，钳制在 `[1, 180]` 分钟；**设置仅在 READY 状态可编辑**（WORKING/BREAK 中输入框禁用，避免中途改参重算截止时刻造成歧义）
- **写入时机仅两处**：① 工作段归零入账时（按**完成时刻**的本地日期分桶，跨午夜正确）；② 用户改设置时
- **读入时机**：页面加载；损坏 JSON → 丢弃重建（容错），不崩
- `storage.js` 通过注入的 storage 对象读写，测试时用内存假实现

## 5. 提醒行为链（已批准，brief 的 Solution 节为准）

1. 到点 → `notify` 弹系统通知（无论标签页前后台）+ `celebration.play(phase)`
2. 页面不可见时的 play 请求 → 记 pending，**切回页面时补放恰好一次**（幂等：同一转换只播一次）
3. 无视 → 不暂停、不惩罚；提示音与动画在补放时**合并为一次**（AudioContext 恢复后统一处理）

**动画接缝契约（`celebration.js`，留给其他 AI 替换内部实现）：**

```js
export function play(phase)   // phase: 'work-done' | 'break-done'
export function dismiss()     // 关闭演出
```

- 占位实现：全屏遮罩 + 大字提示 + 剩余休息倒计时 + Web Audio 合成提示音，点任意处关闭（一键可退，不违反 brief "不强制锁页"）
- 接口冻结：内部实现可整体替换；**除本文件外，任何模块不得感知演出细节**
- pending 与幂等判定由 `celebration.js` 内部持有，页面可见性以可注入的查询函数提供（测试时注入假实现）

## 6. 错误处理（已批准）

| 情况 | 处理 |
|---|---|
| 通知权限被拒 / 不支持 | 仅首次（用户手势内）请求一次；被拒 → 页面内提醒照常 + 设置旁一行手动开启指引；永不重复弹框 |
| localStorage 不可用 | 内存兜底，功能照常，顶部提示"本次数据不会保存" |
| AudioContext 被挂起 | 切回时恢复，与动画补放合并为一次 |
| 页面被关闭 | 计时终止（既定边界），重开 READY，统计保留 |
| 系统时间被手改 | 已知限制，不防护（YAGNI，自用工具） |

## 7. 测试策略（已批准）

- **`timer.test.js`**：转换全路径；暂停/恢复的截止时刻重算；唤醒补记**最多一格**；第 4 个番茄进长休；`±5` 钳制边界；重置不回滚统计
- **`storage.test.js`**：按完成时刻分桶、跨午夜、损坏 JSON 容错、设置读写
- **`celebration.test.js`**：同一转换只触发一次（注入假的页面可见性）
- **运行**：`node --test`（Node v26 已确认，零依赖）
- **UI / 通知**：不写自动化测试；以 brief 的 Success Criteria 作为手工验收清单

## 8. 范围外（详见 brief Scope 节）

任务清单、历史统计报表、账号/云同步、Web Push（关页提醒）、强制锁页、睡眠补休、半截番茄计时、移动端专门适配、真实动画演出（由其他 AI 接手 `celebration.js`）。

## 9. 已知限制

- 关闭标签页 = 计时与提醒全部终止（brief 既定边界）
- 系统时间被手动修改会导致判定错乱（不防护）
- 依赖浏览器对 ES modules 与 Notification API 的支持（现代浏览器均满足）
- 隐藏标签页的定时器被浏览器节流，后台到点提醒可能延迟约 1 分钟
- localStorage 运行期写失败（配额满等）自动切内存后端继续运行（isPersistent 置 false），入账/通知/演出不被打断，但该次数据不落盘
