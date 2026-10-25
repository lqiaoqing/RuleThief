# 规则掠夺者 RULE THIEF

状态：**M0 可玩切片完成**（2026-10-25）。已经是可实际游玩的 3 分钟训练回廊，不是纯风格验证页。

## 立即查看

```bash
npm install
npm run dev
```

- 主菜单：`http://127.0.0.1:5173/`
- 直接进入训练回廊：`http://127.0.0.1:5173/?arena=1`

## M0 实现了什么

- 3 分钟生存目标：倒计时归零即胜利，生命归零则失败。
- 两个实际可操作的敌人：
  - 铁刺甲虫：接近 → 预警锥 → 高速冲锋 → 硬直；击败后掠夺「爆裂」。
  - 雷光蝠：保持距离 → 蓄力 → 发射雷击弹；击败后掠夺「弹射」。
- 基础魔弹自动锁最近目标，0.65s 一发，14 伤害。
- 弹射：命中后在 255 范围内跳跃最多 2 个不同目标。
- 爆裂：命中点半径 74 范围伤害，不递归触发。
- 生命、受击无敌帧、闪避 i-frame、击退、伤害数字、屏震、低血量红晕。
- 波次压力随时间上升；每 10 击杀掉落一次生命碎片。
- WebAudio 程序化音效 + 环境 drone；声音可随时静音（localStorage 记忆）。
- 暂停、失焦暂停、死亡/胜利结算、再来一局、返回菜单。
- PC 键鼠 + 手机虚拟摇杆/闪避按钮，方形竞技场横竖屏适配。

## 验证结果

- 生产构建浏览器冒烟：**37/37 通过**，无 console/page error。
- 已覆盖：菜单/进入、移动、闪避、真实击杀掉落两条规则、HUD 更新、暂停、声音开关、死亡结算、重开状态重置、计时归零自然胜利、返回菜单、手机摇杆与规则更新。
- 真实 Chrome（硬件 WebGL，headed）：约 **57fps**；音频上下文状态 `running`；移动与战斗正常。
- headless SwiftShader：约 30–40fps，输入时序有抖动；不代表真机。
- 部署体积：`dist` 约 1.7MB；`public/assets` 约 364KB。

截图：
- [桌面竞技场](screenshots/m0-arena-desktop.png)
- [桌面战斗（弹射 × 爆裂）](screenshots/m0-combat-desktop.png)
- [手机战斗](screenshots/m0-combat-mobile.png)
- [桌面失败结算](screenshots/m0-defeat-desktop.png)
- [桌面胜利结算](screenshots/m0-victory-desktop.png)
- [手机菜单](screenshots/m0-menu-mobile.png)
- [横屏](screenshots/m0-landscape.png)

> 战斗截图中的链式特效与结算数值用调试钩子定格，便于验收；实际游戏内由战斗自然触发。

## 控制

- PC：WASD / 方向键移动，Space 闪避，Esc 暂停。
- 手机：左侧虚拟摇杆移动，右侧闪避按钮，支持多点触控。
- 右上角声音按钮切换静音；失焦自动暂停。

## 验证命令

```bash
npm run build
npm run preview -- --port 4175
BASE_URL=http://127.0.0.1:4175 npm run smoke
BASE_URL=http://127.0.0.1:4175 npm run shot
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
  main.ts                 # 菜单/HUD/结算/暂停/摇杆/音频入口
  game/M0Scene.ts         # M0 战斗、敌人 AI、规则掠夺、波次、结算
  game/audio.ts           # WebAudio 音效 + 环境音
  game/theme.ts           # 调色板/尺寸/资源路径
  ui/hud.ts               # 动态 HUD、目标进度、规则、提示
  style.css / m0.css      # 菜单、竞技场 HUD、响应式、M0 组件
public/assets/            # 精灵/地砖/菜单图
art-source/sprites/raw/   # Blender 源渲染
scripts/                  # Blender、Pillow、截图、冒烟测试
docs/                     # 设计文档、可行性、风格验证、M0 报告
screenshots/              # M0 验收截图；style-proof/ 为上一阶段
```

## 文档

- [设计文档 V1](docs/RULE_THIEF_design_v1.html)
- [可行性分析](docs/FEASIBILITY.md)
- [M0 可玩切片报告](docs/M0_REPORT.md)
- [风格验证报告](docs/STYLE_PROOF_REPORT.md)
- [氛围参考](docs/art/key-art.webp) / [战斗参考](docs/art/combat-mockup.webp)

## 当前边界

M0 只有 1 个训练房间、2 种敌人、基础规则掠夺与结算；还没有房间奖励、随机事件、精英、突变、三阶段 BOSS、完整 15 分钟流程；**尚未做真人 3 分钟平衡试玩**，也**没有真机手机验收**。下一步是先试玩 M0 调数值，再进入 M1 规则系统。
