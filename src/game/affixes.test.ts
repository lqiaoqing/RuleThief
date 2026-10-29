import { describe, expect, it } from 'vitest';
import { AFFIXES, AFFIX_IDS, pickAffix } from './affixes';

describe('elite affixes', () => {
  it('ships eight distinct affixes', () => {
    expect(AFFIX_IDS).toHaveLength(8);
    expect(new Set(AFFIX_IDS.map((id) => AFFIXES[id].name)).size).toBe(8);
    expect(AFFIXES.volatile.description).toContain('爆炸');
  });

  it('picks a deterministic affix from the list', () => {
    expect(pickAffix(() => 0).id).toBe('volatile');
    expect(pickAffix(() => 0.999).id).toBe('toxic');
  });
});
