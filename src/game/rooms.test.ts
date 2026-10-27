import { describe, expect, it } from 'vitest';
import { createEmptyBuild, getRuleOffers } from './rules';
import {
  ENEMY_RULES,
  ENEMY_SPECS,
  ROOMS,
  SUPPORTS,
  buildRoomRewards,
  getRoomEnemyKinds,
  getRoomRuleKeys,
  pickSpawnKind,
  type EnemyKind
} from './rooms';

const random = () => 0.37;

describe('enemy catalogue', () => {
  it('maps all six normal enemies to the six rules', () => {
    const normals: EnemyKind[] = ['beetle', 'bat', 'spore', 'slime', 'wisp', 'bomber'];
    const rules = new Set(normals.map((kind) => ENEMY_RULES[kind]));
    expect(rules.size).toBe(6);
    expect(ENEMY_RULES.beetle).toBe('pierce');
    expect(ENEMY_RULES.bat).toBe('chain');
    expect(ENEMY_RULES.spore).toBe('spread');
    expect(ENEMY_RULES.slime).toBe('burn');
    expect(ENEMY_RULES.wisp).toBe('frost');
    expect(ENEMY_RULES.bomber).toBe('blast');
  });

  it('marks exactly three elites, all carrying a normal rule', () => {
    const elites = (Object.keys(ENEMY_SPECS) as EnemyKind[]).filter(
      (kind) => ENEMY_SPECS[kind].elite && !ENEMY_SPECS[kind].boss
    );
    expect(elites).toEqual(['sunder', 'thunder', 'seer']);
    expect(ENEMY_RULES.sunder).toBe('pierce');
    expect(ENEMY_RULES.thunder).toBe('chain');
    expect(ENEMY_RULES.seer).toBe('frost');
  });

  it('elites are tougher and larger than their base enemies', () => {
    expect(ENEMY_SPECS.sunder.hp).toBeGreaterThan(ENEMY_SPECS.beetle.hp * 3);
    expect(ENEMY_SPECS.sunder.displaySize).toBeGreaterThan(ENEMY_SPECS.beetle.displaySize);
    expect(ENEMY_SPECS.thunder.hp).toBeGreaterThan(ENEMY_SPECS.bat.hp * 3);
    expect(ENEMY_SPECS.thunder.displaySize).toBeGreaterThan(ENEMY_SPECS.bat.displaySize);
  });
});

describe('room definitions', () => {
  it('ships forty-four rooms with rising pressure', () => {
    expect(ROOMS).toHaveLength(44);
    expect(ROOMS.map((room) => room.quota)).toEqual([
      13, 20, 22, 24, 22, 22, 22, 22, 22, 22, 22, 22, 22, 16, 16, 1, 18, 22, 24, 16, 22, 24, 24,
      26, 22, 23, 23, 24, 24, 1, 20, 23, 24, 24, 25, 16, 24, 25, 25, 24, 27, 26, 27, 1
    ]);
    expect(ROOMS[0].maxAlive).toBeLessThan(ROOMS[3].maxAlive);
  });

  it('ends with the source of rules boss room', () => {
    const bossRoom = ROOMS[ROOMS.length - 1];
    expect(bossRoom.boss).toBe('source');
    expect(bossRoom.quota).toBe(1);
    expect(bossRoom.mix).toHaveLength(0);
    expect(getRoomEnemyKinds(bossRoom)).toEqual(['source']);
    expect(buildRoomRewards(createEmptyBuild(), bossRoom, random)).toHaveLength(0);
  });

  it('every non-boss room lists a positive enemy mix', () => {
    for (const room of ROOMS.filter((item) => !item.boss)) {
      expect(room.mix.length).toBeGreaterThan(0);
      for (const entry of room.mix) {
        expect(entry.weight).toBeGreaterThan(0);
      }
    }
  });

  it('covers all six playable rules across the run', () => {
    const rules = new Set(
      ROOMS.filter((room) => !room.boss).flatMap((room) => getRoomRuleKeys(room))
    );
    expect(rules.size).toBe(6);
  });

  it('derives each room rule pool from its real enemies', () => {
    const byId = (id: string) => ROOMS.find((room) => room.id === id)!;
    expect(getRoomRuleKeys(byId('antechamber'))).toEqual(['pierce']);
    expect(new Set(getRoomRuleKeys(byId('ember-nursery')))).toEqual(new Set(['pierce', 'burn']));
    expect(new Set(getRoomRuleKeys(byId('spore-vault')))).toEqual(new Set(['spread', 'burn']));
    expect(new Set(getRoomRuleKeys(byId('echo-gallery')))).toEqual(new Set(['chain', 'frost']));
    expect(new Set(getRoomRuleKeys(byId('sunder-pit')))).toEqual(new Set(['pierce', 'blast']));
  });

  it('elite rooms declare a leader and four reward choices', () => {
    const eliteRooms = ROOMS.filter((room) => room.elite);
    expect(eliteRooms).toHaveLength(4);
    for (const room of eliteRooms) {
      expect(room.leader).toBeDefined();
      expect(room.rewardCount).toBe(4);
      expect(getRoomEnemyKinds(room)).toContain(room.leader);
    }
  });

  it('gives the workshop its own shock-grid hazard rooms', () => {
    const hazardRooms = ROOMS.filter((room) => room.hazard === 'shock-grid');
    expect(hazardRooms.map((room) => room.id)).toEqual([
      'workshop-gate',
      'conveyor-hall',
      'furnace-line',
      'assembly-line',
      'core-approach',
      'coolant-vault',
      'boiler-room'
    ]);
    for (const room of hazardRooms) {
      expect(room.boss).toBeUndefined();
      expect(room.mix.length).toBeGreaterThan(0);
    }
  });

  it('gives the abyss void-rift hazards and rule-null modifiers', () => {
    const voidRooms = ROOMS.filter((room) => room.hazard === 'void-rift');
    expect(voidRooms.map((room) => room.id)).toEqual([
      'abyss-gate',
      'null-chapel',
      'rift-corridor',
      'void-works',
      'last-approach',
      'lawless-span',
      'final-gate'
    ]);
    const nullRooms = ROOMS.filter((room) => room.modifier === 'rule-null');
    expect(nullRooms.map((room) => room.id)).toEqual([
      'abyss-gate',
      'mirror-hall',
      'inverted-yard',
      'seer-arena',
      'broken-throne',
      'shadow-vault',
      'final-gate'
    ]);
  });

  it('non-elite rooms keep the standard three choices', () => {
    for (const room of ROOMS.filter((item) => !item.elite && !item.boss)) {
      expect(room.leader).toBeUndefined();
      expect(room.rewardCount).toBeUndefined();
    }
  });

  it('picks spawn kinds according to weights', () => {
    const mixed = ROOMS[1];
    const kinds: EnemyKind[] = [];
    for (let i = 0; i < 40; i += 1) {
      kinds.push(pickSpawnKind(mixed, () => i / 40));
    }
    expect(new Set(kinds).size).toBe(2);
    expect(kinds.filter((kind) => kind === 'slime').length).toBeGreaterThan(
      kinds.filter((kind) => kind === 'beetle').length
    );
  });

  it('never spawns outside the room mix', () => {
    const single = { ...ROOMS[0], mix: [{ kind: 'beetle' as const, weight: 1 }] };
    for (let i = 0; i < 10; i += 1) {
      expect(pickSpawnKind(single, () => i / 10)).toBe('beetle');
    }
  });
});

