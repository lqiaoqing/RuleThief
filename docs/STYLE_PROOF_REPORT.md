# 《规则掠夺者》风格验证包报告

> 日期：2026-10-25  
> 说明：这是 P0 风格验证阶段的报告。M0 可玩切片之后新增了实际战斗、规则掠夺、音频与结算，见 [M0_REPORT.md](./M0_REPORT.md)。
> 结论：**视觉方向可继续，Blender + 程序化素材管线已跑通。** 目前没有素材硬阻塞；进入 M0 前只需要确认“当前 2.5D 暗色地牢 + 霓虹规则特效”的方向是否合口味。

## 1. 本次交付

- Vite + TypeScript + Phaser 3.90 的可运行项目。
- 主菜单 + 方形响应式竞技场 + HUD + PC 侧栏。
- 手机端：BOSS 状态条、构筑条、虚拟摇杆、闪避按钮、安全区适配。
- 4 个 Blender 渲染精灵：玩家、铁刺甲虫、雷光蝠、规则审判者。
- 自动攻击演示：弹射 × 爆裂、链式闪电、三处爆炸、伤害数字、冲锋预警锥/环。
- 操作：WASD / 摇杆移动，Space / 按钮闪避，暂停、返回菜单、失焦暂停。
- 5 张验收截图：
  - `screenshots/style-proof/menu-desktop.png`（1440×900）
  - `screenshots/style-proof/arena-desktop.png`（1440×900）
  - `screenshots/style-proof/menu-mobile.png`（390×844）
  - `screenshots/style-proof/arena-mobile.png`（390×844）
  - `screenshots/style-proof/arena-landscape.png`（844×390）

> 截图里的链式闪电/爆炸用调试定格，方便看清三点落雷；实际游戏内也会周期性触发同一套 VFX。

## 2. 素材管线（实测跑通）

### 2.1 Blender 精灵

脚本：`scripts/blender/make_sprites.py`

- Blender 5.2.2 LTS，headless + Cycles CPU，32 samples，透明背景。
- 程序化几何 + 材质/灯光：低模 chibi、暗色地牢、青/紫轮廓光。
- 输出：512×512（角色/敌人）、768×768（BOSS）的透明 PNG 到 `art-source/sprites/raw/`。
- 4 个精灵渲染约 14 秒。

### 2.2 Pillow 后处理

脚本：`scripts/postprocess_sprites.py`

- 裁切透明边界 → 对比度/饱和度微调 → 深色描边 → 缩放 → 256/512 画布。
- 输出：`public/assets/sprites/player.png`、`beetle.png`、`bat.png`、`boss.png`。
- 描边让精灵在暗色地砖上保持剪影可读。

### 2.3 程序化地砖

脚本：`scripts/make_floor.py`

- 1024×1024 暗色石砖、裂纹、碎石、中央仪式圆环、方向光池、暗角。
- 输出：`public/assets/textures/dungeon-floor.webp`（约 30KB）。
- 比纯色地板更有氛围，同时保持低对比度，不抢角色/特效。

### 2.4 程序化 UI/VFX

- HUD、菜单、侧栏：HTML/CSS/内联 SVG。
- 闪电、爆炸、火花、Dash 残影、火盆、尘埃：Phaser Graphics + Canvas 纹理 + 粒子。
- 目前**没有音频**；本次验证只覆盖视觉和交互。

### 2.5 部署体积

- `public/assets` 约 364KB。
- `dist` 约 1.6MB（其中 Phaser JS 1.19MB / gzip 约 326KB）。
- Blender 原始渲染留在 `art-source/`，不进入部署。

## 3. 验证结果

### 3.1 交互冒烟（生产构建）

`BASE_URL=http://127.0.0.1:4174 node scripts/smoke.mjs`：**21/21 通过**。

覆盖：

- 菜单显示/进入竞技场/HUD/侧栏显示。
- 键盘移动、Space 闪避冷却。
- 暂停浮层、继续、返回菜单。
- 无横向溢出。
- 手机端摇杆、闪避按钮、BOSS 条、构筑条显示。
- 无 console/page error。

### 3.2 性能

| 环境 | 结果 | 说明 |
|---|---|---|
| 真实 Chrome（headed，硬件 WebGL） | 约 80–100fps；1 秒移动 185.5 逻辑像素；闪避冷却 4s | 验证了帧率无关移动与输入 |
| headless Chrome + SwiftShader | 约 30–35fps；输入时序有抖动 | 软件渲染，不代表真机 |
| 真机手机 | **尚未测试** | 需要你或测试机跑一次 |

> 技术发现：Phaser 默认的 `smoothStep` 在极低帧率下会把 delta 锁在 16.67ms，导致移动变慢。已在 `src/main.ts` 关闭 `smoothStep`，并把战斗移动的 delta 上限设为 50ms；30fps 以上速度正常，低于 20fps 时会轻微慢动作。

### 3.3 可读性

- 三个敌人剪影区分明显：甲虫=装甲椭圆、雷蝠=发光翼、BOSS=巨眼+光环。
- 规则颜色语言成立：弹射=青、爆裂=橙/黄，规则槽与 VFX 一致。
- 冲锋预警锥 + 红色预警环在暗色地板上可读。
- 手机 390px 宽下，角色约 40px，仍能靠剪影/发光辨认；真机需再验。
- 方形竞技场在竖屏会上下留白；已用 BOSS 条、构筑条和控件把空间利用起来，没有改变“全场可见”的公平性。

## 4. 当前风格判断

**方向：2.5D 暗色地牢 chibi + 霓虹规则特效。**

优点：

- Blender 管线可控，轮廓光/材质统一，后续扩充 6 敌人/2 精英/3 阶段 BOSS 成本可控。
- 程序化地砖/VFX 与 Blender 精灵能统一，不依赖外部素材授权。
- 剪影和规则颜色可读，适合手机小尺寸。

需要你确认的偏好：

- A. 保持当前 2.5D chibi（推荐继续，最快进入 M0）。
- B. 更暗、更哥特：降低饱和度、加轮廓光、角色比例更瘦长。
- C. 更像素化：用 Pillow 做像素化/限色处理，贴近设计稿的战斗截图。

## 5. 还没有做的事

- 音频（命中、爆炸、闪避、BOSS 预警、BGM）。
- 房间/波次/奖励/事件/完整 BOSS 战。
- 6 普通敌人 + 2 精英的完整美术与行为。
- 传统逐帧动画；当前用 Blender 静态精灵 + 程序化 bob/倾斜/残影/爆炸。
- 真实手机上的触控手感/发热/续航测试。
- 正式发布级 UI 文案与本地化。

## 6. 下一步 M0 切片

建议直接复用本次场景，做文档里的 3 分钟验证：

1. 1 个房间、玩家、铁刺甲虫 + 雷光蝠。
2. 基础魔弹 + 自动瞄准 + 闪避，死亡/重开。
3. 可夺取「弹射 + 爆裂」，保留当前链式闪电/爆炸 VFX。
4. 加入命中音效、受击反馈、屏震和伤害数字。
5. 验收：玩家会主动聚怪/拉扯；连续玩 3 分钟不无聊；60fps 目标。

确认风格后即可进入 M0；若风格要改，只改素材/调色，不返工玩法代码。
