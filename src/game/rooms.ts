import { getRuleOffers, type PlayerBuild, type RuleKey, type RuleOffer } from './rules';
import { MUTATIONS, MUTATION_IDS, type MutationDef } from './mutations';
import { ASCENSION_IDS, getAscensionForRule, type AscensionDef, type AscensionId } from './ascensions';
import { MAX_RELICS, RELICS, RELIC_IDS, type RelicDef, type RelicId } from './relics';
import {
  LATE_UPGRADE_IDS,
  LATE_UPGRADES,
  MAX_LATE_UPGRADES,
  type LateUpgradeDef,
  type LateUpgradeId
} from './lateUpgrades';

export type EnemyKind =
  | 'beetle'
  | 'bat'
  | 'spore'
  | 'slime'
  | 'wisp'
  | 'bomber'
  | 'sunder'
  | 'thunder'
  | 'arbiter'
  | 'sentry'
  | 'phase'
  | 'core'
  | 'seer'
  | 'source';

export interface EnemySpec {
  name: string;
  rule: RuleKey;
  ruleName: string;
  hint: string;
  hp: number;
  radius: number;
  speed: number;
  sprite: string;
  displaySize: number;
  elite?: boolean;
  boss?: boolean;
}

export const ENEMY_SPECS: Record<EnemyKind, EnemySpec> = {
  beetle: {
    name: '铁刺甲虫',
    rule: 'pierce',
    ruleName: '贯穿',
    hint: '预警冲锋 · 接触伤害',
    hp: 72,
    radius: 34,
    speed: 68,
    sprite: 'beetle',
    displaySize: 96
  },
  bat: {
    name: '雷光蝠',
    rule: 'chain',
    ruleName: '弹射',
    hint: '远程雷击 · 保持距离',
    hp: 46,
    radius: 24,
    speed: 58,
    sprite: 'bat',
    displaySize: 150
  },
  spore: {
    name: '孢子花',
    rule: 'spread',
    ruleName: '散射',
    hint: '固定不动 · 扇形孢子弹幕',
    hp: 58,
    radius: 30,
    speed: 22,
    sprite: 'spore',
    displaySize: 104
  },
  slime: {
    name: '灼焰史莱姆',
    rule: 'burn',
    ruleName: '燃烧',
    hint: '贴身追击 · 灼烧地面',
    hp: 64,
    radius: 30,
    speed: 54,
    sprite: 'slime',
    displaySize: 100
  },
  wisp: {
    name: '寒霜浮灵',
    rule: 'frost',
    ruleName: '冰霜',
    hint: '远程减速弹 · 保持距离',
    hp: 40,
    radius: 24,
    speed: 64,
    sprite: 'wisp',
    displaySize: 104
  },
  bomber: {
    name: '爆裂甲虫',
    rule: 'blast',
    ruleName: '爆裂',
    hint: '贴身自爆 · 死亡爆炸',
    hp: 52,
    radius: 28,
    speed: 82,
    sprite: 'bomber',
    displaySize: 92
  },
  sunder: {
    name: '裂甲精英',
    rule: 'pierce',
    ruleName: '贯穿',
    hint: '精英 · 连续两次冲锋',
    hp: 320,
    radius: 46,
    speed: 76,
    sprite: 'beetle',
    displaySize: 136,
    elite: true
  },
  thunder: {
    name: '雷暴精英',
    rule: 'chain',
    ruleName: '弹射',
    hint: '精英 · 三道锁定雷击',
    hp: 260,
    radius: 34,
    speed: 62,
    sprite: 'bat',
    displaySize: 200,
    elite: true
  },
  arbiter: {
    name: '规则审判者',
    rule: 'blast',
    ruleName: '审判',
    hint: '最终 BOSS · 三阶段',
    hp: 1800,
    radius: 62,
    speed: 74,
    sprite: 'boss',
    displaySize: 300,
    elite: true,
    boss: true
  },
  sentry: {
    name: '激光炮台',
    rule: 'chain',
    ruleName: '雷射',
    hint: '固定炮台 · 蓄力射线',
    hp: 58,
    radius: 28,
    speed: 0,
    sprite: 'spore',
    displaySize: 110
  },
  phase: {
    name: '相位机兵',
    rule: 'pierce',
    ruleName: '贯穿',
    hint: '瞬移贴近 · 预警冲锋',
    hp: 66,
    radius: 28,
    speed: 66,
    sprite: 'wisp',
    displaySize: 118
  },
  core: {
    name: '失序核心',
    rule: 'blast',
    ruleName: '失序',
    hint: '第二世界 BOSS · 改变安全地面',
    hp: 1350,
    radius: 64,
    speed: 0,
    sprite: 'boss',
    displaySize: 288,
    elite: true,
    boss: true
  },
  seer: {
    name: '逆律先知',
    rule: 'frost',
    ruleName: '逆律',
    hint: '精英 · 瞬移与虚空领域',
    hp: 320,
    radius: 38,
    speed: 70,
    sprite: 'wisp',
    displaySize: 168,
    elite: true
  },
  source: {
    name: '规则之源',
    rule: 'blast',
    ruleName: '源律',
    hint: '最终 BOSS · 三阶段规则风暴',
    hp: 2200,
    radius: 66,
    speed: 0,
    sprite: 'boss',
    displaySize: 312,
    elite: true,
    boss: true
  }
};

