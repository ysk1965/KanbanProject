import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { todayString, type SermonNote } from '../sermonTypes';

/**
 * 스모크: 익명(연습 판) — 설교 노트(롬 5)로 일곱 가름끈 → 한 장 열기 → 한 절 따라 쓰기 → 「썼어요」.
 * 익명은 서버를 부르지 않는다.
 */

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('../../../../utils/api', () => ({ apiClient: api }));
vi.mock('../../../../utils/services', () => ({ personalFeatureAPI: {} }));
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: null, isAuthenticated: false }),
}));

vi.mock('../useBible', async () => {
  const refs = await import('../bibleRefs');
  const bible: string[][][] = refs.BOOKS.map((b) =>
    Array.from({ length: b[2] }, () =>
      Array.from({ length: 3 }, (_, i) => `말씀${i + 1} 은혜, ${i}.`),
    ),
  );
  refs.setVerseCounts(bible.map((b) => b.map((c) => c.length)));
  return {
    BIBLE_URL: '/bible/krv.json',
    getBible: () => bible,
    loadBible: () => Promise.resolve(bible),
    useBible: () => ({ bible, failed: false }),
    verses: () => [],
    firstVerseText: () => '',
  };
});

beforeAll(() => {
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

beforeEach(async () => {
  localStorage.clear();
  const { resetPilsaStores } = await import('./pilsaStore');
  resetPilsaStores();
});

const note: SermonNote = {
  id: 'n1',
  title: '한 사람으로 말미암아',
  preacher: '',
  service: '',
  date: todayString(),
  refs: ['44:5:12-14'],
  body: '<div class="vblock" data-ref="0:3:1-3"></div>',
  thoughts: [],
  elapsed: 0,
  created_at: 0,
  updated_at: 0,
};

describe('이번 주 말씀 필사 (익명)', () => {
  it('일곱 가름끈 → 한 장 열기 → 한 절 쓰기', async () => {
    const { PilsaView } = await import('./PilsaView');
    const onBack = vi.fn();
    const onLogin = vi.fn();
    render(
      <div className="sermon-app">
        <PilsaView notes={[note]} userId="anon" anonymous onBack={onBack} onLogin={onLogin} />
      </div>,
    );

    const group = await screen.findByRole('group', { name: '이번 주 일곱 장' });
    const ribbons = within(group).getAllByRole('button');
    expect(ribbons).toHaveLength(7);
    expect(within(group).getByText('롬 5')).toBeInTheDocument();
    expect(within(group).getByText('창 3')).toBeInTheDocument();
    expect(screen.getByText(/연습 판이에요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(onLogin).toHaveBeenCalled();

    // 롬 5 열기
    fireEvent.click(ribbons[0]);
    expect(screen.getByRole('heading', { name: '로마서 5' })).toBeInTheDocument();
    const input = screen.getByLabelText('지금 쓰는 절') as HTMLInputElement;

    // 붙여넣기는 막는다
    fireEvent.paste(input);
    expect(screen.getByText(/붙여넣기는 안 돼요/)).toBeInTheDocument();

    // 틀린 글자 → 막지 않고 물결 밑줄
    fireEvent.change(input, { target: { value: '말씀X' } });
    expect(document.querySelector('.sn-pl-bad')?.textContent).toBe('1');

    // 다 따라 쓰면 「썼어요」가 붙고 다음 절로
    fireEvent.change(input, { target: { value: '말씀1 은혜 0' } });
    expect(screen.getByText('썼어요')).toBeInTheDocument();
    expect(input.value).toBe('');
    expect(screen.getByText(/3절 중 1절 썼어요/)).toBeInTheDocument();

    // 기기에 남는다
    const saved = JSON.parse(localStorage.getItem('sermon-pilsa-v1:anon') || '{}');
    expect(saved.plan.chapters[0]).toMatchObject({ b: 44, c: 5, done: [1] });

    // 나머지 두 절 → 장 완료
    fireEvent.change(input, { target: { value: '말씀2은혜1' } });
    fireEvent.change(screen.getByLabelText('지금 쓰는 절'), { target: { value: '말씀3은혜2' } });
    expect(await screen.findByText('로마서 5장 다 썼어요!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '가름끈으로 돌아가기' }));
    expect(await screen.findByText('다 썼어요')).toBeInTheDocument();

    // 익명은 서버를 부르지 않는다
    expect(api.get).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
