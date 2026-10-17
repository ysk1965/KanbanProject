import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { compareFeatureOrder, sortByFeatureOrder } from './taskOrder';

function task(partial: Partial<Task> & { id: string; position: number }): Task {
  return partial as Task;
}

describe('taskOrder', () => {
  it('orders by feature_position first', () => {
    const a = task({ id: 'a', position: 5, feature_position: 2 });
    const b = task({ id: 'b', position: 1, feature_position: 1 });
    expect(sortByFeatureOrder([a, b]).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('falls back to position when feature_position is missing', () => {
    const a = task({ id: 'a', position: 3 });
    const b = task({ id: 'b', position: 1, feature_position: 2 });
    expect(sortByFeatureOrder([a, b]).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('breaks ties by position, then created_at, then id', () => {
    const byPosition = [
      task({ id: 'x', position: 2, feature_position: 1 }),
      task({ id: 'y', position: 1, feature_position: 1 }),
    ];
    expect(sortByFeatureOrder(byPosition).map((t) => t.id)).toEqual(['y', 'x']);

    const byCreated = [
      task({ id: 'x', position: 1, feature_position: 1, created_at: '2026-02-01T00:00:00Z' }),
      task({ id: 'y', position: 1, feature_position: 1, created_at: '2026-01-01T00:00:00Z' }),
    ];
    expect(sortByFeatureOrder(byCreated).map((t) => t.id)).toEqual(['y', 'x']);

    const byId = [
      task({ id: 'b', position: 1, feature_position: 1 }),
      task({ id: 'a', position: 1, feature_position: 1 }),
    ];
    expect(sortByFeatureOrder(byId).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('compareFeatureOrder returns 0 for identical keys', () => {
    const a = task({ id: 'same', position: 1, feature_position: 1 });
    expect(compareFeatureOrder(a, { ...a })).toBe(0);
  });

  it('does not mutate the input array', () => {
    const input = [task({ id: 'b', position: 2 }), task({ id: 'a', position: 1 })];
    const sorted = sortByFeatureOrder(input);
    expect(sorted).not.toBe(input);
    expect(input.map((t) => t.id)).toEqual(['b', 'a']);
  });
});
