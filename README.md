# 规则掠夺者 RULE THIEF

状态：**M1 规则构筑切片完成**（2026-10-25）。3 条弹道 × 3 条命中 = 9 种组合全部可玩，支持装备 / 升级 / 替换。

## 立即查看

```bash
npm install
npm run dev
```

- 主菜单：`http://127.0.0.1:5173/`
- 直接进入训练回廊：`http://127.0.0.1:5173/?arena=1`

## M1 实现了什么

- **9 种规则组合**：贯穿 / 弹射 / 散射 × 燃烧 / 冰霜 / 爆裂，各有独立名称与战斗表现。
  - 贯穿：一次魔弹沿直线穿透 3/4/5 个目标。
  - 弹射：命中后在 255–305 范围内跳跃 2/3/4 次，后续伤害 86%。
  - 散射：扇形发射 3/4/5 枚小弹，单发 10 伤害。
  - 燃烧：持续 3–5 秒、每秒 4–6 伤害，取最大值刷新不叠加。
  - 冰霜：减速 30%–50%（上限 50%），持续 1.2–2.0 秒。
  - 爆裂：命中点半径 65/80/95 范围伤害 6/8/10。
- **规则等级**：每条规则 Lv.1–3，升级改变目标数 / 跳跃数 / 弹数 / 半径 / 持续时间，不只是数值。
- **规则祭坛**：每 15 击杀自动开启三选一；暂停菜单的「规则祭坛」可随时打开演练。
  - 新规则 → 装备；重复规则 → 升级；同槽不同规则 → 替换（重置 Lv.1，会明确提示将失去哪条）。
  - 键盘 `1` `2` `3` 直接选卡，`Esc` 或「暂不掠夺」跳过。
- **统一结算**：一次基础攻击共享 `TriggerBudget(3)`，贯穿命中、散射弹、弹射跳跃合计最多触发 3 次命中效果；持续伤害与爆炸伤害不会反过来触发规则，不存在无限连锁。
- **训练碎片**：甲虫掉「爆裂」、雷蝠掉「弹射」；只补空槽或升级，**不会顶掉**已装备的其他规则（冲突时改为回复 8 生命）。
- HUD：双槽图标 / 等级 / 效果描述、组合名称与说明、等级 N / 6、图鉴「已掠夺」状态、规则提示条。
- 结算显示最终组合名称与等级总和；重开完全重置构筑。
- 战斗基础保持不变：3 分钟生存、闪避 i-frame、击退、伤害数字、低血量红晕、波次压力、WebAudio 音效。

## 验证结果

- 单元测试：**22/22 通过**（`src/game/rules.test.ts` 19 项 + `theme` 3 项）。
- 生产构建浏览器冒烟：**70/70 通过**，无 console/page error。
- 冒烟覆盖：空构筑、训练碎片装备、祭坛暂停/选卡/跳过、升级保留另一槽、替换重置 Lv.1、9 组合名称、单槽部分名称、满级不再提供升级、15 击杀自动开启祭坛、暂停菜单规则实验室、结算组合、重开重置、手机祭坛可点选。
- 真实 Chrome（硬件 WebGL，headed）：**平均 59.5fps，最低 59fps**（散射 Lv.3 + 燃烧 Lv.3，同屏最多 28 敌人）；音频上下文 `running`。
- headless SwiftShader：约 30–40fps，输入时序有抖动；不代表真机。
- 部署体积：`dist` 约 1.7MB；`public/assets` 约 364KB。

截图：
- [主菜单](screenshots/m1-menu-desktop.png)
- [规则祭坛（桌面）](screenshots/m1-altar-desktop.png)
- [贯穿 × 爆裂](screenshots/m1-combat-pierce-blast-desktop.png)
- [散射 × 燃烧](screenshots/m1-combat-spread-burn-desktop.png)
- [弹射 × 冰霜](screenshots/m1-combat-chain-frost-desktop.png)
- [规则祭坛（手机）](screenshots/m1-altar-mobile.png)
- [规则祭坛（横屏）](screenshots/m1-altar-landscape.png)
- [手机战斗](screenshots/m1-combat-mobile.png)
- [桌面胜利结算](screenshots/m1-victory-desktop.png)
- [手机菜单](screenshots/m1-menu-mobile.png)

