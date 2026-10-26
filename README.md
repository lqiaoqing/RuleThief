# 规则掠夺者 RULE THIEF

状态：**M5 全流程完成**（2026-10-26）。6 敌人 + 2 精英 + 3 突变 + 4 事件 + 三阶段 BOSS，单局 13 步 / 18 节点（10 场战斗 + 2 事件 + BOSS）。

## 立即查看

```bash
npm install
npm run dev
```

- 主菜单：`http://127.0.0.1:5173/`
- 直接进入流程：`http://127.0.0.1:5173/?arena=1`

## M3c 实现了什么

- **4 种随机事件**，每局抽中 2 种：血色祭坛（20 血换升级）、不稳定实验（升级但下一房敌人 +20% 移速）、遗忘神像（换一条规则并回血）、诅咒宝箱（下一房多一个精英，该房奖励 +1 张）。
- **分支路线**：一局 13 步、地图 18 个节点，5 个二选一节点（普通 / 普通、精英 / 普通、精英 / 普通）。
- **7 个新房间**：蚀骨回廊、灼热裂隙、菌毯回廊、焦土庭院、霜骨回廊、熔渣庭院、残响回廊、凛冬庭院、灰烬回廊，补齐规则池组合与路线长度。
- 跨房修饰器只影响下一房，进入下一房消费后立即清除。
- HUD 的 ROOM 计数改为按路线步数（n / 13），事件步显示事件名。

## M3b 实现了什么

- **3 条突变天赋**，每局最多装备 1 条，精英房四选一保底出现：
  - ⚙️ 过载核心：累计 10 次有效命中，下一轮普攻伤害 ×1.8。
  - 💨 疾行强化：闪避后 2 秒内攻击间隔 ×0.55。
  - ❤️ 绝境斗志：生命低于 35% 时所有伤害 ×1.35。
- **最终 BOSS「规则审判者」**（1800 HP，7 号房审判庭）：
  - 第一阶段 · 秩序（100%→70%）：每 2.4s 扇形 9 发弹幕。
  - 第二阶段 · 混乱（70%→35%）：弹幕加快，新增预警冲锋与召唤杂兵。
  - 第三阶段 · 规则剥夺（35%→0%）：11 发弹幕 + 脚下封印预警区；没躲开则随机封印一条已装备规则 4 秒（HUD 灰显 + 自动解封）。
  - 击杀直接结算 7 / 7，不进入房间奖励。
- **BOSS 血条**：顶部显示名称、血量、`PHASE I/II/III` 与三段指示；阶段切换有震屏 + 闪光 + 提示。
- 构筑维度：9 种规则组合 × 3 条突变 = 27 种方向；突变状态在 HUD 构筑面板常驻显示。

## M3a 实现了什么

- **6 种普通敌人，一种敌人对应一条规则**（按设计文档恢复原始映射）：

| 敌人 | 规则 | 行为 | 反制 |
| --- | --- | --- | --- |
| 铁刺甲虫 | 贯穿 | 直线预警 → 高速冲锋 | 横向闪避 |
| 雷光蝠 | 弹射 | 保持距离，单发雷击 | 拉近距离或绕后 |
| 孢子花 | 散射 | 几乎不动，扇形 5 连孢子弹 | 不要正面直冲 |
| 灼焰史莱姆 | 燃烧 | 贴身追击，沿途留下火焰地面 | 别被逼进角落 |
| 寒霜浮灵 | 冰霜 | 远程减速弹（移动 -45%） | 优先清掉，避免被减速后吃冲锋 |
| 爆裂甲虫 | 爆裂 | 高速贴近，死亡/贴身自爆 | 拉开距离击杀 |

- **2 个精英**（金色光环 + 金色血条 + 更大的体型）：
  - 裂甲精英：连续两次冲锋，第二次在短暂预警后重新锁定你的方向；320 HP。
  - 雷暴精英：先 0.8 秒蓄力，然后 3 道扇形雷击，随后追加 2 道；260 HP。
- **6 个房间**，普通房三选一、精英房四选一，清空第三/六房推进下一房：

| # | 房间 | 敌人 | 配额 | 奖励 |
| --- | --- | --- | --- | --- |
| 1 | 训戒前庭 | 甲虫 | 8 | 3 选 1 |
| 2 | 余烬苗圃 | 史莱姆 + 甲虫 | 10 | 3 选 1 |
| 3 | 孢子温室 | 孢子花 + 史莱姆 | 12 | 3 选 1 |
| 4 | 回声回廊 | 雷光蝠 + 寒霜浮灵 | 14 | 3 选 1 |
| 5 | 裂甲竞技场 | ★裂甲精英 + 甲虫 + 爆裂甲虫 | 9 | 4 选 1 |
| 6 | 雷暴祭坛 | ★雷暴精英 + 雷光蝠 + 寒霜浮灵 | 10 | 4 选 1 |

