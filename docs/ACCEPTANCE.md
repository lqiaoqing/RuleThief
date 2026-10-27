# 验收矩阵（设计文档 → 证据）

日期：2026-10-27（M9 收口版）
用途：把 M0–M9 的功能条款逐条映射到可复现的命令与结果。标记为「自动」的项由脚本验证；标记为「人工」的项需要真人或真机。

## A. 当前自动化结果

```text
npm test                       147/147 通过（13 个测试文件）
npm run build                  tsc + vite build 通过（dist 1.91MB）
npm run verify                 31/31 静态资源检查通过
npm run smoke                  226/226 通过（主流程固定 seed=5 + 9 项遗物/升阶效果 + 4 项后期强化 + 第三规则槽 + 每日修正 + 起点世界 + 导出 + 物品说明）
npm run fullrun                37/37 三章结构性全流程通过（约 63 秒，非真实时长）
npm run fullrun-start1         24/24 从第二世界起点跑到终点
npm run fullrun-start2         12/12 从第三世界起点跑到终点
scripts/stress.mjs             40 敌人 / 45 发敌弹：avg 59.6 / min 59 fps
scripts/lowend.mjs             CPU ×1/×4/×6：59.5 / 58.0 / 47.8 fps（min 44）
scripts/soak.mjs               8 分钟：监听器 +0、堆 8–34.7MB 随 GC 波动、60fps
scripts/combo-bench.mjs        9 组合 DPS：26–125（聚怪木桩）
scripts/combo-run.mjs          9 组合清第 1 房：39–46s，全部 13 杀（1 套剩 86HP）
```

性能与浸泡结果在 `docs/STATUS.md` 与脚本输出中维护；本轮 M9 构建的复测结果见 C 节末尾。

## B. 基础规则与战斗（M0–M5 回归）

| 要求 | 状态 | 证据 |
| --- | --- | --- |
| 基础魔弹自动锁最近目标 | 自动 | 冒烟「room 1 spawns enemies」+ 战斗截图 |
| 3 条弹道 × 3 条命中 = 9 组合 | 自动 | `rules.test.ts` 19 项；冒烟 9 组合名称 |
| 规则 Lv.1–3，升级改变目标数/跳数/弹数/半径/时长 | 自动 | `rules.test.ts` 等级断言；HUD 截图 |
| 装备 / 升级 / 替换，替换重置 Lv.1 | 自动 | `rules.test.ts` + 冒烟房间奖励 |
| 单次攻击最多 3 次命中规则；爆炸/DOT 不递归 | 自动 | 冒烟齐射 3 proc / 7 次爆炸；`TriggerBudget` 单测 |
| 弹射不重复目标、冰霜减速上限 | 自动 | `rules.test.ts` |
| 6 种基础敌人各带一条规则 | 自动 | `rooms.test.ts`；冒烟逐个生成 |
| 3 个精英（双冲锋 / 三连雷击 / 逆律先知） | 自动 | 冒烟前两者行为断言；先知生成与虚空领域由章节 3 冒烟覆盖 |
| 3 条突变，每局最多 1 条，精英保底 | 自动 | `mutations.test.ts` 12 项；冒烟突变卡数量 |
| 6 种随机事件，每局 2 种 | 自动 | `run.test.ts` 事件数量/唯一性；冒烟事件流程 |
| 跨房修饰只影响下一房 | 自动 | 冒烟 speed modifier 清理断言 |
| 三阶段旧 BOSS（70% / 35%）+ 封印 4s 可躲 | 自动 | 冒烟 phase 1/2/3、封印与躲避断言 |
| BOSS 死亡锁定胜利、清残余弹幕/火焰 | 自动 | 冒烟「residual threats cannot turn boss victory into defeat」 |
| BOSS 死亡后迟到生成不再打开空奖励 | 自动 | 冒烟「chapter reward includes a relic or ascension」+ fullrun；`victoryLocked` 守护 `clearRoom`/`spawnPortal` |
| 承伤整局累计、重开清零 | 自动 | 冒烟「damage totals survive a room transition」/「restart resets run damage totals」 |
| 同种子整局复现、双随机流隔离 | 自动 | 冒烟同种子重开断言；`rng.test.ts` |
| 暂停 / 失焦 / 切后台 / 重开 | 自动 | 冒烟 blur / visibilitychange / 暂停重开 |
| 双端输入（键鼠 / 摇杆 / 双触点） | 自动 | 冒烟桌面 + 手机视口 |
| 音频、本地记录、静态部署 | 自动 | 冒烟音频 state、`telemetry.test.ts`、`verify` |