> 战斗截图用调试钩子定格（`__RT_POSE__` 会按当前构筑真实发射弹体并冻帧），便于验收；实际游戏内由战斗自然触发。

## 控制

- PC：WASD / 方向键移动，Space 闪避，Esc 暂停，祭坛中 `1/2/3` 选卡。
- 手机：左侧虚拟摇杆移动，右侧闪避按钮，支持多点触控；祭坛卡片直接点选。
- 右上角声音按钮切换静音；失焦自动暂停。

## 验证命令

```bash
npm test
npm run build
npm run preview -- --port 4176
BASE_URL=http://127.0.0.1:4176 npm run smoke
BASE_URL=http://127.0.0.1:4176 npm run shot
BASE_URL=http://127.0.0.1:4176 node scripts/perf.mjs   # 需要真实窗口测 fps
```

## 素材管线

- `scripts/blender/make_sprites.py`：Blender 5.2 headless / Cycles CPU 渲染玩家、甲虫、雷蝠、规则审判者。
- `scripts/postprocess_sprites.py`：Pillow 裁切、描边、调色、缩放。
- `scripts/make_floor.py`：程序化暗色地牢地砖。
- `art-source/sprites/raw/`：Blender 原始透明渲染（不部署）。
- `public/assets/`：游戏实际使用素材（364KB）。
- 音频：运行时 WebAudio 合成，无外部音频素材。

## 目录

```text
src/
  main.ts                 # 菜单/HUD/结算/暂停/摇杆/祭坛流程/音频入口
  game/M0Scene.ts         # 战斗、敌人 AI、弹道与命中结算、规则祭坛、波次、结算
  game/rules.ts           # 纯逻辑：规则定义、等级、组合、随机三选一、结算预算
  game/rules.test.ts      # 规则引擎单测
  game/audio.ts           # WebAudio 音效 + 环境音
  game/theme.ts           # 调色板/尺寸/资源路径
  ui/hud.ts               # 动态 HUD、双槽、组合、图鉴、提示
  ui/altar.ts             # 规则祭坛卡片渲染
  style.css / m0.css      # 菜单、竞技场 HUD、祭坛、响应式
public/assets/            # 精灵/地砖/菜单图
art-source/sprites/raw/   # Blender 源渲染
scripts/                  # Blender、Pillow、截图、冒烟、性能
docs/                     # 设计文档、可行性、风格验证、M0/M1 报告
screenshots/              # M0/M1 验收截图；style-proof/ 为更早阶段
```

## 文档

- [设计文档 V1](docs/RULE_THIEF_design_v1.html)
- [可行性分析](docs/FEASIBILITY.md)
- [M1 规则构筑报告](docs/M1_REPORT.md)
- [M0 可玩切片报告](docs/M0_REPORT.md)
- [风格验证报告](docs/STYLE_PROOF_REPORT.md)
- [氛围参考](docs/art/key-art.webp) / [战斗参考](docs/art/combat-mockup.webp)

## 当前边界

M1 仍然只有 1 个训练房间、2 种敌人（甲虫 → 爆裂、雷蝠 → 弹射）。按设计文档，甲虫本应掉「贯穿」，目前为了先用两种敌人覆盖两条槽位做了重映射，等 M3 敌人补齐后再改回。

尚未实现：房间流程与战后奖励（M2，用于替换现在的「每 15 击杀祭坛」临时方案）、其余 4 种敌人 + 2 精英、突变系统、三阶段 BOSS、15 分钟流程、存档。**尚未做真人 3 分钟平衡试玩**，也**没有真机手机验收**。