export const ENEMY_RULES: Record<EnemyKind, RuleKey> = Object.fromEntries(
  (Object.keys(ENEMY_SPECS) as EnemyKind[]).map((kind) => [kind, ENEMY_SPECS[kind].rule])
) as Record<EnemyKind, RuleKey>;

export type RoomHazard = 'shock-grid' | 'void-rift';
export type RoomModifier = 'rule-null';

export interface RoomDef {
  id: string;
  name: string;
  en: string;
  subtitle: string;
  quota: number;
  maxAlive: number;
  spawnInterval: number;
  mix: { kind: EnemyKind; weight: number }[];
  leader?: EnemyKind;
  boss?: EnemyKind;
  rewardCount?: number;
  elite?: boolean;
  hazard?: RoomHazard;
  modifier?: RoomModifier;
}

export const ROOMS: readonly RoomDef[] = [
  {
    id: 'antechamber',
    name: '训戒前庭',
    en: 'ANTECHAMBER',
    subtitle: '规则在这里第一次被教导，也第一次被夺走。',
    quota: 13,
    maxAlive: 5,
    spawnInterval: 3.0,
    mix: [{ kind: 'beetle', weight: 1 }]
  },
  {
    id: 'ember-nursery',
    name: '余烬苗圃',
    en: 'EMBER NURSERY',
    subtitle: '史莱姆走过的地方会留下火焰，别把自己逼进角落。',
    quota: 20,
    maxAlive: 6,
    spawnInterval: 2.8,
    mix: [
      { kind: 'slime', weight: 7 },
      { kind: 'beetle', weight: 3 }
    ]
  },
  {
    id: 'spore-vault',
    name: '孢子温室',
    en: 'SPORE VAULT',
    subtitle: '孢子花不会追你，但它的扇形弹幕会封死正面。',
    quota: 22,
    maxAlive: 7,
    spawnInterval: 2.6,
    mix: [
      { kind: 'spore', weight: 6 },
      { kind: 'slime', weight: 4 }
    ]
  },
  {
    id: 'echo-gallery',
    name: '回声回廊',
    en: 'ECHO GALLERY',
    subtitle: '雷光与霜冻交替，被减速时就很难再躲开雷击。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'bat', weight: 6 },
      { kind: 'wisp', weight: 4 }
    ]
  },
  {
    id: 'bone-gallery',
    name: '蚀骨回廊',
    en: 'BONE GALLERY',
    subtitle: '骨梁上挂着会爆炸的茧，别在下面停留。',
    quota: 22,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'bat', weight: 6 },
      { kind: 'bomber', weight: 4 }
    ]
  },
  {
    id: 'ember-rift',
    name: '灼热裂隙',
    en: 'EMBER RIFT',
    subtitle: '地面在缓慢燃烧，站得越久越危险。',
    quota: 22,
    maxAlive: 7,
    spawnInterval: 2.5,
    mix: [
      { kind: 'slime', weight: 6 },
      { kind: 'bomber', weight: 4 }
    ]
  },
  {
    id: 'mycelium-hall',
    name: '菌毯回廊',
    en: 'MYCELIUM HALL',
    subtitle: '孢子与霜冻一起飘，正面推进会付出代价。',
    quota: 22,
    maxAlive: 8,
    spawnInterval: 2.5,
    mix: [
      { kind: 'spore', weight: 7 },
      { kind: 'wisp', weight: 3 }
    ]
  },
  {
    id: 'cinder-court',
    name: '焦土庭院',
    en: 'CINDER COURT',
    subtitle: '霜灵在焦土上徘徊，甲虫在等你露出破绽。',
    quota: 22,
    maxAlive: 7,
    spawnInterval: 2.4,
    mix: [
      { kind: 'beetle', weight: 4 },
      { kind: 'wisp', weight: 6 }
    ]
  },
  {
    id: 'frostbone-gallery',
    name: '霜骨回廊',
    en: 'FROSTBONE GALLERY',
    subtitle: '霜灵在骨柱间穿行，爆裂甲虫负责把你逼出掩体。',
    quota: 22,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'wisp', weight: 6 },
      { kind: 'bomber', weight: 4 }
    ]
  },
  {
    id: 'slag-yard',
    name: '熔渣庭院',
    en: 'SLAG YARD',
    subtitle: '熔渣没过脚踝，史莱姆与甲虫都不打算让你停下。',
    quota: 22,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'slime', weight: 6 },
      { kind: 'beetle', weight: 6 }
    ]
  },
  {
    id: 'echo-vault',
    name: '残响回廊',
    en: 'ECHO VAULT',
    subtitle: '雷光在穹顶反弹，史莱姆在下方慢慢逼近。',
    quota: 22,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'bat', weight: 6 },
      { kind: 'slime', weight: 4 }
    ]
  },
  {
    id: 'frost-court',
    name: '凛冬庭院',
    en: 'FROST COURT',
    subtitle: '霜灵与史莱姆共享这片冻土，减速之后就是灼烧。',
    quota: 22,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'wisp', weight: 6 },
      { kind: 'slime', weight: 6 }
    ]
  },
  {
    id: 'ash-gallery',
    name: '灰烬回廊',
    en: 'ASH GALLERY',
    subtitle: '焦黑的梁柱下，爆裂甲虫与铁刺甲虫轮番逼近。',
    quota: 22,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'bomber', weight: 6 },
      { kind: 'beetle', weight: 6 }
    ]
  },
  {
    id: 'sunder-pit',
    name: '裂甲竞技场',
    en: 'SUNDER PIT',
    subtitle: '裂甲精英会连续冲锋两次，第二次还会追着你的方向。',
    quota: 16,
    maxAlive: 6,
    spawnInterval: 2.6,
    mix: [
      { kind: 'beetle', weight: 4 },
      { kind: 'bomber', weight: 3 }
    ],
    leader: 'sunder',
    rewardCount: 4,
    elite: true
  },
  {
    id: 'thunder-altar',
    name: '雷暴祭坛',
    en: 'THUNDER ALTAR',
    subtitle: '雷暴精英锁定你之后会连开三道雷击，别停在原地。',
    quota: 16,
    maxAlive: 7,
    spawnInterval: 2.3,
    mix: [
      { kind: 'bat', weight: 4 },
      { kind: 'wisp', weight: 3 }
    ],
    leader: 'thunder',
    rewardCount: 4,
    elite: true
  },
  {
    id: 'judgement-hall',
    name: '审判庭',
    en: 'JUDGEMENT HALL',
    subtitle: '规则审判者不会抢夺你的规则，它会审判你如何使用它们。',
    quota: 1,
    maxAlive: 2,
    spawnInterval: 99,
    mix: [],
    boss: 'arbiter',
    rewardCount: 0
  },
  {
    id: 'workshop-gate',
    name: '装配门厅',
    en: 'ASSEMBLY GATE',
    subtitle: '炮台已经校准完毕，它们不会追你，但会封死直线。',
    quota: 18,
    maxAlive: 6,
    spawnInterval: 2.8,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'beetle', weight: 3 }
    ],
    hazard: 'shock-grid'
  },
  {
    id: 'conveyor-hall',
    name: '传送带大厅',
    en: 'CONVEYOR HALL',
    subtitle: '地面会周期性放电，安全站位每隔几秒就会消失一次。',
    quota: 22,
    maxAlive: 7,
    spawnInterval: 2.6,
    mix: [
      { kind: 'phase', weight: 5 },
      { kind: 'sentry', weight: 4 }
    ],
    hazard: 'shock-grid'
  },
  {
    id: 'furnace-line',
    name: '熔炉流水线',
    en: 'FURNACE LINE',
    subtitle: '相位机兵会绕过你的射程，熔炉地面却不允许你停下。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.5,
    mix: [
      { kind: 'phase', weight: 4 },
      { kind: 'slime', weight: 5 }
    ],
    hazard: 'shock-grid'
  },
  {
    id: 'shield-bay',
    name: '护盾舱',
    en: 'SHIELD BAY',
    subtitle: '世律守卫守着旧工坊的最后一层护盾，炮台会替它争取时间。',
    quota: 16,
    maxAlive: 6,
    spawnInterval: 2.6,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'phase', weight: 3 }
    ],
    leader: 'sunder',
    rewardCount: 4,
    elite: true
  },
  {
    id: 'archive',
    name: '废弃档案库',
    en: 'ABANDONED ARCHIVE',
    subtitle: '孢子与炮台共享同一条供能线路，先拆哪一个都会改变弹幕密度。',
    quota: 22,
    maxAlive: 8,
    spawnInterval: 2.5,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'spore', weight: 4 }
    ]
  },
  {
    id: 'assembly-line',
    name: '总装线',
    en: 'ASSEMBLY LINE',
    subtitle: '传送带、炮台与自爆机械同时运转，安全区只会越来越窄。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'phase', weight: 5 },
      { kind: 'sentry', weight: 3 },
      { kind: 'bomber', weight: 2 }
    ],
    hazard: 'shock-grid'
  },
  {
    id: 'scrap-yard',
    name: '废料场',
    en: 'SCRAP YARD',
    subtitle: '自爆机械从废料堆里爬出来，相位机兵负责把你赶回它们中间。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'bomber', weight: 5 },
      { kind: 'phase', weight: 4 }
    ]
  },
  {
    id: 'core-approach',
    name: '核心回廊',
    en: 'CORE APPROACH',
    subtitle: '失序核心的供能脉冲已经开始泄漏，地面没有一块是真正安全的。',
    quota: 26,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'phase', weight: 4 }
    ],
    hazard: 'shock-grid'
  },
  {
    id: 'relay-tower',
    name: '中继塔',
    en: 'RELAY TOWER',
    subtitle: '炮台通过中继塔共享射界，先拆塔还是先躲线由你决定。',
    quota: 22,
    maxAlive: 7,
    spawnInterval: 2.5,
    mix: [
      { kind: 'sentry', weight: 5 },
      { kind: 'bat', weight: 4 }
    ]
  },
  {
    id: 'piston-yard',
    name: '活塞场',
    en: 'PISTON YARD',
    subtitle: '相位机兵在活塞之间穿梭，冲锋预警只给你半秒。',
    quota: 23,
    maxAlive: 8,
    spawnInterval: 2.45,
    mix: [
      { kind: 'phase', weight: 5 },
      { kind: 'beetle', weight: 3 }
    ]
  },
  {
    id: 'coolant-vault',
    name: '冷却库',
    en: 'COOLANT VAULT',
    subtitle: '冷却液导电，霜灵会让你的撤离路线变得更慢。',
    quota: 23,
    maxAlive: 8,
    spawnInterval: 2.45,
    mix: [
      { kind: 'wisp', weight: 5 },
      { kind: 'sentry', weight: 4 }
    ],
    hazard: 'shock-grid'
  },
  {
    id: 'boiler-room',
    name: '锅炉房',
    en: 'BOILER ROOM',
    subtitle: '熔炉与相位机兵轮流逼近，地面放电从不停工。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'slime', weight: 5 },
      { kind: 'phase', weight: 4 }
    ],
    hazard: 'shock-grid'
  },
  {
    id: 'control-deck',
    name: '控制甲板',
    en: 'CONTROL DECK',
    subtitle: '炮台与相位机兵共用一套指挥链，清场顺序决定火力密度。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.35,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'phase', weight: 4 }
    ]
  },
  {
    id: 'core-chamber',
    name: '失序核心',
    en: 'DISORDER CORE',
    subtitle: '失序核心不追击，它只会重写地面：安全区会按它的节奏消失。',
    quota: 1,
    maxAlive: 3,
    spawnInterval: 99,
    mix: [],
    boss: 'core',
    rewardCount: 0
  },
  {
    id: 'abyss-gate',
    name: '深渊入口',
    en: 'ABYSS GATE',
    subtitle: '规则在这里开始反向生效，先确认你还能用哪一条。',
    quota: 20,
    maxAlive: 7,
    spawnInterval: 2.7,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'phase', weight: 3 }
    ],
    hazard: 'void-rift',
    modifier: 'rule-null'
  },
  {
    id: 'mirror-hall',
    name: '镜像回廊',
    en: 'MIRROR HALL',
    subtitle: '相位机兵复制你的走位，逆律会短暂让一条规则离线。',
    quota: 23,
    maxAlive: 8,
    spawnInterval: 2.5,
    mix: [
      { kind: 'phase', weight: 4 },
      { kind: 'wisp', weight: 4 }
    ],
    modifier: 'rule-null'
  },
  {
    id: 'null-chapel',
    name: '虚无法坛',
    en: 'NULL CHAPEL',
    subtitle: '虚空裂隙会吞掉安全地面，炮台只需要逼你走进去。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.45,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'spore', weight: 3 }
    ],
    hazard: 'void-rift'
  },
  {
    id: 'inverted-yard',
    name: '逆序庭院',
    en: 'INVERTED YARD',
    subtitle: '规则逆流时，自爆机械的逼近会比你的闪避更快。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.45,
    mix: [
      { kind: 'bomber', weight: 4 },
      { kind: 'phase', weight: 4 }
    ],
    modifier: 'rule-null'
  },
  {
    id: 'rift-corridor',
    name: '裂隙走廊',
    en: 'RIFT CORRIDOR',
    subtitle: '脚下随时会出现虚空裂隙，炮台负责封住唯一的安全路线。',
    quota: 25,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'phase', weight: 4 }
    ],
    hazard: 'void-rift'
  },
  {
    id: 'seer-arena',
    name: '先知竞技场',
    en: 'SEER ARENA',
    subtitle: '逆律先知会瞬移、召唤虚空领域，并让一条规则短暂失效。',
    quota: 16,
    maxAlive: 6,
    spawnInterval: 2.6,
    mix: [
      { kind: 'phase', weight: 4 },
      { kind: 'wisp', weight: 3 }
    ],
    leader: 'seer',
    rewardCount: 4,
    elite: true,
    modifier: 'rule-null'
  },
  {
    id: 'echo-abyss',
    name: '回声深渊',
    en: 'ECHO ABYSS',
    subtitle: '深渊会重复你上一次的攻击节奏，相位机兵在回声里换位。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'phase', weight: 5 },
      { kind: 'bomber', weight: 3 }
    ]
  },
  {
    id: 'broken-throne',
    name: '破碎王座',
    en: 'BROKEN THRONE',
    subtitle: '王座周围没有规则，只有不断逼近的自爆机械。',
    quota: 25,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'bomber', weight: 5 },
      { kind: 'sentry', weight: 3 }
    ],
    modifier: 'rule-null'
  },
  {
    id: 'void-works',
    name: '虚空工坊',
    en: 'VOID WORKS',
    subtitle: '虚空裂隙与相位机兵共享同一片地面，停下就会失去站位。',
    quota: 25,
    maxAlive: 8,
    spawnInterval: 2.35,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'phase', weight: 4 }
    ],
    hazard: 'void-rift'
  },
  {
    id: 'shadow-vault',
    name: '暗影库',
    en: 'SHADOW VAULT',
    subtitle: '暗影库里的规则会被短暂抽离，先想好失去哪一条还能打。',
    quota: 24,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'phase', weight: 5 },
      { kind: 'wisp', weight: 3 }
    ],
    modifier: 'rule-null'
  },
  {
    id: 'last-approach',
    name: '最终回廊',
    en: 'LAST APPROACH',
    subtitle: '规则之源就在前方，虚空裂隙开始覆盖整条回廊。',
    quota: 27,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'phase', weight: 4 },
      { kind: 'sentry', weight: 4 }
    ],
    hazard: 'void-rift'
  },
  {
    id: 'lawless-span',
    name: '无法之桥',
    en: 'LAWLESS SPAN',
    subtitle: '桥上没有任何规则保护你，只有虚空裂隙和自爆机械。',
    quota: 26,
    maxAlive: 8,
    spawnInterval: 2.35,
    mix: [
      { kind: 'bomber', weight: 4 },
      { kind: 'phase', weight: 4 }
    ],
    hazard: 'void-rift'
  },
  {
    id: 'final-gate',
    name: '终局之门',
    en: 'FINAL GATE',
    subtitle: '最后一层逆律：地面、规则与敌人都不会再保持稳定。',
    quota: 27,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'sentry', weight: 4 },
      { kind: 'phase', weight: 4 },
      { kind: 'bomber', weight: 2 }
    ],
    hazard: 'void-rift',
    modifier: 'rule-null'
  },
  {
    id: 'source-chamber',
    name: '规则之源',
    en: 'SOURCE OF RULES',
    subtitle: '规则之源不守护任何一条规则，它只会让所有规则同时失控。',
    quota: 1,
    maxAlive: 3,
    spawnInterval: 99,
    mix: [],
    boss: 'source',
    rewardCount: 0
  }
] as const;

