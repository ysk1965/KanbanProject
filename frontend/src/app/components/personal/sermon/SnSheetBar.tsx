import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import './actionBar.css';

/**
 * 시트 하단 바 — 화면 동작 바(SnActionBar)와 같은 자리 규칙.
 * 왼쪽 끝 = 닫기(처음 한 번 묻는 시트는 "나중에", 여러 단계면 둘째부터 "← 이전"),
 * 오른쪽 끝 = 주요 동작 하나(없으면 비움). 위쪽 ✕는 두지 않는다.
 */
interface Props {
  onClose: () => void;
  /** 왼쪽 버튼 이름 (기본 "닫기") */
  closeLabel?: string;
  /** 한 단계 뒤로 — 화살표를 붙인다 */
  back?: boolean;
  /** 가운데 작은 안내 */
  note?: ReactNode;
  /** 오른쪽 주요 동작 */
  children?: ReactNode;
  className?: string;
}

export function SnSheetBar({
  onClose,
  closeLabel = '닫기',
  back,
  note,
  children,
  className = '',
}: Props) {
  return (
    <div className={`sn-sbar ${className}`}>
      <button type="button" className="sn-sbar-close" onClick={onClose}>
        {back && <ArrowLeft className="sn-icon" aria-hidden />}
        {closeLabel}
      </button>
      {note && <span className="sn-sbar-note">{note}</span>}
      {children && <div className="sn-sbar-main">{children}</div>}
    </div>
  );
}
