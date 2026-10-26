import { describe, expect, it, beforeEach } from 'vitest';
import { ANONYMOUS_USER, SermonStore } from '../sermonStore';
import { newNote } from '../sermonTypes';

describe('모임 연결은 saveLinks 로만 바뀐다', () => {
  beforeEach(() => localStorage.clear());

  it('편집기의 옛 사본으로 저장해도 연결이 지워지지 않는다', async () => {
    const store = new SermonStore(ANONYMOUS_USER);
    await store.init();
    const n = store.save(newNote(undefined));
    const stale = { ...n }; // 편집기가 열 때 받은 사본 (groups 없음)
    store.saveLinks(n.id, {
      groups: [{ group_id: 'g1', service_id: 'sun', date: n.date, how: 'auto' }],
    });
    store.save({ ...stale, body: '<p>본문</p>' });
    const cur = store.get(n.id)!;
    expect(cur.body).toBe('<p>본문</p>');
    expect(cur.groups?.[0].group_id).toBe('g1');
    // 새 노트를 만들 때 넣은 연결은 그대로
    const m = store.save({
      ...newNote(undefined),
      groups: [{ group_id: 'g2', date: '2026-10-25', how: 'manual' }],
    });
    expect(store.get(m.id)!.groups?.[0].group_id).toBe('g2');
    store.dispose();
  });
});