export function getRoomRuleKeys(room: RoomDef): RuleKey[] {
  const keys = new Set<RuleKey>();
  for (const entry of room.mix) {
    keys.add(ENEMY_SPECS[entry.kind].rule);
  }
  if (room.leader) keys.add(ENEMY_SPECS[room.leader].rule);
  return [...keys];
}

export function getRoomEnemyKinds(room: RoomDef): EnemyKind[] {
  const kinds = room.mix.map((entry) => entry.kind);
  if (room.leader && !kinds.includes(room.leader)) kinds.push(room.leader);
  if (room.boss && !kinds.includes(room.boss)) kinds.push(room.boss);
  return kinds;
}

export function pickSpawnKind(room: RoomDef, random: () => number = Math.random): EnemyKind {
  const total = room.mix.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of room.mix) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return room.mix[room.mix.length - 1].kind;
}

export type SupportId = 'max-hp' | 'heal' | 'dash' | 'speed';

export interface SupportDef {
  id: SupportId;
  name: string;
  icon: string;
  description: string;
  detail: string;
}

export const SUPPORTS: Record<SupportId, SupportDef> = {
  'max-hp': {
    id: 'max-hp',
    name: '规则韧性',
    icon: '#i-heart',
    description: '生命上限 +20，并立即回复 20 生命。',
    detail: '上限提高后，后续恢复也会更值钱。'
  },
  heal: {
    id: 'heal',
    name: '碎片缝合',
    icon: '#i-shard',
    description: '立即回复 45 生命，不占用规则槽。',
    detail: '在房间之间补状态，比多一条规则更能救急。'
  },
  dash: {
    id: 'dash',
    name: '瞬时折叠',
    icon: '#i-dash',
    description: '闪避冷却 -0.8 秒（最低 1.5 秒）。',
    detail: '更频繁的位移，等于更少的硬吃伤害。'
  },
  speed: {
    id: 'speed',
    name: '轻装疾行',
    icon: '#i-arrow',
    description: '移动速度 +8%（可叠加）。',
    detail: '走位空间本身也是一种防御。'
  }
};