- **房间规则池由真实敌人决定**：前两房分别给出一条弹道（贯穿）与一条命中（燃烧），符合设计文档「前两房保证一条弹道 + 一条命中」。
- 侧栏图鉴改为**按当前房间敌人动态渲染**，显示敌人、携带规则与「已掠夺」状态。
- 房间预览会标出精英房与精英敌人（金色 ★）。
- 玩家新增**冰霜减速状态**（HUD 提示 + 角色染色），史莱姆的火焰地面是持续伤害区域。
- 数据层（`src/game/rooms.ts`）集中了敌人属性、6 个房间、规则池、奖励生成与 4 种基础强化。

## 验证结果

- 单元测试：**83/83 通过**（`rules` 19 + `rooms` 23 + `mutations` 12 + `run` 12 + `tuning` 6 + `telemetry` 7 + `theme` 3）。
- 生产构建浏览器冒烟：**114 项通过**，无 console/page error。
- 冒烟覆盖：单次攻击命中结算 ≤3（爆炸命中 7 个敌人也不额外触发）、燃烧 DOT 只掉血不触发规则、失焦自动暂停；13 步路线（10 场战斗 + 2 事件 + BOSS）、分支二选一、每房配额与敌人、精英领袖必出、精英房四选一与保底突变、跨房修饰只作用一房、BOSS 三阶段与封印、结算 13/13、单局记录持久化、动态图鉴、9 组合名称、重开重置、死亡失败、手机流程。
- 真实 Chrome（硬件 WebGL，headed）：40 敌压测 **57–59fps**；BOSS 第三阶段 **60fps**；CPU ×6 节流模拟低端机 **41fps（最低 38）**；音频 `running`。
- 部署体积：`dist` 约 1.8MB；`public/assets` 约 460KB。

截图：
- [分支路线](screenshots/m3c-route-desktop.png)
- [随机事件](screenshots/m3c-event-desktop.png)
- [BOSS 第三阶段 · 封印预警](screenshots/m3b-boss-phase3-desktop.png)
- [BOSS 第一阶段 · 扇形弹幕](screenshots/m3b-boss-phase1-desktop.png)
- [精英房突变奖励](screenshots/m3b-mutation-reward-desktop.png)
- [BOSS 房预览](screenshots/m3b-boss-preview-desktop.png)
- [胜利结算](screenshots/m3b-victory-desktop.png)
- [主菜单](screenshots/m3a-menu-desktop.png)
- [房间预览](screenshots/m3a-room-preview-desktop.png)
- [精英房预览](screenshots/m3a-elite-preview-desktop.png)
- [新敌人陈列（孢子花 / 史莱姆 / 寒霜浮灵 / 爆裂甲虫）](screenshots/m3a-enemies-desktop.png)
- [两个精英](screenshots/m3a-elites-desktop.png)
- [普通房奖励](screenshots/m3a-reward-desktop.png)
- [精英房四选一](screenshots/m3a-elite-reward-desktop.png)
- [胜利结算](screenshots/m3a-victory-desktop.png)
- [手机战斗](screenshots/m3a-combat-mobile.png)

## 试玩（待完成的人工验收）

[试玩协议](docs/PLAYTEST.md)：5–10 人、每人 2 局、记录自动存在 localStorage，控制台一行命令即可导出。协议里列出了必须靠人判断的假设（贯穿是否偏弱、冰霜是否只值控制、弹射+爆裂是否过强、精英墙、封印可读性）。

## 平衡与试玩工具

- `scripts/combo-bench.mjs`：9 种组合对 3 个聚怪木桩的 DPS 基准（写 `docs/combo-bench.json`）。
- `scripts/autoplay.mjs`：自动试玩一整局，输出逐房数据。
- 结算页会显示累计战绩（localStorage，最近 20 局）。

## 试玩记录

每局结束会把结果写入 localStorage（最近 20 局），结算页显示「累计 N 局 · 通关数 · 最快用时 · 最常构筑」，并给出「承伤构成」（近身接触 / 冲锋 / 敌弹 / 火焰地面 / 自爆 / 其他）的百分比。这些记录用于后续调优，不需要账号或后端。

