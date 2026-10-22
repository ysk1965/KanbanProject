import { describe, expect, it, vi, beforeAll } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * 스모크: 목록 → 새 설교 기록 → 편집기(제목·본문·생각 패널) 가 jsdom 에서 깨지지 않고 그려지는지.
 * 서버는 없다고 가정한다 (목록 호출 실패 → 기기 저장만).
 */

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'u-test', name: '테스트' } }),
}));

vi.mock('../../../utils/services', () => ({
  personalFeatureAPI: {
    listDocs: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    getDoc: vi.fn(),
    createDoc: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    updateDoc: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    deleteDoc: vi.fn(),
  },
}));

vi.mock('../../../utils/api', () => ({
  myStorageAPI: {
    getFolders: vi.fn(),
    createFolder: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn() }) }));

// 성경 본문 4.4MB 를 jsdom 에서 받지 않는다 — 요한복음 15장만 있는 가짜 데이터
vi.mock('./useBible', async () => {
  const refs = await import('./bibleRefs');
  const bible: string[][][] = refs.BOOKS.map((b) =>
    Array.from({ length: b[2] }, () => Array.from({ length: 30 }, (_, i) => `절 ${i + 1}`)),
  );
  bible[42][14][4] = '나는 포도나무요 너희는 가지니 저가 내 안에, 내가 저 안에 있으면';
  refs.setVerseCounts(bible.map((b) => b.map((c) => c.length)));
  return {
    BIBLE_URL: '/bible/krv.json',
    getBible: () => bible,
    loadBible: () => Promise.resolve(bible),
    useBible: () => ({ bible, failed: false }),
    verses: (r: { b: number; c: number; v1: number; v2: number }) => {
      const ch = bible[r.b][r.c - 1];
      const out: Array<[number, string]> = [];
      for (let v = r.v1; v <= Math.min(r.v2, ch.length); v++) out.push([v, ch[v - 1]]);
      return out;
    },
    firstVerseText: (r: { b: number; c: number; v1: number }) =>
      bible[r.b][r.c - 1][r.v1 - 1] ?? '',
  };
});

beforeAll(() => {
  class IO {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  if (!document.execCommand) document.execCommand = () => true;
  if (!('CSS' in globalThis))
    (globalThis as unknown as { CSS: unknown }).CSS = { escape: (s: string) => s };
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia =
    window.matchMedia ||
    (((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia);
});

async function renderTab() {
  const { default: SermonTab } = await import('./SermonTab');
  return render(
    <MemoryRouter initialEntries={['/personal?tab=sermon']}>
      <SermonTab />
    </MemoryRouter>,
  );
}

describe('SermonTab smoke', () => {
  it('빈 목록 → 새 설교 기록 → 편집기가 열리고 생각을 남길 수 있다', async () => {
    localStorage.clear();
    await renderTab();

    // 목록 (빈 상태)
    expect(await screen.findByText('아직 기록한 설교가 없어요')).toBeInTheDocument();

    // 새 설교 기록
    fireEvent.click(screen.getAllByRole('button', { name: /새 설교 기록/ })[0]);
    const title = await screen.findByLabelText('설교 제목');
    expect(title).toBeInTheDocument();
    fireEvent.change(title, { target: { value: '포도나무와 가지' } });

    // 본문 편집기와 서식 바
    expect(screen.getByLabelText('설교 내용')).toBeInTheDocument();
    expect(screen.getByText('구절 넣기')).toBeInTheDocument();

    // 설교 본문 추가 → 구절 찾기 창 → 요 15:5 등록
    fireEvent.click(screen.getByRole('button', { name: /설교 본문 추가/ }));
    const q = await screen.findByPlaceholderText('구절 입력');
    fireEvent.change(q, { target: { value: '요 15:5' } });
    fireEvent.click(screen.getByRole('button', { name: '넣기' }));
    await waitFor(() => expect(screen.getByText('요한복음 15:5')).toBeInTheDocument());
    expect(screen.getAllByText(/나는 포도나무요/).length).toBeGreaterThan(0);

    // 내 생각 패널에 적용 메모
    const thoughtInput = screen.getByLabelText('생각 입력');
    fireEvent.focus(thoughtInput);
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    fireEvent.change(thoughtInput, { target: { value: '매일 말씀 한 장 읽기' } });
    fireEvent.keyDown(thoughtInput, { key: 'Enter' });
    expect(await screen.findByText('매일 말씀 한 장 읽기')).toBeInTheDocument();
    expect(screen.getByText('1개')).toBeInTheDocument();

    // 기기 저장 확인 (서버는 없음)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    const raw = localStorage.getItem('sermon-notes-v1:u-test');
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw as string);
    expect(saved.notes[0].title).toBe('포도나무와 가지');
    expect(saved.notes[0].refs).toEqual(['42:15:5-5']);
    expect(saved.notes[0].thoughts[0].tag).toBe('적용');
    expect(saved.dirty.length).toBe(1);

    // 목록으로 → 이번 주 적용 배너
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
    expect(await screen.findByText('이번 주 적용, 1개 남았어요')).toBeInTheDocument();
    expect(screen.getByText('포도나무와 가지')).toBeInTheDocument();
  });
});