## C. M6–M9 新增系统

| 里程碑 | 要求 | 状态 | 证据 |
| --- | --- | --- | --- |
| M6 | 章节数据驱动、章节结算/继续/收工 | 自动 | `run.test.ts` `CHAPTERS`；冒烟 CHAPTER 1/2/3 切换；fullrun 两次切换 |
| M6 | 第二世界 14 个房间、环境机制、2 种新敌人、区域 BOSS | 自动 | `rooms.test.ts`；冒烟 shock-grid ≥3 预警、sentry/phase 生成、失序核心血条 |
| M6 | 3 种规则升阶 | 自动（3 效果） | `ascensions.test.ts`；烈焰引爆、极寒禁锢、雷霆领域均有战斗内断言 |
| M6 | 首批 4 件遗物、最多装备 2 件 | 自动（6 效果） | `ascensions.test.ts`；雷鸣徽章、血焰之心、破裂棱镜、疾行之羽、寒霜王冠、贪婪契约均有战斗内断言 |
| M6 | 第一世界后至少一次可感知升级 | 自动 | 冒烟「chapter reward includes a relic or ascension」；升阶/遗物卡进入章节奖励 |
| M7 | 法则碎片、按深度/BOSS 进度结算 | 自动 | `meta.test.ts` 碎片公式；冒烟「stage clear awards shards」；阶段完成只计一章；起点通关按实际清过的章节扣减 |
| M7 | 遗物/升阶解锁进入下一局奖励池 | 自动 | `buildChapterRewards` 解锁池单测；`setMetaUnlocks` 接入场景 |
| M7 | localStorage 存档、损坏数据修复 | 自动 | `meta.test.ts` round-trip / corrupt repair；战绩扩展记录章节/遗物/升阶/异变/构筑 |
| M7 | 规则图鉴（已见/已升阶） | 自动 | `meta.test.ts` `seenRules`/`ascendedRules`；冒烟图鉴 6 条规则行 |
| M7 | 世界探索：按通关深度解锁第二/第三世界起点 | 自动 | `meta.test.ts` `maxStartChapter`；冒烟 `?start=2` 继承 Lv.3 双规则 + 2 遗物；`fullrun-start1` 24/24、`fullrun-start2` 12/12 |
| M7 | 成就与解锁反馈 | 自动 | `meta.test.ts` 9 项成就；图鉴面板与结算新成就行 |
| M8 | 第三世界 14 个房间、void-rift、rule-null | 自动 | `rooms.test.ts`；冒烟「void-rift spawns larger telegraph zones」「rule-null briefly seals a rule」 |
| M8 | 特殊精英「逆律先知」 | 自动（生成/行为） | 章节 3 精英房；`updateSeer` 瞬移 + 虚空领域 |
| M8 | 最终 BOSS「规则之源」 | 自动 | 冒烟标题/血量/血条；三阶段 `updateSource` |
| M8 | 扩展遗物（第 5/6 件） | 自动（数据） | `relics.ts` 6 件；`ascensions.test.ts` |
| M8 | 25–35 分钟三章路线 | 模型 + 结构 | `tuning.test.ts` 25–35；fullrun 37/37（结构时长约 63 秒） |
| M9 | 异变 I–V | 自动 | `mutators.test.ts`；冒烟 `?mutator=3` + HUD M3 |
| M9 | 异变影响敌人/BOSS/环境/奖励 | 自动 | 敌人 HP/速度、BOSS 血量/弹幕、hazard 间隔、碎片倍率代码与单测 |
| M9 | 每日种子挑战与最佳记录 | 自动 | `?daily=1` 固定种子 + 每日异变 I–III 修正；冒烟「daily challenge applies a deterministic mutator」；`meta.test.ts` `dailyBest`/成就 |
| M9 | 9 项成就与图鉴难度选择 | 自动 | 冒烟图鉴 9 项成就、6 个异变按钮；单测 |
| M9 | 更丰富事件与隐藏奖励 | 自动 | 规则喷泉 / 虚空交易（随机遗物）进入事件池；`run.test.ts` 6 事件 |
| M9.5 | 后期强化池（规则满级 + 遗物满槽后） | 自动 | 4 项：余烬蔓延/裂隙回响/霜环驻留/穿透蓄势；每局最多 2 个；4 项均有战斗内断言；fullrun W3 起点实拿 2 项 |
| M9.5 | 三世界视觉语言 | 自动 + 截图 | W1 金红 / W2 青蓝 / W3 紫黑；地板 tint、环境洗色、框架、火盆、尘埃分层；冒烟断言 `worldTheme`，截图 `screenshots/m95-world-w*.png` |
| M9.6 | 遗物/突变/高阶强化说明 | 自动 | HUD 悬停/点击/聚焦显示完整说明；冒烟「relic tooltip shows the full description」 |
| M9.6 | 完整第三规则槽 | 自动 | 主槽满后可装备第三规则；双命中叠加、第三弹道额外开火；总等级 9；双满级后不再出替换卡；W2/W3 敌人与 BOSS 血量 +15% |
| M9.5 | 战斗场景代码不再主要膨胀 | 进行中 | Arbiter 已拆到 `src/game/bosses/arbiter.ts`（135 行）+ `ArbiterHost`，4 项单测；`M0Scene.ts` 5,272 行，Core/Source 待后续 |

