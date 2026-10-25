import { describe, expect, it } from 'vitest';
import type { SermonNote } from '../sermonTypes';
import {
  cardQuery,
  clearStart,
  lineCandidates,
  markedToSegs,
  parseCard,
  readStart,
  segsToMarked,
  startPath,
  trimSegs,
  type CardData,
} from './shareModel';

const note = (body: string): SermonNote => ({
  id: 'n1',
  title: '한 사람으로 인해 모두에게 죄와 사망이 이르다',
  preacher: '김성현 감독님',
  service: '주일 2부',
  date: '2026-10-25',
  refs: ['44:5:12-14'],
  body,
  thoughts: [],
  elapsed: 0,
  created_at: 0,
  updated_at: 0,
});

describe('shareModel', () => {
  it('밑줄 표기를 왕복한다', () => {
    const segs = [
      { t: '아담 한 사람 때문에 ', m: false },
      { t: '모두가 살 수 있다', m: true },
      { t: '는 이야기', m: false },
    ];
    expect(markedToSegs(segsToMarked(segs))).toEqual(segs);
  });

  it('길면 줄이고 끝에 … 를 붙인다', () => {
    const out = trimSegs([{ t: 'ㄱ'.repeat(300), m: false }], 220);
    expect(out[0].t.length).toBe(221);
    expect(out[0].t.endsWith('…')).toBe(true);
  });

  it('강조가 든 문단을 먼저, 밑줄 없는 문단을 뒤에 둔다', () => {
    const c = lineCandidates(
      note(
        '<p>그냥 적은 문단입니다</p><p>억울했는데 <b>예수님 한 분 때문에</b> 산다</p><ul><li>목록 <strong>강조</strong></li></ul>',
      ),
    );
    expect(c.map((x) => x.marked)).toEqual([true, true, false]);
    expect(c[0].segs).toEqual([
      { t: '억울했는데 ', m: false },
      { t: '예수님 한 분 때문에', m: true },
      { t: ' 산다', m: false },
    ]);
  });

  it('카드 링크를 만들고 다시 읽는다', () => {
    const d: CardData = {
      kind: 'line',
      title: '한 사람으로 인해',
      preacher: '김성현 감독님',
      service: '주일 2부',
      date: '2026-10-25',
      ref: '44:5:12-14',
      verse: '',
      quote: {
        src: 'note',
        segs: [
          { t: '앞 ', m: false },
          { t: '밑줄', m: true },
        ],
        ref: null,
      },
    };
    const back = parseCard(new URLSearchParams(cardQuery(d)));
    expect(back).toEqual(d);
  });

  it('깨진 카드 링크는 null', () => {
    expect(parseCard(new URLSearchParams('k=line'))).toBeNull();
    expect(parseCard(new URLSearchParams('t=x'))).toBeNull();
    expect(parseCard(new URLSearchParams('k=cover&r=bad'))).toBeNull();
  });

  it('받은 사람의 시작 주소를 읽고 지운다', () => {
    const d = parseCard(new URLSearchParams('k=cover&t=제목&p=설교자&d=2026-10-25&r=44:5:12-14'));
    const path = startPath(d, ' 한 줄 ');
    const p = new URLSearchParams(path.split('?')[1]);
    expect(readStart(p)).toEqual({
      title: '제목',
      preacher: '설교자',
      service: '',
      date: '2026-10-25',
      refs: ['44:5:12-14'],
      first: '한 줄',
    });
    p.set('note', 'x');
    expect(clearStart(p).toString()).toBe('note=x');
    expect(readStart(new URLSearchParams('start=blank'))?.refs).toEqual([]);
  });
});
