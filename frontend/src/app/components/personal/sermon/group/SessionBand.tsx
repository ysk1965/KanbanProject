import { useSyncExternalStore } from 'react';
import { fmtDate, type NoteGroupLink, type SermonNote } from '../sermonTypes';
import { Faces } from './Faces';
import { josa, type GroupStore } from './groupStore';
import type { Suggestion } from './sessionMatch';
import { weekStartOf } from './sessionMatch';
import './group.css';

/**
 * 편집기 맨 위 「어느 설교 자리에 붙었는지」 한 줄.
 * 자동으로 붙었으면 그 사실과 같이 쓰는 사람을, 상관없는 노트면 바로 뺄 수 있게.
 * 아직 안 붙었는데 맞을 만한 자리가 있으면 「같은 설교예요?」 한 번.
 */
interface Props {
  note: SermonNote;
  store: GroupStore;
  suggestions: Suggestion[];
  onOpenSession: (sessionId: string, groupId: string) => void;
  onSetLink: (groupId: string, patch: Partial<NoteGroupLink>) => void;
  onAccept: (s: Suggestion) => void;
  onDismiss: (s: Suggestion) => void;
}

const HOW = {
  auto: '예배 시간이라 자동으로 붙었어요',
  suggest: '같은 설교로 붙였어요',
  manual: '이 설교 자리에 붙였어요',
} as const;

export function SessionBand({
  note,
  store,
  suggestions,
  onOpenSession,
  onSetLink,
  onAccept,
  onDismiss,
}: Props) {
  useSyncExternalStore(store.subscribe, store.snapshot);
  if (store.anonymous) return null;
  const links = (note.groups || []).filter((l) => store.get(l.group_id)?.me.status === 'active');
  const sug = suggestions[0];
  if (!links.length && !sug) return null;

  return (
    <>
      {links.map((l) => {
        const g = store.get(l.group_id)!;
        const svc = g.services.find((s) => s.id === l.service_id);
        const sess = l.session_id
          ? store.weekCached(g.id, weekStartOf(l.date))?.sessions.find((s) => s.id === l.session_id)
          : undefined;
        const people = (sess?.members || [])
          .filter((m) => m.user_id !== g.me.user_id)
          .map((m) => ({
            user_id: m.user_id,
            display_name: g.members.find((x) => x.user_id === m.user_id)?.display_name || '?',
          }));
        return (
          <div key={l.group_id} className="sg-band" data-off={l.off || undefined} role="status">
            <div className="sg-band-l">
              <small>
                {g.name} · {fmtDate(l.date)} {sess?.name || svc?.name || '설교'} ·{' '}
                {l.off ? '모임과 상관없는 노트로 두었어요' : HOW[l.how]}
              </small>
              <b>
                {l.off
                  ? '이 노트는 모임에 보이지 않아요'
                  : people.length
                    ? `${people
                        .map((p) => p.display_name)
                        .slice(0, 3)
                        .join(
                          ' · ',
                        )}${people.length > 3 ? ` 외 ${people.length - 3}명` : ''}도 이 설교를 기록했어요`
                    : l.private
                      ? '기록했다는 것만 보이고 내용은 나만 봐요'
                      : `${josa(g.name, '과', '와')} 같이 보는 노트예요`}
              </b>
            </div>
            <div className="sg-band-r">
              {people.length > 0 && <Faces people={people} max={3} size={22} />}
              {!l.off && l.session_id && (
                <button
                  type="button"
                  className="sg-chip"
                  onClick={() => onOpenSession(l.session_id as string, g.id)}
                >
                  같은 설교 노트
                </button>
              )}
              {!l.off && (
                <button
                  type="button"
                  className="sg-chip"
                  aria-pressed={!!l.private}
                  onClick={() => onSetLink(g.id, { private: !l.private })}
                >
                  {l.private ? '내용도 보이기' : '내용은 나만'}
                </button>
              )}
              <button
                type="button"
                className="sg-chip"
                onClick={() => onSetLink(g.id, { off: !l.off })}
              >
                {l.off ? `${josa(g.name, '과', '와')} 같이 보기` : '모임과 상관없어요'}
              </button>
            </div>
          </div>
        );
      })}
      {sug && (
        <div className="sg-band" role="status">
          <div className="sg-band-l">
            <small>{sug.reasons.join(' · ')}</small>
            <b>
              {store.get(sug.group_id)?.name} · {fmtDate(sug.session.date)}{' '}
              {sug.session.title || sug.session.name || '설교'}와 같은 설교인가요?
            </b>
          </div>
          <div className="sg-band-r">
            <button type="button" className="sg-chip" aria-pressed onClick={() => onAccept(sug)}>
              같은 설교예요
            </button>
            <button type="button" className="sg-chip" onClick={() => onDismiss(sug)}>
              아니에요
            </button>
          </div>
        </div>
      )}
    </>
  );
}