自动试玩机器人：`BASE_URL=http://127.0.0.1:4177 node scripts/autoplay.mjs`，会完整打一局并把逐房数据写到 `docs/autoplay-last.json`。

## 上手

首次打开会显示一页「训练须知」（闪避无敌帧、规则来自清房、组合与突变），确认一次后不再弹出；之后可从主菜单的「这是什么？」再次查看详细说明。

## 控制

- PC：WASD / 方向键移动，Space 闪避，Esc 暂停（暂停页显示当前组合、突变、进度与生命），奖励界面 `1–4` 选卡，房间预览 Enter 进入。
- 手机：左侧虚拟摇杆移动，右侧闪避按钮，支持多点触控；房间与奖励卡片直接点按。

## 验证命令

```bash
npm test
npm run build
npm run preview -- --port 4177
BASE_URL=http://127.0.0.1:4177 npm run smoke
BASE_URL=http://127.0.0.1:4177 npm run shot
BASE_URL=http://127.0.0.1:4177 node scripts/perf.mjs
BASE_URL=http://127.0.0.1:4177 npm run lowend    # CPU 节流模拟低端机
BASE_URL=http://127.0.0.1:4177 npm run verify   # 静态资源完整性
```

## 素材管线

- `scripts/blender/make_sprites.py`：Blender 5.2 headless / Cycles CPU 渲染玩家、6 种敌人、规则审判者。
- `scripts/postprocess_sprites.py`：Pillow 裁切、描边、调色、缩放。
- `scripts/make_floor.py`：程序化暗色地牢地砖。
- 新敌人（孢子花 / 灼焰史莱姆 / 寒霜浮灵 / 爆裂甲虫）与既有敌人共用同一套 Blender 图元与灯光配置，`ONLY=SPORE` 之类的环境变量可单独重渲。
- 音频：运行时 WebAudio 合成，无外部音频素材。

## 目录

```text
src/
  main.ts                 # 菜单/HUD/结算/暂停/摇杆/房间与奖励流程/音频入口
  game/M0Scene.ts         # 战斗、8 种敌人 AI、弹道结算、房间状态机、结算
  game/rules.ts           # 纯逻辑：规则定义、等级、组合、三选一、结算预算
  game/rooms.ts           # 纯逻辑：敌人属性、房间、规则池、奖励、强化
  game/*.test.ts          # 规则 / 房间 / 主题单测
  game/audio.ts           # WebAudio 音效 + 环境音
  game/theme.ts           # 调色板/尺寸/资源路径
  ui/hud.ts               # 动态 HUD、双槽、组合、房间进度、动态图鉴
  ui/altar.ts             # 房间预览与奖励卡片渲染
  style.css / m0.css      # 菜单、竞技场 HUD、房间与奖励界面、响应式
public/assets/            # 精灵/地砖/菜单图
art-source/sprites/raw/   # Blender 源渲染
scripts/                  # Blender、Pillow、截图、冒烟、性能
docs/                     # 设计文档、可行性、各阶段报告
screenshots/              # 各阶段验收截图
```

## 文档

- [验收矩阵（设计 → 证据）](docs/ACCEPTANCE.md)
- [设计文档 V1](docs/RULE_THIEF_design_v1.html)
- [可行性分析](docs/FEASIBILITY.md)
- [M5 移动/音频/部署](docs/M5_DEPLOY.md)
- [M4 数值与节奏调优](docs/M4_TUNING.md)
- [M3c 事件与分支报告](docs/M3C_REPORT.md)
- [M3b 突变与 BOSS 报告](docs/M3B_REPORT.md)
- [M3a 敌人与精英报告](docs/M3A_REPORT.md)
- [M2 房间闭环报告](docs/M2_REPORT.md)
- [M1 规则构筑报告](docs/M1_REPORT.md)
- [M0 可玩切片报告](docs/M0_REPORT.md)
- [风格验证报告](docs/STYLE_PROOF_REPORT.md)

## 当前边界

- 单局 13 步按节奏模型约 11.5 分钟，落在设计文档给出的 10–20 分钟目标区间内（低于 15 分钟的期望值）；路线仍是线性 + 二选一，没有可视化地图与商店。
- BOSS 只有一套攻击模板，没有弹幕形态随机组合。
- 突变与规则的数值交互未做专门调参（例如过载对散射 5 弹的充能速度）。
- 精英的「保底突变」以四选一里的固定卡呈现，没有独立掉落演出。
- 敌人行为是手写状态机，尚未做同屏 30+ 的单位池化与压测。
- **尚未做真人平衡试玩**，也**没有真机手机验收**。
