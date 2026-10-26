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

  it('marks exactly two elites, both carrying a normal rule', () => {
    const elites = (Object.keys(ENEMY_SPECS) as EnemyKind[]).filter(
      (kind) => ENEMY_SPECS[kind].elite
    );
    expect(elites).toEqual(['sunder', 'thunder']);
    expect(ENEMY_RULES.sunder).toBe('pierce');
    expect(ENEMY_RULES.thunder).toBe('chain');
  });

  it('elites are tougher and larger than their base enemies', () => {
    expect(ENEMY_SPECS.sunder.hp).toBeGreaterThan(ENEMY_SPECS.beetle.hp * 3);
    expect(ENEMY_SPECS.sunder.displaySize).toBeGreaterThan(ENEMY_SPECS.beetle.displaySize);
    expect(ENEMY_SPECS.thunder.hp).toBeGreaterThan(ENEMY_SPECS.bat.hp * 3);
    expect(ENEMY_SPECS.thunder.displaySize).toBeGreaterThan(ENEMY_SPECS.bat.displaySize);
  });
});

describe('room definitions', () => {
  it('ships six rooms with rising pressure', () => {
    expect(ROOMS).toHaveLength(6);
    expect(ROOMS.map((room) => room.quota)).toEqual([8, 10, 12, 14, 9, 10]);
    expect(ROOMS[0].maxAlive).toBeLessThan(ROOMS[3].maxAlive);
  });

  it('every room lists a positive enemy mix', () => {
    for (const room of ROOMS) {
      expect(room.mix.length).toBeGreaterThan(0);
      for (const entry of room.mix) {
        expect(entry.weight).toBeGreaterThan(0);
      }
    }
  });

  it('covers all six playable rules across the run', () => {
    const rules = new Set(ROOMS.flatMap((room) => getRoomRuleKeys(room)));
    expect(rules.size).toBe(6);
  });

  it('derives each room rule pool from its real enemies', () => {
    expect(getRoomRuleKeys(ROOMS[0])).toEqual(['pierce']);
    expect(new Set(getRoomRuleKeys(ROOMS[1]))).toEqual(new Set(['pierce', 'burn']));
    expect(new Set(getRoomRuleKeys(ROOMS[2]))).toEqual(new Set(['spread', 'burn']));
    expect(new Set(getRoomRuleKeys(ROOMS[3]))).toEqual(new Set(['chain', 'frost']));
    expect(new Set(getRoomRuleKeys(ROOMS[4]))).toEqual(new Set(['pierce', 'blast']));
  });

  it('elite rooms declare a leader and four reward choices', () => {
    const eliteRooms = ROOMS.filter((room) => room.elite);
    expect(eliteRooms).toHaveLength(2);
    for (const room of eliteRooms) {
      expect(room.leader).toBeDefined();
      expect(room.rewardCount).toBe(4);
      expect(getRoomEnemyKinds(room)).toContain(room.leader);
    }
  });

  it('non-elite rooms keep the standard three choices', () => {
    for (const room of ROOMS.filter((item) => !item.elite)) {
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
    expect(buildRoomRewards(createEmptyBuild(), ROOMS[4], random)).toHaveLength(4);
    expect(buildRoomRewards(createEmptyBuild(), ROOMS[5], random)).toHaveLength(4);
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
