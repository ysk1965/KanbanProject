import { beforeEach, describe, expect, it } from 'vitest';
import {
  GALPI_PREFS_DEFAULT,
  loadGalpiPrefs,
  onGalpiPrefs,
  resetGalpiPrefsCache,
  saveGalpiPrefs,
} from '../galpiPrefs';
import {
  defaultProfile,
  galpiMigrated,
  galpiOf,
  markGalpiMigrated,
  mergeServerGalpi,
  normalizeProfile,
  readCache,
  sameProfile,
  serverHasGalpi,
  writeCache,
} from './profileModel';

/** 갈피 설정이 이름표를 따라 계정에 보관된다 — 서버 우선, 한 번만 기기 값 이전 */

beforeEach(() => {
  localStorage.clear();
  resetGalpiPrefsCache();
});

describe('갈피 설정 ↔ 이름표', () => {
  it('서버 응답: galpi_auto 는 늘 오고, galpi_service 는 null 이면 키가 빠진다(undefined → null)', () => {
    const p = normalizeProfile({ galpi_auto: false });
    expect(p.galpi_auto).toBe(false);
    expect(p.galpi_service).toBeNull();
    const q = normalizeProfile({ galpi_auto: true, galpi_service: '  주일 2부 ' });
    expect(galpiOf(q)).toEqual({ auto: true, service: '주일 2부' });
    expect(normalizeProfile({}).galpi_auto).toBe(true);
    expect(sameProfile(defaultProfile(), normalizeProfile({}))).toBe(true);
    expect(sameProfile(defaultProfile(), normalizeProfile({ galpi_auto: false }))).toBe(false);
  });

  it('서버에 값이 있으면 서버가 이긴다', () => {
    const raw = { galpi_auto: false, galpi_service: '주일 3부' };
    const m = mergeServerGalpi(
      normalizeProfile(raw),
      raw,
      { auto: true, service: '주일 1부' },
      false,
    );
    expect(m.push).toBe(false);
    expect(galpiOf(m.data)).toEqual({ auto: false, service: '주일 3부' });
    expect(serverHasGalpi(raw)).toBe(true);
  });

  it('서버가 기본값이고 기기 값이 기본값이 아니면 한 번만 기기 값을 올린다', () => {
    const raw = { galpi_auto: true };
    expect(serverHasGalpi(raw)).toBe(false);
    const device = { auto: true, service: '주일 2부' };
    const m = mergeServerGalpi(normalizeProfile(raw), raw, device, false);
    expect(m.push).toBe(true);
    expect(galpiOf(m.data)).toEqual(device);
    // 이미 이전했으면 서버(기본값)를 받는다
    const again = mergeServerGalpi(normalizeProfile(raw), raw, device, true);
    expect(again.push).toBe(false);
    expect(galpiOf(again.data)).toEqual({ auto: true, service: null });
    // 기기도 기본값이면 올릴 것 없음
    expect(mergeServerGalpi(normalizeProfile(raw), raw, GALPI_PREFS_DEFAULT, false).push).toBe(
      false,
    );
  });

  it('이전 표시는 계정마다', () => {
    expect(galpiMigrated('u1')).toBe(false);
    markGalpiMigrated('u1');
    expect(galpiMigrated('u1')).toBe(true);
    expect(galpiMigrated('u2')).toBe(false);
  });

  it('기기 캐시: 갈피 값이 실렸는지 알려 준다 (이전 판 캐시는 기기 키를 쓰게)', () => {
    localStorage.setItem(
      'sermon-profile-v1:u1',
      JSON.stringify({ data: { ink: 'mint' }, dirty: false }),
    );
    expect(readCache('u1')?.galpi).toBe(false);
    writeCache('u1', { data: { ...defaultProfile(), galpi_auto: false }, dirty: true });
    const c = readCache('u1');
    expect(c?.galpi).toBe(true);
    expect(c?.data.galpi_auto).toBe(false);
    expect(c?.dirty).toBe(true);
  });

  it('galpiPrefs: 같은 값이면 알리지 않고, 바뀌면 알린다', () => {
    let n = 0;
    const off = onGalpiPrefs(() => n++);
    saveGalpiPrefs({ auto: true });
    expect(n).toBe(0);
    saveGalpiPrefs({ service: '주일 2부' });
    expect(n).toBe(1);
    saveGalpiPrefs({ service: '  ' });
    expect(loadGalpiPrefs().service).toBeNull();
    expect(n).toBe(2);
    off();
  });
});