describe('room rewards', () => {
  it('offers three rewards in normal rooms', () => {
    expect(buildRoomRewards(createEmptyBuild(), ROOMS[0], random)).toHaveLength(3);
  });

  it('offers four rewards in elite rooms', () => {
    for (const room of ROOMS.filter((item) => item.elite)) {
      expect(buildRoomRewards(createEmptyBuild(), room, random)).toHaveLength(4);
    }
  });

  it('elite rooms guarantee a mutation until one is equipped', () => {
    const elite = ROOMS.find((room) => room.elite)!;
    const rewards = buildRoomRewards(createEmptyBuild(), elite, random);
    expect(rewards.filter((reward) => reward.kind === 'mutation')).toHaveLength(1);
    const withMutation = buildRoomRewards(createEmptyBuild(), elite, random, { hasMutation: true });
    expect(withMutation.some((reward) => reward.kind === 'mutation')).toBe(false);
    expect(withMutation).toHaveLength(4);
  });

  it('normal rooms never offer mutations', () => {
    for (const room of ROOMS.filter((item) => !item.elite)) {
      const rewards = buildRoomRewards(createEmptyBuild(), room, random);
      expect(rewards.some((reward) => reward.kind === 'mutation')).toBe(false);
    }
  });

  it('only offers rules carried by the room enemies', () => {
    for (const room of ROOMS) {
      const rewards = buildRoomRewards(createEmptyBuild(), room, random);
      const allowed = new Set(getRoomRuleKeys(room));
      for (const reward of rewards) {
        if (reward.kind === 'rule') {
          expect(allowed.has(reward.offer.key)).toBe(true);
        }
      }
    }
  });

  it('never offers more than two rule rewards', () => {
    for (const room of ROOMS) {
      const rewards = buildRoomRewards(createEmptyBuild(), room, random);
      expect(rewards.filter((reward) => reward.kind === 'rule').length).toBeLessThanOrEqual(2);
    }
  });

  it('fills the rest with unique supports', () => {
    const rewards = buildRoomRewards(createEmptyBuild(), ROOMS[0], random);
    const supports = rewards.filter((reward) => reward.kind === 'support');
    expect(supports.length).toBeGreaterThan(0);
    const ids = supports.map((reward) => (reward.kind === 'support' ? reward.support.id : ''));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(SUPPORTS[id as keyof typeof SUPPORTS]).toBeDefined();
    }
  });

  it('a maxed build only receives supports', () => {
    const maxed = {
      trajectory: { key: 'chain' as const, level: 3 as const },
      impact: { key: 'frost' as const, level: 3 as const }
    };
    const rewards = buildRoomRewards(maxed, ROOMS[3], random);
    expect(rewards.every((reward) => reward.kind === 'support')).toBe(true);
    expect(rewards).toHaveLength(3);
  });

  it('respects a restricted rule pool', () => {
    const offers = getRuleOffers(createEmptyBuild(), random, ['blast']);
    expect(offers).toHaveLength(1);
    expect(offers[0].key).toBe('blast');
  });

  it('an empty pool falls back to all rules', () => {
    const offers = getRuleOffers(createEmptyBuild(), random, []);
    expect(offers.length).toBeGreaterThan(1);
  });

  it('rule rewards are equip/upgrade ready', () => {
    const rewards = buildRoomRewards(createEmptyBuild(), ROOMS[0], random);
    const rule = rewards.find((reward) => reward.kind === 'rule');
    expect(rule).toBeDefined();
    if (rule?.kind === 'rule') {
      expect(rule.offer.action).toBe('equip');
      expect(rule.offer.nextLevel).toBe(1);
      expect(rule.offer.key).toBe('pierce');
    }
  });
});
