import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/services', () => ({ personalFeatureAPI: {} }));
vi.mock('./sermonAudioStore', () => ({ sermonAudioStore: {} }));

import { homeSyncLine, type SyncStatus } from './sermonStore';

const base: SyncStatus = {
  anonymous: false,
  pending: 0,
  online: true,
  lastSync: 0,
  loading: false,
  localOk: true,
  audioPct: null,
  localFull: false,
  slow: false,
  restoring: false,
  limit: false,
};
const NOW = 1_800_000_000_000;

describe('homeSyncLine', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('연결돼 있고 남은 변경이 없으면 맞춰짐', () => {
    expect(homeSyncLine(base, NOW)).toEqual({ text: '모든 기기와 맞춰짐', sub: null, state: 'ok' });
  });

  it('연결돼 있고 변경이 남았으면 올리는 중', () => {
    expect(homeSyncLine({ ...base, pending: 2 }, NOW).text).toBe('변경 2건 올리는 중');
  });

  it('끊겼는데 변경이 없어도 맞춰짐이라 하지 않는다', () => {
    const r = homeSyncLine({ ...base, online: false, lastSync: NOW - 3 * 60_000 }, NOW);
    expect(r).toEqual({
      text: '연결 끊김 · 이 기기에 저장 중',
      sub: '마지막 맞춤 3분 전',
      state: 'off',
    });
  });

  it('끊긴 채 남은 변경은 기다리는 중', () => {
    expect(homeSyncLine({ ...base, online: false, pending: 2 }, NOW)).toEqual({
      text: '연결 끊김 · 변경 2건 기다리는 중',
      sub: null,
      state: 'off',
    });
  });

  it('스토어가 아직 모르더라도 브라우저가 오프라인이면 끊김', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(homeSyncLine({ ...base, online: null }, NOW).state).toBe('off');
  });

  it('응답이 느려 끊긴 것으로 본 경우는 느리다고 말한다', () => {
    expect(homeSyncLine({ ...base, online: false, slow: true }, NOW).text).toBe(
      '연결이 느려요 · 잠시 뒤 다시 맞춰요',
    );
  });
});