## D. 性能与长时运行

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 生产构建 | 自动 | `npm run build`；dist 1.91MB（JS 约 1.31MB / gzip 355KB + CSS 51KB） |
| 静态资源 | 自动 | `npm run verify` 31/31 |
| 40 敌人压力 | 自动近似 | `stress.mjs`：40 敌人 / 45 发敌弹，avg 59.6 / min 59 fps |
| CPU 节流 | 自动近似 | `lowend.mjs`：×1 59.5 / ×4 58.0 / ×6 47.8 fps（min 44） |
| 8 分钟浸泡 | 自动近似 | `soak.mjs`：监听器 +0、节点 1.5k–2.5k 波动、堆 8–34.7MB 随 GC 波动、60fps |
| 9 组合 DPS / 清房 | 自动 | `combo-bench.mjs` 26–125 DPS；`combo-run.mjs` 39–46s、全部 13 杀 |

## E. 仅外部可完成的验收

| 项目 | 原因 | 当前状态 |
| --- | --- | --- |
| 5–10 人真人试玩 | 需要外部参与者 | 已回收 1 局（8:30 通关）；M6–M9 新内容尚无真人样本；结算页「导出试玩数据」与 `docs/PLAYTEST.md` 已就绪；机器人 5 组见 `docs/AUTOPLAY_M6_M9.md`（仅补充） |
| 真人 25–35 分钟时长 | 需要真人节奏 | 仅有节奏模型与结构性 fullrun；自动机器人试玩仍早死，不能替代 |
| 真机触控 / 发热 / 长时运行 | 需要真实设备 | 仅 CDP 双触点、视口与 CPU 节流近似 |
| 构筑强弱与再玩意愿 | 主观体验 | 需要多人样本 |

## F. 已知偏差

- `M0Scene.ts` 已 5,272 行，超过蓝图「不扩大巨型场景类」的工程约束；`meta`/`mutators`/`relics`/`ascensions` 已独立成模块，但敌人与 BOSS AI 仍在场景类内。
- 遗物与升阶的 9 项战斗效果均已有定向战斗断言；真人手感、效果强度与组合强弱仍需外部试玩。
- 自动试玩机器人在 +10% 配额下止步第 2 房（2/13），不作为难度或时长结论。

## G. 复现步骤

```bash
npm ci
npm test
npm run build
npm run preview -- --port 4177
BASE_URL=http://127.0.0.1:4177 npm run smoke
BASE_URL=http://127.0.0.1:4177 npm run verify
BASE_URL=http://127.0.0.1:4177 npm run fullrun
BASE_URL=http://127.0.0.1:4177 npm run fullrun-start1
BASE_URL=http://127.0.0.1:4177 npm run fullrun-start2
BASE_URL=http://127.0.0.1:4177 npm run world-shots
BASE_URL=http://127.0.0.1:4177 node scripts/stress.mjs
BASE_URL=http://127.0.0.1:4177 npm run lowend
BASE_URL=http://127.0.0.1:4177 npm run soak
```

自动化脚本依赖本机 Chrome/Edge（`scripts/*.mjs` 会自动探测常见安装路径）。