const SUPPORT_IDS: SupportId[] = ['max-hp', 'heal', 'dash', 'speed'];

export type Reward =
  | { kind: 'rule'; offer: RuleOffer }
  | { kind: 'support'; support: SupportDef }
  | { kind: 'mutation'; mutation: MutationDef }
  | { kind: 'relic'; relic: RelicDef }
  | { kind: 'ascension'; ascension: AscensionDef }
  | { kind: 'late'; upgrade: LateUpgradeDef };

export interface RoomPreview {
  index: number;
  total: number;
  room: RoomDef;
  hp: number;
  maxHp: number;
  kills: number;
  elapsed: number;
  build: PlayerBuild;
}

export interface RoomCleared {
  index: number;
  total: number;
  room: RoomDef;
  kills: number;
  elapsed: number;
  rewards: Reward[];
  rewardLabel?: string;
  chapterReward?: boolean;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildRoomRewards(
  build: PlayerBuild,
  room: RoomDef,
  random: () => number = Math.random,
  options: {
    hasMutation?: boolean;
    bonusCards?: number;
    lateEligible?: boolean;
    lateUpgrades?: readonly LateUpgradeId[];
  } = {}
): Reward[] {
  const pool = getRoomRuleKeys(room);
  const count = (room.rewardCount ?? 3) + (options.bonusCards ?? 0);
  const rewards: Reward[] = [];

  if (room.elite && !options.hasMutation) {
    const mutationId = MUTATION_IDS[Math.floor(random() * MUTATION_IDS.length)] ?? 'overload';
    rewards.push({ kind: 'mutation', mutation: MUTATIONS[mutationId] });
  }

  const ruleOffers = getRuleOffers(build, random, pool).slice(0, 2);
  for (const offer of ruleOffers) {
    if (rewards.length >= count) break;
    rewards.push({ kind: 'rule', offer });
  }

  const ownedLate = options.lateUpgrades ?? [];
  if (
    options.lateEligible &&
    ownedLate.length < MAX_LATE_UPGRADES &&
    rewards.length < count
  ) {
    const latePool = shuffle(
      LATE_UPGRADE_IDS.filter((id) => !ownedLate.includes(id)).map((id) => LATE_UPGRADES[id]),
      random
    );
    if (latePool[0]) rewards.push({ kind: 'late', upgrade: latePool[0] });
  }

  const supports = shuffle(SUPPORT_IDS, random).map((id) => SUPPORTS[id]);
  let cursor = 0;
  while (rewards.length < count && cursor < supports.length) {
    rewards.push({ kind: 'support', support: supports[cursor] });
    cursor += 1;
  }
  return rewards;
}

export function buildChapterRewards(
  build: PlayerBuild,
  relics: readonly RelicId[],
  random: () => number = Math.random,
  options: {
    unlockedRelics?: readonly RelicId[];
    unlockedAscensions?: readonly AscensionId[];
    lateEligible?: boolean;
    lateUpgrades?: readonly LateUpgradeId[];
  } = {}
): Reward[] {
  const rewards: Reward[] = [];
  const unlockedRelics = options.unlockedRelics ?? RELIC_IDS;
  const unlockedAscensions = new Set(options.unlockedAscensions ?? ASCENSION_IDS);
  const ascensions = [build.trajectory, build.impact, build.secondary ?? null]
    .map((ref) =>
      ref && ref.level === 3 && !ref.ascended ? getAscensionForRule(ref.key) : null
    )
    .filter(
      (entry): entry is AscensionDef =>
        entry !== null && unlockedAscensions.has(entry.id)
    );
  const ascensionPool = shuffle(ascensions, random);
  if (ascensionPool[0]) {
    rewards.push({ kind: 'ascension', ascension: ascensionPool[0] });
  }

  if (relics.length < MAX_RELICS) {
    const relicPool = shuffle(
      RELIC_IDS.filter((id) => !relics.includes(id) && unlockedRelics.includes(id)).map(
        (id) => RELICS[id]
      ),
      random
    );
    for (const relic of relicPool.slice(0, 1 + (rewards.length === 0 ? 1 : 0))) {
      rewards.push({ kind: 'relic', relic });
    }
  }

  if (ascensionPool[1] && rewards.length < 3 && relics.length >= MAX_RELICS) {
    rewards.push({ kind: 'ascension', ascension: ascensionPool[1] });
  }

  const ownedLate = options.lateUpgrades ?? [];
  if (
    options.lateEligible &&
    ownedLate.length < MAX_LATE_UPGRADES &&
    rewards.length < 3
  ) {
    const latePool = shuffle(
      LATE_UPGRADE_IDS.filter((id) => !ownedLate.includes(id)).map((id) => LATE_UPGRADES[id]),
      random
    );
    if (latePool[0]) rewards.push({ kind: 'late', upgrade: latePool[0] });
  }

  const supports = shuffle(SUPPORT_IDS, random).map((id) => SUPPORTS[id]);
  let cursor = 0;
  while (rewards.length < 3 && cursor < supports.length) {
    rewards.push({ kind: 'support', support: supports[cursor] });
    cursor += 1;
  }
  return rewards.slice(0, 3);
}
