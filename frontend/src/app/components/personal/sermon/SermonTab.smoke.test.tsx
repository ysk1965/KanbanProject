import { describe, expect, it, vi, beforeAll } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * 스모크: 목록 → 새 설교 기록 → 편집기(제목·본문·생각 패널) 가 jsdom 에서 깨지지 않고 그려지는지.
 * 서버는 없다고 가정한다 (목록 호출 실패 → 기기 저장만).
 */

const authState = {
  currentUser: { id: 'u-test', name: '테스트', email: 't@example.com' } as {
    id: string;
    name: string;
    email: string;
  } | null,
  isAuthenticated: true,
  isLoading: false,
  logout: vi.fn(),
  hideBilling: true,
};
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('../../UserMenu', () => ({ UserMenu: () => <div data-testid="user-menu" /> }));

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
  // 모임 API(group/groupApi) — 서버 없음
  apiClient: {
    get: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    post: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    put: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    patch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    delete: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
  },
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
    // 폰용 머리와 바닥 두 곳에 「넣기」가 있다 (CSS 로 하나만 보임) — 바닥 쪽을 누른다
    const inserts = screen.getAllByRole('button', { name: /^넣기$/ });
    fireEvent.click(inserts[inserts.length - 1]);
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

    // 목록으로 → 한 주 다이어리 (이번 주 적용이 남은 개수로 보인다)
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
    expect(await screen.findByText('1개 남았어요')).toBeInTheDocument();
    expect(screen.getAllByText('포도나무와 가지').length).toBeGreaterThan(0);
  });

  it('로그인 없이(/sermonnote) 쓰면 서버를 부르지 않고 기기에만 저장하며, 로그인 안내가 보인다', async () => {
    localStorage.clear();
    const services = await import('../../../utils/services');
    const listDocs = services.personalFeatureAPI.listDocs as unknown as ReturnType<typeof vi.fn>;
    listDocs.mockClear();
    authState.currentUser = null;
    authState.isAuthenticated = false;

    const { default: SermonTab } = await import('./SermonTab');
    render(
      <MemoryRouter initialEntries={['/sermonnote']}>
        <SermonTab standalone />
      </MemoryRouter>,
    );

    // 상단 띠의 로그인 버튼 + 기기 저장 안내
    expect(await screen.findByText('로그인 없이도 이 기기에 저장돼요')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /로그인/ }).length).toBeGreaterThan(0);
    expect(screen.getByText(/노트는 이 기기에만 저장돼요/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /새 설교 기록/ })[0]);
    const title = await screen.findByLabelText('설교 제목');
    fireEvent.change(title, { target: { value: '익명 노트' } });
    // 편집기 저장 상태 줄
    expect(
      screen.getByText('이 기기에 저장됨 · 로그인하면 다른 기기와 맞춰져요'),
    ).toBeInTheDocument();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(listDocs).not.toHaveBeenCalled();
    const raw = localStorage.getItem('sermon-notes-v1:anon');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).notes[0].title).toBe('익명 노트');

    // 목록으로 돌아오면 로그인 안내 줄
    fireEvent.click(screen.getByRole('button', { name: '목록으로' }));
    expect(await screen.findByText(/지금은 이 기기에만 저장되고 있어요/)).toBeInTheDocument();

    authState.currentUser = { id: 'u-test', name: '테스트', email: 't@example.com' };
    authState.isAuthenticated = true;
  });

  it('로그인하면 익명 노트가 그 계정으로 옮겨져 서버에 올라간다', async () => {
    localStorage.clear();
    localStorage.setItem(
      'sermon-notes-v1:anon',
      JSON.stringify({
        notes: [
          {
            id: 'local-abc',
            title: '로그인 전 메모',
            preacher: '',
            service: '주일 2부',
            date: '2026-10-18',
            refs: [],
            body: '<p>은혜</p>',
            thoughts: [],
            elapsed: 0,
            created_at: 1,
            updated_at: 2,
          },
        ],
        dirty: ['local-abc'],
        deleted: [],
        synced: [],
      }),
    );
    const services = await import('../../../utils/services');
    const createDoc = services.personalFeatureAPI.createDoc as unknown as ReturnType<typeof vi.fn>;
    createDoc.mockClear();
    createDoc.mockResolvedValueOnce({
      id: 'srv-1',
      feature_key: 'sermon',
      title: '로그인 전 메모',
      schema_ver: 1,
      created_at: 'x',
      updated_at: 'y',
      content: {},
    });
    (
      services.personalFeatureAPI.listDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([]);

    await renderTab();
    // 익명 노트가 계정 저장소로 옮겨져 서버에 생성되고, 응답받은 서버 id 로 바뀐다
    await waitFor(() => expect(createDoc).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('sermon-notes-v1:anon')).toBeNull();
    await waitFor(() => {
      const cur = JSON.parse(localStorage.getItem('sermon-notes-v1:u-test') as string);
      expect(cur.notes.some((n: { id: string }) => n.id === 'srv-1')).toBe(true);
      expect(cur.dirty).toEqual([]);
    });
    expect(screen.getAllByText('로그인 전 메모').length).toBeGreaterThan(0);
  });
});

