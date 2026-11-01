import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VersionHistoryModal } from './VersionHistoryModal';
import type { NoteVersion } from './sermonVersions';

const P = (s: string) => `<p>${s}</p>`;
const T0 = new Date(2026, 10, 1, 11, 36).getTime();
const v = (id: string, min: number, body: string, reason: NoteVersion['reason']): NoteVersion => ({
  id,
  note_id: 'n1',
  at: T0 + min * 60_000,
  reason,
  title: '로마서 5',
  body,
  chars: body.replace(/<[^>]+>/g, '').length,
});

describe('VersionHistoryModal', () => {
  const versions = [
    v('v2', 11, P('우리는 연약하다') + P('아담의 한 행위') + P('적용: 매일 읽기'), 'auto'),
    v('v1', 0, P('우리는 연약하다') + P('아담의 한 행위'), 'open'),
  ];
  const current = P('우리는 연약하다') + P('아담의 한 행위') + P('은혜가 더 넘쳤다');

  it('목록에 처음 바뀐 문장을, 비교에 돌아올 문단과 사라질 문단을 보여 준다', () => {
    render(
      <VersionHistoryModal
        open
        versions={versions}
        currentBody={current}
        onRestore={() => {}}
        onApplyBody={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByText('고치기 전').length).toBeGreaterThan(0);
    // 11:47 버전 줄 요약 = 그때 쓴 문단 (앞부분 미리보기가 아니라)
    expect(screen.getAllByText('적용: 매일 읽기').length).toBeGreaterThan(0);
    // 기본 선택(가장 최근 버전) 비교: 지금 글의 새 문단은 사라지고, 적용 문단이 돌아온다
    expect(document.querySelector('.sn-vh-p.del')?.textContent).toBe('은혜가 더 넘쳤다');
    expect(document.querySelector('.sn-vh-p.add')?.textContent).toContain('적용: 매일 읽기');
    expect(screen.getByText('그대로인 문단 2개 펼치기')).toBeTruthy();
  });

  it('이 문단만 가져오기는 그 문단만 원래 자리(앞 문단 뒤)에 넣는다', () => {
    const onApplyBody = vi.fn();
    render(
      <VersionHistoryModal
        open
        versions={versions}
        currentBody={current}
        onRestore={() => {}}
        onApplyBody={onApplyBody}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '이 문단만 가져오기' }));
    expect(onApplyBody).toHaveBeenCalledWith(
      P('우리는 연약하다') + P('아담의 한 행위') + P('적용: 매일 읽기') + P('은혜가 더 넘쳤다'),
    );
  });
});
