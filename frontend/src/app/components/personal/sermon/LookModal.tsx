import { X } from 'lucide-react';
import { Mascot } from './Mascot';
import { SnOverlay } from './SnOverlay';
import { INKS, MASCOTS, type SermonLook } from './sermonLook';

/** 「꾸미기」 창 — 마스코트와 잉크(색 조합)를 고른다. 바꾼 즉시 화면 전체에 반영된다. */
interface LookModalProps {
  open: boolean;
  look: SermonLook;
  onChange: (next: SermonLook) => void;
  onClose: () => void;
}

export function LookModal({ open, look, onChange, onClose }: LookModalProps) {
  return (
    <SnOverlay open={open} onClose={onClose} className="sn-look" aria-labelledby="sn-look-title">
      <div className="sn-shead">
        <h2 id="sn-look-title">내 설교 노트 꾸미기</h2>
        <button
          type="button"
          className="sn-btn sn-icon-only sn-ghost"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="sn-icon" />
        </button>
      </div>
      <div className="sn-look-body">
        <div className="sn-label">함께할 친구</div>
        <div className="sn-look-opts" role="radiogroup" aria-label="마스코트">
          {MASCOTS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={look.mascot === m.id}
              className="sn-look-opt sn-look-m"
              onClick={() => onChange({ ...look, mascot: m.id })}
            >
              <Mascot kind={m.id} size={56} state={look.mascot === m.id ? 'done' : 'idle'} />
              <b>{m.name}</b>
              <small>{m.desc}</small>
            </button>
          ))}
        </div>
        <div className="sn-label">색</div>
        <div className="sn-look-opts" role="radiogroup" aria-label="색 조합">
          {INKS.map((i) => (
            <button
              key={i.id}
              type="button"
              role="radio"
              aria-checked={look.ink === i.id}
              className="sn-look-opt sn-look-ink"
              onClick={() => onChange({ ...look, ink: i.id })}
            >
              <span className="sn-look-sw" aria-hidden>
                <i style={{ background: i.sw[0] }} />
                <i style={{ background: i.sw[1] }} />
              </span>
              {i.name}
            </button>
          ))}
        </div>
        <p className="sn-look-note">이 기기에 저장돼요. 라이트·다크는 앱 테마를 따라가요.</p>
      </div>
    </SnOverlay>
  );
}
