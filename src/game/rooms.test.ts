import { describe, expect, it } from 'vitest';
import { createEmptyBuild, getRuleOffers } from './rules';
import {
  ENEMY_RULES,
  ROOMS,
  SUPPORTS,
  buildRoomRewards,
  getRoomRuleKeys,
  pickSpawnKind,
  type EnemyKind
} from './rooms';

const random = () => 0.37;

describe('room definitions', () => {
  it('ships three rooms with rising quotas', () => {
    expect(ROOMS).toHaveLength(3);
    expect(ROOMS.map((room) => room.quota)).toEqual([8, 12, 16]);
    expect(ROOMS[0].maxAlive).toBeLessThan(ROOMS[2].maxAlive);
  });

  it('every room lists a positive enemy mix', () => {
    for (const room of ROOMS) {
      expect(room.mix.length).toBeGreaterThan(0);
      for (const entry of room.mix) {
        expect(entry.weight).toBeGreaterThan(0);
      }
    }
  });

  it('derives the room rule pool from its real enemies', () => {
    expect(getRoomRuleKeys(ROOMS[0])).toEqual(['blast']);
    expect(new Set(getRoomRuleKeys(ROOMS[1]))).toEqual(new Set(['blast', 'chain']));
    expect(new Set(getRoomRuleKeys(ROOMS[2]))).toEqual(new Set(['blast', 'chain']));
  });

  it('maps each enemy to the rule it carries', () => {
    expect(ENEMY_RULES.beetle).toBe('blast');
    expect(ENEMY_RULES.bat).toBe('chain');
  });

  it('picks spawn kinds according to weights', () => {
    const batHeavy = ROOMS[1];
    const kinds: EnemyKind[] = [];
    for (let i = 0; i < 40; i += 1) {
      kinds.push(pickSpawnKind(batHeavy, () => i / 40));
    }
    const bats = kinds.filter((kind) => kind === 'bat').length;
    expect(bats).toBeGreaterThan(kinds.length / 2);
    expect(new Set(kinds).size).toBe(2);
  });

  it('never spawns outside the room mix', () => {
    const beetleOnly = { ...ROOMS[0], mix: [{ kind: 'beetle' as const, weight: 1 }] };
    for (let i = 0; i < 10; i += 1) {
      expect(pickSpawnKind(beetleOnly, () => i / 10)).toBe('beetle');
    }
  });
});

describe('room rewards', () => {
  it('offers three rewards', () => {
    const rewards = buildRoomRewards(createEmptyBuild(), ROOMS[0], random);
    expect(rewards).toHaveLength(3);
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
      impact: { key: 'blast' as const, level: 3 as const }
    };
    const rewards = buildRoomRewards(maxed, ROOMS[2], random);
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
    }
  });
});