describe('SermonTab 핵심 탭', () => {
  it('다섯 탭으로 오가고, 고른 탭은 주소 ?tab= 에 남는다', async () => {
    localStorage.clear();
    authState.currentUser = { id: 'u-tabs', name: '탭테스트', email: 't@example.com' };
    authState.isAuthenticated = true;
    await renderTab();
    expect(await screen.findByText('아직 기록한 설교가 없어요')).toBeInTheDocument();

    const tablist = screen.getAllByRole('tablist', { name: '갈피 탭' })[0];
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs).toEqual(['설교 노트', '모임', '성경 읽기', '챌린지', '나의 갈피']);

    // 나의 갈피 — 프로필 이름 + 내 갈피 (비었을 때 안내)
    fireEvent.click(screen.getAllByRole('tab', { name: /나의 갈피/ })[0]);
    expect(await screen.findByText('탭테스트')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '내 이름표' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /내 인생 설교 고정하기/ })).toBeInTheDocument();

    // 챌린지 — 이번 주 삶의 갈피
    fireEvent.click(screen.getAllByRole('tab', { name: /챌린지/ })[0]);
    expect(await screen.findByRole('region', { name: '이번 주 삶의 갈피' })).toBeInTheDocument();

    // 모임 — 모임이 없을 때 본문 안내
    fireEvent.click(screen.getAllByRole('tab', { name: /^모임/ })[0]);
    expect(await screen.findByText('아직 모임이 없어요')).toBeInTheDocument();

    // 설교 노트로 돌아오면 첫 화면
    fireEvent.click(screen.getAllByRole('tab', { name: /설교 노트/ })[0]);
    expect(await screen.findByText('아직 기록한 설교가 없어요')).toBeInTheDocument();
  });
});

describe('나의 갈피 — 이름표·고정 노트', () => {
  it('편집기 메뉴로 고정 → 폴라로이드가 생기고, 카드·이름표 꾸미기가 기기에 남는다', async () => {
    localStorage.clear();
    authState.currentUser = { id: 'u-pin', name: '은혜', email: 'p@example.com' };
    authState.isAuthenticated = true;
    await renderTab();
    expect(await screen.findByText('아직 기록한 설교가 없어요')).toBeInTheDocument();

    // 새 노트 → 제목 → ⋯ → 나의 갈피에 고정
    fireEvent.click(screen.getAllByRole('button', { name: /새 설교 기록/ })[0]);
    fireEvent.change(await screen.findByLabelText('설교 제목'), {
      target: { value: '환난이 소망이 되기까지' },
    });
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /나의 갈피에 고정/ }));
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    expect(screen.getByRole('menuitemcheckbox', { name: /고정 풀기/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(screen.getAllByRole('button', { name: /목록/ })[0]);

    // 나의 갈피 — 카드 한 장 + 빈 자리 두 개
    fireEvent.click((await screen.findAllByRole('tab', { name: /나의 갈피/ }))[0]);
    const titles = await screen.findAllByText('환난이 소망이 되기까지');
    expect(titles.some((el) => el.classList.contains('snp-pola-t'))).toBe(true);
    expect(screen.getAllByRole('button', { name: /한 장 더/ })).toHaveLength(2);

    // 카드 꾸미기 — 내 한 줄
    fireEvent.click(screen.getByRole('button', { name: /카드 꾸미기/ }));
    fireEvent.change(await screen.findByLabelText(/내 한 줄/), {
      target: { value: '버티는 게 아니라' },
    });
    fireEvent.click(screen.getByRole('radio', { name: '빗금' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }));
    expect(await screen.findByText('“버티는 게 아니라”')).toBeInTheDocument();

    // 이름표 꾸미기 — 캐릭터 · 소속 교회는 챌린지 교회 창으로
    fireEvent.click(screen.getAllByRole('button', { name: '이름표 꾸미기' })[0]);
    fireEvent.click(await screen.findByRole('radio', { name: /방울/ }));
    expect(screen.getByText('아직 정하지 않았어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '교회 고르기' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '이름표 꾸미기' })).toBeNull();

    const cache = JSON.parse(localStorage.getItem('sermon-profile-v1:u-pin') as string);
    expect(cache.dirty).toBe(true); // 서버 없음 → 올리지 못한 변경으로 남음
    expect(cache.data.mascot).toBe('bang');
    expect(cache.data.pins).toHaveLength(1);
    expect(cache.data.pins[0]).toMatchObject({ pattern: 'lines', line: '버티는 게 아니라' });
    // 꾸미기 키도 같이 바뀐다 (카드·초대 페이지가 따라오게)
    expect(JSON.parse(localStorage.getItem('sermon-look-v1') as string).mascot).toBe('bang');
  });
});
