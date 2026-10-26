import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * 스모크: 챌린지 탭 → 홈(지갑 안내·게임 카드·이번 주 적용) → 말씀 산성비 연습 판 → 랭킹.
 * 챌린지 서버는 아직 없다고 가정한다 (모든 API 실패 → 「아직 준비 중」 + 연습 판).
 */

const authState = {
  currentUser: { id: 'u-ch', name: '챌린지', email: 'c@example.com' },
  isAuthenticated: true,
  isLoading: false,
  logout: vi.fn(),
  hideBilling: true,
};
vi.mock('../../../../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../../UserMenu', () => ({ UserMenu: () => <div data-testid="user-menu" /> }));

vi.mock('../../../../utils/services', () => ({
  personalFeatureAPI: {
    listDocs: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    getDoc: vi.fn(),
    createDoc: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    updateDoc: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    deleteDoc: vi.fn(),
  },
}));

const fail = () => Promise.reject({ code: 'UNKNOWN', message: 'Not Found', status: 404 });
const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('../../../../utils/api', () => ({
  apiClient: api,
  myStorageAPI: {
    getFolders: vi.fn(),
    createFolder: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn() }) }));

vi.mock('../useBible', async () => {
  const refs = await import('../bibleRefs');
  const bible: string[][][] = refs.BOOKS.map((b) =>
    Array.from({ length: b[2] }, () =>
      Array.from({ length: 30 }, (_, i) => `말씀${i + 1} 은혜${i}`),
    ),
  );
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
  for (const m of [api.get, api.post, api.put, api.patch, api.delete]) m.mockImplementation(fail);
});

describe('챌린지 탭 (서버 없음)', () => {
  it('홈 → 산성비 연습 판 → 랭킹 「아직 준비 중」', async () => {
    localStorage.clear();
    const { default: SermonTab } = await import('../SermonTab');
    render(
      <MemoryRouter initialEntries={['/sermonnote?tab=challenge']}>
        <SermonTab standalone />
      </MemoryRouter>,
    );

    // 홈 — 지갑 자리는 안내, 게임 카드 둘, 이번 주 적용은 그대로
    expect(await screen.findByText('달란트와 랭킹은 아직 준비 중이에요.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '이번 주 적용' })).toBeInTheDocument();
    expect(screen.getByText('이번 주 완주')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/challenge/wallet');

    // 산성비 — 서버 판을 못 열면 연습 판
    fireEvent.click(screen.getByRole('button', { name: /오늘의 말씀 산성비/ }));
    expect(await screen.findByRole('radio', { name: '요한복음 15장' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '시작' }));
    expect(await screen.findByText('연습 판')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith(
      '/challenge/games/rain/runs',
      expect.objectContaining({ set: 'john15', pool: expect.any(Array) }),
    );
    const input = screen.getByLabelText('단어 입력') as HTMLInputElement;
    await waitFor(() => expect(input.disabled).toBe(false));
    // 없는 단어 → miss (깨지지 않고 칸이 비워진다)
    input.value = '없는단어';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');

    // 뒤로 → 홈, 랭킹 칩
    fireEvent.click(screen.getByRole('button', { name: '챌린지 홈으로' }));
    expect(await screen.findByRole('button', { name: /66권 줄 세우기/ })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '랭킹' })[0]);
    expect(await screen.findByText('랭킹은 아직 준비 중이에요.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '우리 교회' })).toBeInTheDocument();
  });

  it('66권 줄 세우기 연습 판 — 순서대로 누르면 끝난다', async () => {
    localStorage.clear();
    const { default: SermonTab } = await import('../SermonTab');
    render(
      <MemoryRouter initialEntries={['/sermonnote?tab=challenge']}>
        <SermonTab standalone />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /66권 줄 세우기/ }));
    fireEvent.click(screen.getByRole('button', { name: '모세오경 시작' }));
    for (const name of ['출애굽기', '창세기', '출애굽기', '레위기', '민수기', '신명기']) {
      fireEvent.click(await screen.findByRole('button', { name }));
    }
    expect(await screen.findByText(/손놀림 6번/)).toBeInTheDocument();
    expect(screen.getByText(/연습 판 · 로그인하면 달란트와 랭킹/)).toBeInTheDocument();
  });
});
