import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SnOverlay } from './SnOverlay';
import {
  STYLE_COLORS,
  STYLE_DEFAULT,
  STYLE_HIGHLIGHTS,
  STYLE_UI,
  applyStyle,
  type HighlightKey,
  type SermonStyle,
  type StyleColorKey,
  type StyleGroup,
} from './sermonStyle';
import { esc } from './sermonTypes';
import { getBible } from './useBible';

/**
 * 서식 설정 창 — 기획서 §7.
 * 바꾼 즉시 미리보기와 열려 있는 노트에 반영되고, 항목별로 기본값으로 되돌릴 수 있다.
 */
interface StyleSettingsModalProps {
  open: boolean;
  style: SermonStyle;
  onChange: (next: SermonStyle) => void;
  onClose: () => void;
}

function previewHTML(): string {
  const bible = getBible();
  const vs = bible ? bible[42]?.[14]?.[4] || '' : '나는 포도나무요 너희는 가지라';
  const cut = vs.indexOf('나는 포도나무요');
  const vtxt =
    cut >= 0 ? `${esc(vs.slice(0, cut))}<b>나는 포도나무요</b>${esc(vs.slice(cut + 8))}` : esc(vs);
  return (
    '<h3>1. 붙어 있음이 먼저다</h3><p>열매는 노력보다 <b>관계의 결과</b>라는 말씀.</p>' +
    '<ul><li>말씀 앞에 머무르기</li><li>하루 한 장 읽기</li></ul>' +
    `<div class="sn-vblock" style="margin:12px 0 0"><div class="sn-vt" style="font-size:15px;padding:10px 14px 12px 34px"><sup>5</sup>${vtxt}</div></div>`
  );
}

export function StyleSettingsModal({ open, style, onChange, onClose }: StyleSettingsModalProps) {
  const [tab, setTab] = useState<StyleGroup>('bold');
  const previewRef = useRef<HTMLDivElement>(null);

  // 포털 밖이라 .sermon-app 의 변수가 닿지 않는다 → 미리보기 상자에 직접 적용
  useEffect(() => {
    if (open) applyStyle(previewRef.current, style);
  }, [open, style]);

  const g = style[tab] as unknown as Record<string, unknown>;
  const set = (k: string, v: unknown) => {
    onChange({ ...style, [tab]: { ...(style[tab] as object), [k]: v } } as SermonStyle);
  };

  return (
    <SnOverlay open={open} onClose={onClose} className="sn-styler" aria-labelledby="sn-style-title">
      <div className="sn-shead">
        <h2 id="sn-style-title">서식 설정</h2>
        <button
          type="button"
          className="sn-btn sn-icon-only sn-ghost"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="sn-icon" />
        </button>
      </div>
      <div className="sn-ptabs" role="tablist">
        {(Object.keys(STYLE_UI) as StyleGroup[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {STYLE_UI[k].name}
          </button>
        ))}
      </div>
      <div className="sn-sbody">
        <div className="sn-sctl">
          {STYLE_UI[tab].items.map((it) => (
            <div key={it.k} className="sn-sgrp">
              <div className="sn-label">{it.l}</div>
              <div className="sn-seg">
                {it.sw &&
                  (Object.entries(STYLE_COLORS) as Array<[StyleColorKey, [string, string]]>).map(
                    ([k, [n, v]]) => (
                      <button
                        key={k}
                        type="button"
                        className="sn-sw"
                        aria-pressed={g[it.k] === k}
                        aria-label={n}
                        title={n}
                        onClick={() => set(it.k, k)}
                      >
                        <i style={{ background: v }} />
                      </button>
                    ),
                  )}
                {it.hl &&
                  (
                    Object.entries(STYLE_HIGHLIGHTS) as Array<
                      [HighlightKey, [string, string | null]]
                    >
                  ).map(([k, [n, v]]) =>
                    k === 'none' ? (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={g[it.k] === 'none'}
                        onClick={() => set(it.k, 'none')}
                      >
                        없음
                      </button>
                    ) : (
                      <button
                        key={k}
                        type="button"
                        className="sn-sw"
                        aria-pressed={g[it.k] === k}
                        aria-label={n}
                        title={n}
                        onClick={() => set(it.k, k)}
                      >
                        <i style={{ background: v ?? undefined }} />
                      </button>
                    ),
                  )}
                {it.o &&
                  it.o.map(([v, n]) => (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={g[it.k] === v}
                      onClick={() => set(it.k, v)}
                    >
                      {n}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div
          ref={previewRef}
          className="sn-spreview sn-rich"
          aria-label="미리보기"
          dangerouslySetInnerHTML={{ __html: previewHTML() }}
        />
      </div>
      <div className="sn-sfoot">
        <button
          type="button"
          className="sn-btn sn-ghost"
          onClick={() =>
            onChange({ ...style, [tab]: JSON.parse(JSON.stringify(STYLE_DEFAULT[tab])) })
          }
        >
          이 항목 기본값으로
        </button>
        <span style={{ flex: 1 }} />
        <span className="sn-label">이 기기에 저장됨</span>
        <button type="button" className="sn-btn sn-primary" onClick={onClose}>
          완료
        </button>
      </div>
    </SnOverlay>
  );
}
