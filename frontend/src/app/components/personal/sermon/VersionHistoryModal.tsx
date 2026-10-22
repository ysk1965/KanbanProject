import { X } from 'lucide-react';
import { SnOverlay } from './SnOverlay';
import { VERSION_REASON_LABEL, type NoteVersion } from './sermonVersions';
import { hhmm, plainText } from './sermonTypes';

/**
 * 버전 기록 창 — 기획서 §9.
 * 시각, 저장 이유, 글자 수와 지금과의 차이, 앞부분 미리보기. 본문만 되돌린다.
 */
interface VersionHistoryModalProps {
  open: boolean;
  versions: NoteVersion[];
  currentChars: number;
  onRestore: (v: NoteVersion) => void;
  onClose: () => void;
}

export function VersionHistoryModal({
  open,
  versions,
  currentChars,
  onRestore,
  onClose,
}: VersionHistoryModalProps) {
  return (
    <SnOverlay open={open} onClose={onClose} className="sn-verm" aria-labelledby="sn-ver-title">
      <div className="sn-vhead">
        <h2 id="sn-ver-title">버전 기록</h2>
        <button
          type="button"
          className="sn-btn sn-icon-only sn-ghost"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="sn-icon" />
        </button>
      </div>
      <p>
        본문은 고치기 시작할 때, 10분마다, 노트를 닫을 때 자동으로 남아요. 되돌려도 내 생각 메모는
        바뀌지 않아요.
      </p>
      <div className="sn-ver-list">
        {versions.length === 0 ? (
          <div className="sn-th-empty">
            아직 저장된 버전이 없어요. 본문을 고치기 시작하면 열었을 때의 내용부터 자동으로 남아요.
          </div>
        ) : (
          versions.map((v) => {
            const d = new Date(v.at);
            const diff = (v.chars || 0) - currentChars;
            const diffText =
              diff === 0
                ? '같음'
                : diff > 0
                  ? `${diff.toLocaleString()}자 많음`
                  : `${(-diff).toLocaleString()}자 적음`;
            return (
              <div key={v.id} className="sn-vrow">
                <div className="sn-vtop">
                  <b className="sn-mono">
                    {d.getMonth() + 1}.{d.getDate()} {hhmm(v.at)}
                  </b>
                  <span className="sn-tag">{VERSION_REASON_LABEL[v.reason] || '저장'}</span>
                  <span className="sn-label">
                    {(v.chars || 0).toLocaleString()}자 · 지금보다 {diffText}
                  </span>
                </div>
                <div className="sn-vprev">{plainText(v.body).slice(0, 140) || '(구절만 있음)'}</div>
                <div className="sn-vacts">
                  <button type="button" className="sn-btn" onClick={() => onRestore(v)}>
                    이 버전으로 되돌리기
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </SnOverlay>
  );
}
