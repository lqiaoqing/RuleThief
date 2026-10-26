# 规则掠夺者 RULE THIEF

状态：**M2 房间与奖励闭环完成**（2026-10-25）。三个房间依次推进，清场后三选一奖励，构筑跨房保留。

## 立即查看

```bash
npm install
npm run dev
```

- 主菜单：`http://127.0.0.1:5173/`
- 直接进入流程：`http://127.0.0.1:5173/?arena=1`

## M2 实现了什么

- **三个房间顺序推进**（约 3–4 分钟一局）：
  | 房间 | 敌人构成 | 清场配额 | 同屏上限 | 规则池 |
  | --- | --- | --- | --- | --- |
  | 训戒前庭 ANTECHAMBER | 铁刺甲虫 | 8 | 5 | 爆裂 |
  | 回声回廊 ECHO GALLERY | 甲虫 + 雷光蝠（雷蝠为主） | 12 | 7 | 爆裂 / 弹射 |
  | 裂痕圣所 RIFT SANCTUM | 甲虫 + 雷光蝠 | 16 | 9 | 爆裂 / 弹射 |
- **房间预览**：进入每个房间前暂停并展示房间名、敌人构成与它们携带的规则、清场配额、当前生命与累计击杀。
- **清场奖励**：配额清空后暂停，三选一。
  - 规则奖励只来自**本房真实敌人**携带的规则（房间 1 只会给爆裂）。
  - 其余为**基础强化**：生命上限 +20、回复 45、闪避冷却 -0.8s、移速 +8%。
  - 必须选一份才能进入下一房；选择后立刻生效。
- **跨房继承**：构筑、生命、已解锁图鉴全部保留；切房时清空在飞弹体、敌人、弹幕与地面掉落，玩家回到出生点并获得 1 秒无敌。
- **胜负条件**：清空第三个房间即胜利；生命归零失败。结算显示总用时、击杀、清空房间数与最终组合。
- 移除了 M0/M1 的临时方案：不再有「每 15 击杀规则祭坛」，也不再掉落规则碎片；规则获取统一走房间奖励。生命碎片（每 10 击杀）保留。
- 规则系统仍是 M1 的完整版本：9 种组合、Lv.1–3、装备/升级/替换、`TriggerBudget(3)` 单次攻击共享预算、DOT 与爆炸不触发规则。

## 验证结果

- 单元测试：**36/36 通过**（`rules` 19 项 + `rooms` 14 项 + `theme` 3 项）。
- 生产构建浏览器冒烟：**64/64 通过**，无 console/page error。
- 冒烟覆盖：房间预览与配额、进房恢复、房间进度 HUD、清场开奖励、奖励规则只能来自本房敌人、规则与强化混合、选规则装备、选强化加生命上限、奖励后接下一房、切房清弹幕、三房全清胜利、死亡失败、重开完全重置、9 组合名称、暂停无规则实验室、手机房间预览/进房/奖励点选。
- 真实 Chrome（硬件 WebGL，headed）：散射 Lv.3 + 燃烧 Lv.3、同屏最多 24 敌人时 **平均 58.9fps（最低 58）**；音频上下文 `running`。
- headless SwiftShader：约 30–40fps，仅用于功能验证；不代表真机。
- 部署体积：`dist` 约 1.7MB；`public/assets` 约 364KB。

截图：
- [主菜单](screenshots/m2-menu-desktop.png)
- [房间预览](screenshots/m2-room-preview-desktop.png)
- [清场奖励（三选一）](screenshots/m2-reward-desktop.png)
- [战斗：贯穿 × 爆裂](screenshots/m2-combat-pierce-blast-desktop.png)
- [战斗：散射 × 燃烧](screenshots/m2-combat-spread-burn-desktop.png)
- [房间预览（手机）](screenshots/m2-room-preview-mobile.png)
- [清场奖励（手机）](screenshots/m2-reward-mobile.png)
- [手机战斗](screenshots/m2-combat-mobile.png)
- [胜利结算](screenshots/m2-victory-desktop.png)

> 战斗截图用调试钩子定格（`__RT_POSE__` 会按当前构筑真实发射弹体并冻帧），便于验收；实际游戏内由战斗自然触发。

## 控制

- PC：WASD / 方向键移动，Space 闪避，Esc 暂停，奖励界面 `1/2/3` 选卡，房间预览 Enter 进入。
- 手机：左侧虚拟摇杆移动，右侧闪避按钮，支持多点触控；房间与奖励卡片直接点按。
- 右上角声音按钮切换静音；失焦自动暂停。

## 验证命令

```bash
npm test
npm run build
npm run preview -- --port 4177
BASE_URL=http://127.0.0.1:4177 npm run smoke
BASE_URL=http://127.0.0.1:4177 npm run shot
BASE_URL=http://127.0.0.1:4177 node scripts/perf.mjs   # 需要真实窗口测 fps
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
  main.ts                 # 菜单/HUD/结算/暂停/摇杆/房间与奖励流程/音频入口
  game/M0Scene.ts         # 战斗、敌人 AI、弹道结算、房间状态机、结算
  game/rules.ts           # 纯逻辑：规则定义、等级、组合、三选一、结算预算
  game/rules.test.ts      # 规则引擎单测
  game/rooms.ts           # 纯逻辑：房间定义、敌人配比、奖励生成、基础强化
  game/rooms.test.ts      # 房间与奖励单测
  game/audio.ts           # WebAudio 音效 + 环境音
  game/theme.ts           # 调色板/尺寸/资源路径
  ui/hud.ts               # 动态 HUD、双槽、组合、房间进度、图鉴
  ui/altar.ts             # 房间预览与奖励卡片渲染
  style.css / m0.css      # 菜单、竞技场 HUD、房间与奖励界面、响应式
public/assets/            # 精灵/地砖/菜单图
art-source/sprites/raw/   # Blender 源渲染
scripts/                  # Blender、Pillow、截图、冒烟、性能
docs/                     # 设计文档、可行性、风格验证、M0/M1/M2 报告
screenshots/              # 各阶段验收截图
```

## 文档

- [设计文档 V1](docs/RULE_THIEF_design_v1.html)
- [可行性分析](docs/FEASIBILITY.md)
- [M2 房间闭环报告](docs/M2_REPORT.md)
- [M1 规则构筑报告](docs/M1_REPORT.md)
- [M0 可玩切片报告](docs/M0_REPORT.md)
- [风格验证报告](docs/STYLE_PROOF_REPORT.md)

## 当前边界

- 仍然只有 2 种敌人（甲虫 → 爆裂、雷蝠 → 弹射）。设计文档里甲虫本应掉「贯穿」，为在只有两种敌人时覆盖两条槽位做了重映射，M3 补齐敌人后改回。
- 房间是固定顺序、无分支路线；没有房间事件、商店、精英房。
- 没有突变系统与三阶段 BOSS，单局约 3–4 分钟而非设计目标的 15 分钟。
- 规则池只有爆裂/弹射两条，因此三个房间的构筑差异仍有限。
- **尚未做真人平衡试玩**，也**没有真机手机验收**。
