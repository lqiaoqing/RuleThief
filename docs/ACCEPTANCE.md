# 验收矩阵（设计文档 → 证据）

日期：2026-10-26
用途：把设计文档与可行性分析的验收条款逐条映射到可复现的命令与结果。标记为「自动」的项均由脚本验证；标记为「人工」的项需要真人或真机。

## A. 设计文档功能清单

| 要求 | 状态 | 证据 |
| --- | --- | --- |
| 基础魔弹自动锁最近目标 | 自动 | 冒烟「room 1 spawns enemies」+ 战斗截图 |
| 3 条弹道规则 × 3 条命中规则 = 9 组合 | 自动 | `rules.test.ts` 19 项；冒烟「all 9 rule combos still render their names」 |
| 规则 Lv.1–3，升级改变目标数/跳数/弹数/半径/时长 | 自动 | `rules.test.ts` 等级断言；HUD 截图 |
| 装备 / 升级 / 替换，替换重置 Lv.1 | 自动 | `rules.test.ts` + 冒烟精英/普通房奖励 |
| 单次攻击最多 3 次命中规则；爆炸与 DOT 不再触发 | 自动 | 冒烟「single volley never exceeds the 3-impact budget」（3 proc / 7 次爆炸伤害）、「burn DOT keeps dealing damage without new impact procs」（0 新 proc） |
| 弹射不重复选取已命中目标 | 自动 | `rules.test.ts` `selectChainTargets` 去重 |
| 冰霜减速有上限 | 自动 | `rules.test.ts` `mergeFrost` 0.8 上限 |
| 6 种敌人，各自携带一条规则 | 自动 | `rooms.test.ts` 敌人→规则 1:1；冒烟各敌人可生成 |
| 2 个精英（双冲锋 / 三连雷击） | 自动 | 冒烟「elite room N spawns its elite leader」；截图 |
| 3 条突变，每局最多 1 条 | 自动 | `mutations.test.ts` 12 项；冒烟精英房突变卡数量断言 |
| 4 种随机事件，每局 2 种 | 自动 | `run.test.ts` 事件数量/唯一性；冒烟「run visited two events」「visited events are distinct」 |
| 跨房修饰只影响下一房 | 自动 | 冒烟「event speed modifier applies to the next room only」+「room N has no leftover speed modifier」 |
| 诅咒宝箱：额外精英 + 额外奖励 | 自动 | 冒烟「curse chest adds an extra elite」 |
| 三阶段 BOSS（70% / 35%） | 自动 | 冒烟 phase 1/2/3 断言 + BOSS 血条截图 |
| 第三阶段规则封印 4 秒、可躲、自动恢复 | 自动 | 冒烟「phase 3 telegraphs and seals a rule」+ 截图 |
| BOSS 召唤物正确清理 | 自动 | `onBossDefeated` 清场；冒烟击杀后结算 |
| 房间预览敌人类型 | 自动 | 冒烟「boss preview lists the arbiter」「room N preview lists enemies」 |
| 清场三选一 / 精英四选一 | 自动 | 冒烟「room N opens rewards」「elite room N offers four rewards」 |
| 规则奖励来自本房敌人 | 自动 | `rooms.test.ts` + M2 报告 |
| 切房清弹幕、保留构筑 | 自动 | 冒烟「switching rooms clears bolts, enemies, hazards and slow」 |
| 死亡 / 胜利 / 重开 | 自动 | 冒烟 defeat 0/13、victory 13/13、restart 重置 |
| 暂停 / 失焦 / 切后台 | 自动 | 冒烟「window blur pauses」「backgrounding the tab pauses」 |
| 双端操作（摇杆 / 闪避按钮 / 键鼠） | 自动 | 冒烟移动与闪避（桌面 + 手机视口） |
| 音频（合成音效、解锁、静音） | 自动 | 冒烟静音按钮 + `__RT_AUDIO_STATE__.state === running` |
| 本地记录（最近 20 局） | 自动 | `telemetry.test.ts` 7 项 + 冒烟 localStorage 断言 |

## B. 可行性分析 §7 验收清单

