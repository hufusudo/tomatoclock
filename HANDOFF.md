# HANDOFF — TomatoClock 开工交接文档

> **新会话请从这里开始。** 本文是唯一入口，按 §7 的顺序执行即可无缝续上。
> 最后更新：2026-10-06 · 仓库根：`/home/hf/项目/TomatoClock`
> **⚠️ 状态快照：v1 已实现并部署上线（2026-10-06）**，§6/§7 的流程门禁与操作清单仅作历史记录；后续工作（真实动画接续给其他 AI、人工验收遗留项）见 §2 与 memlog。
> **👉 下一个 AI 做“完善”工作请读 `docs/analysis.md`（分析与待完善清单，含动画替换契约）**

## 1. 项目一句话

自用网页番茄钟：只填工作时长，短休（÷5）与长休（×0.6，各 ±5 微调）自动推算，到点以**系统通知**为主路径提醒——因为用户专注时在用 AI，几乎不停留在本页面。数据只存 localStorage，无账号无云端。

## 2. 当前状态

| 项 | 状态 |
|---|---|
| 产品 brief | ✅ `status: final`（16+ 条决策全在 `.memlog.md`） |
| 设计 spec | ✅ 已写盘、自审 4 处修复、**用户已过目未提修改**（2026-10-06）；若新会话发现要改，先改 spec 再动代码 |
| 实施计划 | ✅ `docs/superpowers/plans/2026-10-06-tomatoclock.md`（subagent-driven 执行完毕，含最终审阅与修复波） |
| 产品代码 | ✅ 已完成并部署：`index.html`+`style.css`+`js/`5 模块+`tests/`27 用例；线上 `https://hufusudo.github.io/tomatoclock/`（GitHub Pages） |
| git | ✅ `main` = `b9116d0`（已推 GitHub `hufusudo/tomatoclock`）；feature 分支已合并删除 |

## 3. 关键文件路径（均相对仓库根）

| 文件 | 作用 |
|---|---|
| `docs/superpowers/specs/2026-10-06-tomatoclock-design.md` | **设计 spec——实现照它抄**：状态机 7 条规则、存储 schema、接缝契约、错误处理表、测试策略 |
| `_bmad-output/initiative-tomatoclock/brief-tomato-clock/brief-tomato-clock.md` | 产品 brief（final）：问题、范围边界、Success Criteria（= 验收清单） |
| `.../brief-tomato-clock/addendum.md` | 研究速览、6 条被否决备选、行为链推演、技术提示 |
| `.../brief-tomato-clock/.memlog.md` | 23 条决策/事件审计——**新会话的重要决策继续用它追加**（见 §7 第 4 步） |
| `.superpowers/brainstorm/` | 可视化脑暴的布局样稿（已 gitignore，供回看） |

## 4. 不可动摇的核心决策（速查，详情看 spec）

1. **公式**：短休 = 工作 ÷ 5，长休 = 工作 × 0.6，微调钳制 ±5 分钟；`workMin` 整数 1–180，**仅 READY 态可改**
2. **一轮 4 个番茄**后进长休；进行中番茄随页面关闭**作废**（不计数不计时）；今日总时长 = 已完成番茄数 × 工作时长
3. **提醒主路径 = 系统通知**（首次用户手势内请求权限，被拒不重弹）；动画是切回页面后的补放彩蛋（恰好一次，幂等）
4. **休息结束不自动开工**（防统计造假），必须手动点"开始下一个番茄"
5. **技术栈**：零构建原生 ES modules——`index.html` + `style.css` + `js/{timer,storage,notify,celebration,app}.js`；`timer.js` 纯逻辑不碰 DOM
6. **动画接缝**：`celebration.js` 只暴露 `play(phase)` / `dismiss()` + 朴素占位实现——**项目完成后由其他 AI 替换内部实现，接口冻结**
7. **布局 B（极简数字派）**：巨大倒计时数字 + 四点轮次 + 页脚一行今日数据
8. **范围外（不许顺手加）**：任务清单、统计报表、账号云同步、Web Push 关页提醒、强制锁页、睡眠补休、半截番茄计时、移动端适配

## 5. 环境事实

- Node v26（`node --test` 零依赖跑测试）、Python 3.14 + uv（BMad 脚本）、git 已装
- **部署**：免费静态托管，GitHub Pages 与 Netlify 二选一未拍板——取决于用户有无 GitHub 账号，**实施计划阶段问一句再定**
- BMad 已初始化（`_bmad/`）；`bmad-prd`/`bmad-architecture`/`bmad-review` 等技能**未安装**（本项目体量不需要）

## 6. 流程门禁（brainstorming HARD-GATE 的状态）

- ✅ architectural 路径的三道门已过：逐节设计批准 → spec 落盘 → 用户审阅（转向交接）
- ✅ **下一个且唯一的允许步骤 = `writing-plans` 技能**（brainstorming 的终态规定，不得跳去 TDD/build 等其他实现技能）
- 计划获批后 → 按计划执行（`executing-plans` 或 `subagent-driven-development`，实现阶段配 `test-driven-development`）
- 未过批准门之前，**不写任何产品代码、不装产品依赖、不建外部项目**

## 7. 新会话操作清单（按序）

1. 读本文 → 读 spec（§3 表格顺序）
2. `git log --oneline` 核对 HEAD；若用户对 spec 有新要求，先改 spec 并说明，再继续
3. 调用 **`writing-plans`** 技能，基于 spec 出实施计划，交用户批准
4. 实施中每条重要决策追加进 memlog：
   `uv run ./_bmad/scripts/memlog.py append --workspace "_bmad-output/initiative-tomatoclock/brief-tomato-clock" --type decision --text "..."`
5. 完成后用 brief 的 **Success Criteria 当验收清单**（含手工验收：后台通知送达、关闭重开数据不丢）
