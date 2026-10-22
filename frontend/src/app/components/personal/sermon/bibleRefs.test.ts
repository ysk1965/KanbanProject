import { describe, expect, it, beforeAll } from 'vitest';
import {
  BOOKS,
  decRef,
  encRef,
  finalRef,
  parseRef,
  refLong,
  refShort,
  setVerseCounts,
  suggest,
  tailRef,
} from './bibleRefs';

/** 실제 절 수 없이도 검증되도록 모든 장을 30절로 둔다 (시편 119편만 176절) */
beforeAll(() => {
  setVerseCounts(
    BOOKS.map((b, bi) =>
      Array.from({ length: b[2] }, (_, ci) => (bi === 18 && ci === 118 ? 176 : 30)),
    ),
  );
});

describe('parseRef — 기획서 §5 빠른 입력 허용 표기', () => {
  it('약어 · 정식 명칭 · 별칭을 모두 읽는다', () => {
    expect(finalRef(parseRef('롬8:28'))).toEqual({ b: 44, c: 8, v1: 28, v2: 28, whole: false });
    expect(finalRef(parseRef('로마서 8장 28절'))).toEqual({
      b: 44,
      c: 8,
      v1: 28,
      v2: 28,
      whole: false,
    });
    expect(finalRef(parseRef('요한1서 4:8'))?.b).toBe(61);
    expect(finalRef(parseRef('1요 4:8'))?.b).toBe(61);
  });

  it('범위는 - 와 ~ 둘 다, 시편은 「편」', () => {
    expect(finalRef(parseRef('롬 8:28-30'))).toEqual({ b: 44, c: 8, v1: 28, v2: 30, whole: false });
    expect(finalRef(parseRef('롬 8:28~30'))?.v2).toBe(30);
    expect(finalRef(parseRef('시23편'))).toEqual({ b: 18, c: 23, v1: 1, v2: 30, whole: true });
  });

  it('없는 장·절은 받지 않는다', () => {
    expect(parseRef('요 22:1')).toBeNull(); // 요한복음은 21장
    expect(parseRef('요 3:99')).toBeNull(); // 30절까지로 가정
    expect(parseRef('없는책 1:1')).toBeNull();
  });

  it('주소 인코딩은 권:장:시작-끝(+w) 왕복', () => {
    const r = { b: 42, c: 3, v1: 16, v2: 16, whole: false };
    expect(encRef(r)).toBe('42:3:16-16');
    expect(decRef('42:3:16-16')).toEqual(r);
    expect(decRef('18:23:1-30w')?.whole).toBe(true);
    expect(refShort(r)).toBe('요 3:16');
    expect(refLong(r)).toBe('요한복음 3:16');
    expect(refShort({ b: 18, c: 23, v1: 1, v2: 30, whole: true })).toBe('시 23편');
  });
});

describe('suggest — 입력 중인 범위의 끝 절 추천', () => {
  it('책 이름만 치면 책을 추천한다', () => {
    const s = suggest('요');
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.book != null)).toBe(true);
  });
  it('장만 치면 장 전체와 1절', () => {
    const s = suggest('요 15');
    expect(s[0].ref).toEqual({ b: 42, c: 15, v1: 1, v2: 30, whole: true });
    expect(s[1].ref?.v1).toBe(1);
  });
  it('하이픈 뒤 숫자 일부로 끝 절을 좁힌다', () => {
    const s = suggest('요 15:5-1');
    expect(s[0].ref).toEqual({ b: 42, c: 15, v1: 5, v2: 10, whole: false });
  });
});

describe('tailRef — 문장 속 자동 변환', () => {
  it('문장 끝의 구절만 잡고 시작 위치를 돌려준다', () => {
    const hit = tailRef('모든 것이 합력하여 선을 이룬다 롬8:28');
    expect(hit).not.toBeNull();
    expect(hit?.ref).toEqual({ b: 44, c: 8, v1: 28, v2: 28, whole: false });
    expect('모든 것이 합력하여 선을 이룬다 롬8:28'.slice(hit!.start)).toBe('롬8:28');
  });
  it('장만 적은 것은 칩으로 바꾸지 않는다', () => {
    expect(tailRef('오늘 본문은 요 15장')).toBeNull();
  });
});
