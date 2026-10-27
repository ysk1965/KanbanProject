import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WeekPanel } from './WeekPanel';
import { addItem, emptyPlan, type CatList, type WeekPlan } from './weekPlan';

const DAYS = [
  '2026-10-25',
  '2026-10-26',
  '2026-10-27',
  '2026-10-28',
  '2026-10-29',
  '2026-10-30',
  '2026-10-31',
];
const TODAY = '2026-10-27';

function Harness({ init }: { init: WeekPlan }) {
  const [plan, setPlanS] = useState(init);
  const [cats, setCatsS] = useState<CatList>({
    cats: [
      { id: 'todo', name: '할 일', color: 'g1', icon: 'tag' },
      { id: 'home', name: '가정', color: 'g3', icon: 'home' },
    ],
    updated_at: 0,
  });
  return (
    <div className="sermon-app">
      <WeekPanel
        days={DAYS}
        today={TODAY}
        api={{ plan, cats, setPlan: (fn) => setPlanS(fn), setCats: (fn) => setCatsS(fn) }}
        notes={[]}
        galpiNote={null}
        isGroupNote={() => false}
        highlight={null}
        onOpen={() => {}}
        onToggleApply={() => {}}
      />
      <output data-testid="plan">{JSON.stringify(plan.items)}</output>
    </div>
  );
}

const items = () => JSON.parse(screen.getByTestId('plan').textContent || '[]');

function setup() {
  const p = addItem(emptyPlan(DAYS[0]), {
    text: '로마서 5장',
    rep: 'once',
    cat: 'todo',
    day: TODAY,
  });
  render(<Harness init={p} />);
}

describe('WeekPanel — 줄을 눌러 그 자리에서 고치기', () => {
  it('⋯ 로 펼치면 제목 자리가 입력칸, Enter 로 저장하고 닫힌다', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '로마서 5장 고치기' }));
    const input = screen.getByLabelText('할 일 제목');
    expect(input).toHaveValue('로마서 5장');
    fireEvent.change(input, { target: { value: '로마서 5장 다시 읽기' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByLabelText('할 일 제목')).not.toBeInTheDocument();
    expect(items()[0].text).toBe('로마서 5장 다시 읽기');
  });

  it('Esc 는 고친 글자를 버리고 닫는다', () => {
    setup();
    fireEvent.click(screen.getByText('로마서 5장'));
    const input = screen.getByLabelText('할 일 제목');
    fireEvent.change(input, { target: { value: '바뀐 글자' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(items()[0].text).toBe('로마서 5장');
  });

  it('요일: 하나 더 고르면 며칠, 오늘을 빼면 그날로 옮겨지고 되돌릴 수 있다', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '로마서 5장 고치기' }));
    const group = screen.getByRole('group', { name: '할 요일' });
    fireEvent.click(within(group).getByRole('button', { name: /30일 금요일/ }));
    expect(items()[0]).toMatchObject({ rep: 'days', days: [TODAY, '2026-10-30'] });

    fireEvent.click(within(group).getByRole('button', { name: /27일 화요일/ }));
    await waitFor(() => expect(items()[0]).toMatchObject({ rep: 'once', day: '2026-10-30' }));
    expect(await screen.findByText('금요일로 옮겼어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(items()[0]).toMatchObject({ rep: 'days', days: [TODAY, '2026-10-30'] });
  });

  it('매일을 누르면 오늘부터 매일, 카테고리를 바꿀 수 있다', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '로마서 5장 고치기' }));
    fireEvent.click(screen.getByRole('button', { name: '매일' }));
    expect(items()[0]).toMatchObject({ rep: 'daily', from: TODAY });
    fireEvent.click(screen.getByRole('radio', { name: '가정' }));
    expect(items()[0].cat).toBe('home');
  });

  it('지우기 → 되돌리기', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '로마서 5장 고치기' }));
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    await waitFor(() => expect(items()).toHaveLength(0));
    expect(screen.getByText('지웠어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(items()[0].text).toBe('로마서 5장');
  });
});
