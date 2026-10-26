# 规则掠夺者 RULE THIEF

状态：**M3a 敌人与精英完成**（2026-10-25）。6 种普通敌人 + 2 个精英，6 个房间依次推进，规则池按房间分化。

## 立即查看

```bash
npm install
npm run dev
```

- 主菜单：`http://127.0.0.1:5173/`
- 直接进入流程：`http://127.0.0.1:5173/?arena=1`

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

- 单元测试：**42/42 通过**（`rules` 19 + `rooms` 20 + `theme` 3）。
- 生产构建浏览器冒烟：**79/79 通过**，无 console/page error。
- 冒烟覆盖：6 房逐房推进、每房配额与敌人、精英领袖必出、精英房四选一、房间规则池限制、新敌人（孢子花/史莱姆/寒霜浮灵/爆裂甲虫）可生成、史莱姆留下火焰地面、爆裂甲虫死亡爆炸伤害玩家、动态图鉴、9 组合名称、重开重置、六房全清胜利、死亡失败、手机流程。
- 真实 Chrome（硬件 WebGL，headed）：散射 Lv.3 + 燃烧 Lv.3、同屏最多 25 敌人时 **平均 59.6fps（最低 59）**；音频上下文 `running`。
- 部署体积：`dist` 约 1.8MB；`public/assets` 约 460KB。

截图：
- [主菜单](screenshots/m3a-menu-desktop.png)
- [房间预览](screenshots/m3a-room-preview-desktop.png)
- [精英房预览](screenshots/m3a-elite-preview-desktop.png)
- [新敌人陈列（孢子花 / 史莱姆 / 寒霜浮灵 / 爆裂甲虫）](screenshots/m3a-enemies-desktop.png)
- [两个精英](screenshots/m3a-elites-desktop.png)
- [普通房奖励](screenshots/m3a-reward-desktop.png)
- [精英房四选一](screenshots/m3a-elite-reward-desktop.png)
- [胜利结算](screenshots/m3a-victory-desktop.png)
- [手机战斗](screenshots/m3a-combat-mobile.png)

## 控制

- PC：WASD / 方向键移动，Space 闪避，Esc 暂停，奖励界面 `1–4` 选卡，房间预览 Enter 进入。
- 手机：左侧虚拟摇杆移动，右侧闪避按钮，支持多点触控；房间与奖励卡片直接点按。

## 验证命令

```bash
npm test
npm run build
npm run preview -- --port 4177
BASE_URL=http://127.0.0.1:4177 npm run smoke
BASE_URL=http://127.0.0.1:4177 npm run shot
BASE_URL=http://127.0.0.1:4177 node scripts/perf.mjs
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

- [设计文档 V1](docs/RULE_THIEF_design_v1.html)
- [可行性分析](docs/FEASIBILITY.md)
- [M3a 敌人与精英报告](docs/M3A_REPORT.md)
- [M2 房间闭环报告](docs/M2_REPORT.md)
- [M1 规则构筑报告](docs/M1_REPORT.md)
- [M0 可玩切片报告](docs/M0_REPORT.md)
- [风格验证报告](docs/STYLE_PROOF_REPORT.md)

## 当前边界

- 单局 6 房约 6–8 分钟，仍不足设计目标的 15 分钟；还没有分支路线、随机事件、商店。
- 突变系统与三阶段 BOSS 未实现（M3b）。
- 精英目前只是「更大更硬 + 金色标识 + 独有行为」，没有独立的掉落保底机制（精英房以四选一替代）。
- 敌人行为是手写状态机，尚未做同屏 30+ 的单位池化与弹幕上限压测。
- **尚未做真人平衡试玩**，也**没有真机手机验收**。
