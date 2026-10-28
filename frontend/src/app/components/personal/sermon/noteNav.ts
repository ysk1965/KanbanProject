/**
 * 설교 노트 목록 ↔ 편집기 사이에서 잃지 말아야 할 자리.
 * 노트를 열면 목록(SermonList)이 내려가므로, 어느 보기(달력·내 생각 …)에서 왔는지와
 * 달력의 달·고른 날을 여기 두었다가 「← 달력」으로 돌아오면 그대로 펼친다. 새로고침하면 처음부터.
 */
export type NoteView = 'home' | 'week' | 'cal' | 'thoughts' | 'tidy';

const BACK: Record<NoteView, string> = {
  home: '노트',
  week: '한 주',
  cal: '달력',
  thoughts: '내 생각',
  tidy: '다듬기',
};

let view: NoteView = 'home';
let cal: { month: string; sel: string } | null = null;

export const noteNav = {
  get view(): NoteView {
    return view;
  },
  set view(v: NoteView) {
    view = v;
  },
  get cal() {
    return cal;
  },
  set cal(c: { month: string; sel: string } | null) {
    cal = c;
  },
  /** 편집기 「← 」 버튼 이름 */
  backLabel(): string {
    return BACK[view];
  },
  /** 테스트용 */
  reset() {
    view = 'home';
    cal = null;
  },
};