| 类别 | 验收项 | 状态 | 证据 |
| --- | --- | --- | --- |
| 组合 | 贯穿+爆裂不递归 | 自动 | 冒烟单次齐射 3 proc / 7 次爆炸伤害 |
| 组合 | 弹射+燃烧 DOT 不触发弹射 | 自动 | 冒烟 DOT 0 新 proc 且持续掉血 |
| 组合 | 散射+冰霜方向正确、不无限减速 | 自动 | `rules.test.ts` 角度对称 + 减速上限 |
| 规则 | 9 组合生效、等级、替换、满级 | 自动 | `rules.test.ts` + 冒烟 |
| 房间 | 13 步 / 18 节点；敌人预览；清场结算；切房清弹幕；图鉴跟随房间 | 自动 | `run.test.ts`；冒烟逐房检查 `room preview lists its enemies`、`switching rooms clears bolts, enemies, hazards and slow` |
| 奖励 | 三选一；规则来自本房；前两房保底弹道+命中；基础强化 | 自动 | `run.test.ts`「guarantees a trajectory then an impact rule」；冒烟 `room N offers three cards` / `elite room N offers four cards and a guaranteed mutation` |
| 事件 | 4 种；每局 2 种；跨房修饰正确清除 | 自动 | `run.test.ts` + 冒烟 |
| 突变 | 3 种；每局最多 1；精英保底 | 自动 | `mutations.test.ts`；冒烟 `elite room N spawns its leader immediately` + 突变卡数量 |
| BOSS | 3 阶段阈值；封印 4s 可躲可恢复；召唤物清理 | 自动 | 冒烟：phase 2 召唤 3 个杂兵、击杀 BOSS 后场上归零；封印预警截图 |
| 状态 | 死亡/暂停/失焦/切后台/重开；无旧弹幕/旧状态 | 自动 | 冒烟 blur / visibilitychange / 切房清理 / 重开 |
| 体验 | 预警可读；受击来源清楚；构筑面板常驻；结算显示构筑 | 自动 + 截图 | 受击方向弧、结算「承伤构成」百分比、组合+突变行、截图 |
| 体验 | 死亡归因可量化 | 自动 | 按 6 类来源（接触/冲锋/敌弹/火焰/自爆/其他）累计承伤，写入结算与 localStorage |
| 体验 | 随时查看本局构筑与进度 | 自动 | 暂停页显示组合/等级/突变/步数/用时/击杀/生命（冒烟断言） |
| 体验 | 新手理解操作目标与预警 | 自动 + 截图 | 首启「训练须知」三条要点，冒烟验证显示/记忆 |
| 移动 | 安全区；横竖屏；音频解锁 | 自动 | 冒烟 390×844 / 844×390 无溢出；音频 running |
| 移动 | 摇杆 / 闪避按钮 / 多点触控 | 自动 | 冒烟：摇杆拖拽移动、按钮闪避、CDP 双触点同时移动+闪避 |
| 平衡 | 9 组合强度基准 | 自动 | `combo-bench.mjs`：爆裂 99–138 / 燃烧 40–88 / 冰霜 26–73（聚怪木桩） |
| 移动 | 低端机性能 | 自动近似 | Chrome CPU ×4 55.7fps / ×6 41.0fps（30 敌人）；真机仍需确认 |
| 工程 | 单测/构建/静态部署/无 console error | 自动 | 见下 |

## C. 当前自动化结果（2026-10-26）

```text
npm test                       83/83 通过
npm run build                  dist 1.31MB JS（gzip 353KB）+ 51KB CSS
npm run verify                 31/31 通过（资源与服务）
npm run smoke                 143/143 通过，无 console/page error
scripts/stress.mjs             40 敌人 / 45 发敌弹：57fps（最低 57）
scripts/lowend.mjs             CPU ×1/×4/×6：59.7 / 55.7 / 41.0 fps（30 敌人）
scripts/autoplay.mjs           9/13，6:00，102 杀（机器人只做风筝走位）
scripts/combo-bench.mjs        9 组合 DPS 基准（2 次采样 × 5 秒）
```

- 单测文件：`rules` 19、`rooms` 23、`mutations` 12、`run` 13、`tuning` 6、`telemetry` 7、`theme` 3。
- 冒烟覆盖 13 步完整流程（10 场战斗 + 2 事件 + BOSS）、5 个分支、精英房、突变、封印、记录持久化、双端视口。

## D. 未完成项（需要外部条件）

| 项目 | 原因 | 当前状态 |
| --- | --- | --- |
| 5–10 人真人试玩 | 需要外部参与者 | 协议与导出方式已就绪（`docs/PLAYTEST.md`）；已用自动试玩做下限验证 |
| 真机手机验收 | 需要真实设备 | 未开始；仅模拟视口 |
| 低端机长时运行压测 | 需要真实设备跑满一局 | 仅完成 CPU 节流近似（×6 → 41fps） |
| 单局时长 15 分钟 | 内容体量 | 模型约 11.5 分钟，落在设计 10–20 分钟区间内 |

## E. 复现步骤

```bash
npm ci
npm test
npm run build
npm run preview -- --port 4177
BASE_URL=http://127.0.0.1:4177 npm run smoke
BASE_URL=http://127.0.0.1:4177 npm run verify
BASE_URL=http://127.0.0.1:4177 node scripts/stress.mjs
BASE_URL=http://127.0.0.1:4177 node scripts/autoplay.mjs   # 需要真实窗口，约 6–10 分钟
```

自动化脚本依赖本机 Chrome/Edge（`scripts/*.mjs` 会自动探测常见安装路径）。
