import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Lock } from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import { BoardMiniPreview, type PreviewZone } from "./BoardMiniPreview";
import type { BoardUiConfig } from "../hooks/useBoardUiConfig";
import type { BoardUiLevel, BoardUiOption } from "../hooks/useBoardFeatures";

/**
 * 기능 서랍 — 이 보드가 무엇을 쓰는지 한 곳에서 보고 바꾼다.
 *
 * 설계: `docs/Design/feature-drawer-redesign.html`
 *      선행: `docs/Design/level-model.html` · `docs/Design/level-onboarding-plan.html`
 *
 * 축이 둘이고 UI도 둘로 갈라 놓는다.
 *  · **레벨**  = 시간 묶음 깊이. 사다리라 하나만 고르는 라디오 → 가로 세그먼트 한 줄.
 *  · **옵션**  = 순서 없는 스위치라 각각 토글 → 한 줄 행.
 *
 * 바꾸는 게 화면 구조이므로 오른쪽에 그 화면을 세워 둔다. 설명문을 읽히는 대신 보여준다.
 *
 * 끄는 건 숨기는 것이지 지우는 게 아니다 — 레벨을 내려도 마일스톤·스프린트 행은 남고
 * 다시 올리면 있던 그대로 돌아온다. 이 사실을 화면에서 말해줘야 사람이 마음 놓고 내린다.
 */

interface LevelSpec {
  level: BoardUiLevel;
  name: string;
  depth: string;
  desc: string;
  /** 이 레벨에서 새로 서는 것. */
  adds: string[];
  /** 이 레벨에서 숨는 것 — 내릴 때 무엇이 사라지는지 미리 말한다. */
  hides: string[];
}

const LEVELS: LevelSpec[] = [
  {
    level: 1,
    name: "안 묶음",
    depth: "0겹",
    desc: "할 일을 적고 하나씩 지웁니다. 마감도 담기도 없습니다.",
    adds: [],
    hides: ["주기 바", "단계 레일", "로드맵 · 간트"],
  },
  {
    level: 2,
    name: "주기",
    depth: "1겹",
    desc: "이번 주기에 할 것만 담고 종료일에 끊습니다. 못 끝낸 건 다음 주기로 넘어갑니다.",
    adds: ["주기 바 · 종료일"],
    hides: ["단계 레일", "로드맵 · 간트"],
  },
  {
    level: 3,
    name: "단계 ▸ 주기",
    depth: "2겹",
    desc: "여러 주기를 단계로 묶습니다. 로드맵과 간트가 여기서 제 값을 합니다.",
    adds: ["단계 레일", "주기 바 · 종료일", "로드맵 · 간트"],
    hides: [],
  },
];

interface OptionSpec {
  key: BoardUiOption;
  name: string;
  /** 접힌 상태에서 보이는 한 줄. 길면 잘리므로 짧게 쓴다. */
  summary: string;
  /** 펼쳤을 때의 설명. 왜 그런지와 어디에 붙는지를 말한다. */
  detail: string;
  /** 켜고 끌 때 미리보기에서 실제로 달라지는 자리. */
  target: PreviewZone;
}

const OPTIONS: OptionSpec[] = [
  {
    key: "members",
    name: "구성원별 보기",
    summary: "컬럼을 사람으로 세웁니다",
    detail:
      "한 작업을 여러 명이 나눠 밀기 때문에 같은 카드가 여러 컬럼에 섭니다. 켜고 끄는 버튼은 스프린트 헤더 오른쪽에 섭니다.",
    target: "cols",
  },
  {
    key: "review",
    name: "리뷰 단계",
    summary: "끝내기 전 확인 칸을 세웁니다",
    detail:
      "끝내기 전에 누가 봐줘야 하는 일을 따로 세웁니다. 끄면 진행 → 완료 두 칸이 되고 카드 호버 액션도 함께 줄어듭니다.",
    target: "cols",
  },
  {
    key: "timeblock",
    name: "개인 시간 블록",
    summary: "할 일마다 개인 캘린더에 시간을 잡습니다",
    detail:
      "팀 마감이 아니라 개인 일정입니다. 카드 안 할 일 줄에 시간 칩이 붙습니다.",
    target: "card",
  },
  {
    key: "jira",
    name: "JIRA 연동 화면",
    summary: "JIRA 이슈를 카드로 가져옵니다",
    detail:
      "연동이 붙어 있어야 화면이 뜹니다. 보드 화면 선택 줄에 탭이 하나 늘어납니다.",
    target: "tabs",
  },
];

/**
 * 끌 수 없는 것들. 문단으로 밀어두면 "없는 기능"으로 읽히므로
 * 같은 목록 안에 잠긴 행으로 세운다.
 */
const LOCKED: { name: string; summary: string }[] = [
  { name: "완료(Done) 컬럼", summary: "끝난 일이 갈 곳" },
  { name: "묶음 ▸ 작업 ▸ 할 일", summary: "모든 레벨의 공통 바닥" },
  { name: "할 일 줄 담당자", summary: "레벨과 무관하게 항상" },
];

interface FeatureDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 읽기·쓰기 한 벌. 유령 슬롯과 같은 인스턴스를 써야 저장 경로가 갈리지 않는다. */
  uiConfig: BoardUiConfig;
  /** 관리자만 바꿀 수 있다 — 보드 단위 설정이라 팀원 화면이 함께 바뀐다. */
  canEdit: boolean;
}

export function FeatureDrawer({
  open,
  onClose,
  uiConfig,
  canEdit,
}: FeatureDrawerProps) {
  const { features, pending: saving } = uiConfig;

  const [expanded, setExpanded] = useState<Set<BoardUiOption>>(new Set());
  const [hoverZone, setHoverZone] = useState<PreviewZone | null>(null);
  const [flashZone, setFlashZone] = useState<PreviewZone | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const prevSaving = useRef<string | null>(null);

  /** 저장이 끝난 순간을 잡아 잠깐 알린다 — 즉시 저장인데 신호가 없으면 매번 불안해진다. */
  useEffect(() => {
    const wasSaving = prevSaving.current;
    prevSaving.current = saving;
    if (!wasSaving || saving) return;
    setJustSaved(true);
    const timer = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saving]);

  /** 방금 바뀐 자리의 강조는 잠깐만 둔다. */
  useEffect(() => {
    if (!flashZone) return;
    const timer = setTimeout(() => setFlashZone(null), 900);
    return () => clearTimeout(timer);
  }, [flashZone]);

  /** 닫았다 열면 펼침·강조는 초기 상태로 돌아온다. */
  useEffect(() => {
    if (open) return;
    setExpanded(new Set());
    setHoverZone(null);
    setFlashZone(null);
    setShowMobilePreview(false);
  }, [open]);

  const setLevel = (level: BoardUiLevel) => {
    if (!canEdit || level === features.level) return;
    uiConfig.setLevel(level);
    setFlashZone(level >= 2 ? "sprint" : "cols");
  };

  const toggleOption = (spec: OptionSpec) => {
    if (!canEdit) return;
    uiConfig.toggleOption(spec.key);
    setFlashZone(spec.target);
  };

  const toggleExpanded = (key: BoardUiOption) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const current = LEVELS.find((l) => l.level === features.level) ?? LEVELS[2];
  const optionCount = features.options.length;

  const preview = (
    <BoardMiniPreview
      level={features.level}
      options={features.options}
      highlight={hoverZone}
      flash={flashZone}
    />
  );

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      aria-labelledby="feature-drawer-title"
      accentColor
      className="sm:max-w-3xl"
    >
      {/* 헤더 — 제목 옆에 지금 이 보드가 무슨 조합인지 요약해 둔다 */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <h2
          id="feature-drawer-title"
          className="text-sm md:text-lg font-bold text-foreground tracking-tight"
        >
          이 보드에서 쓰는 기능
        </h2>
        <div className="ml-auto flex items-center gap-1.5">
          {!canEdit && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Lock className="w-3 h-3" />
              관리자만 변경
            </span>
          )}
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent whitespace-nowrap">
            {current.name}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full border border-foreground/10 text-slate-500 whitespace-nowrap tabular-nums">
            옵션 {optionCount} / {OPTIONS.length}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_280px]">
        {/* ── 컨트롤 ── */}
        <div className="px-5 pt-4 pb-5 space-y-5">
          {/* 모바일에서는 미리보기를 접어 둔다 — 2단을 쌓으면 다시 스크롤이 된다 */}
          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setShowMobilePreview((v) => !v)}
              aria-expanded={showMobilePreview}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-foreground/[0.12] text-xs text-slate-400 hover:bg-foreground/5 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 text-bridge-secondary transition-transform motion-reduce:transition-none ${
                  showMobilePreview ? "rotate-180" : "-rotate-90"
                }`}
              />
              이 설정의 보드 보기
            </button>
            {showMobilePreview && <div className="mt-3">{preview}</div>}
          </div>

          {/* 레벨 — 사다리라 가로 한 줄로 세운다 */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
              시간을 몇 겹으로 묶을까요
            </span>
            <div
              className="grid grid-cols-3 rounded-xl border border-foreground/10 overflow-hidden"
              role="radiogroup"
              aria-label="시간 묶음 깊이"
            >
              {LEVELS.map((spec) => {
                const active = features.level === spec.level;
                const busy = saving === `level-${spec.level}`;
                return (
                  <button
                    key={spec.level}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!canEdit || !!saving}
                    onClick={() => setLevel(spec.level)}
                    className={`flex flex-col items-center gap-1 px-2 py-2.5 border-r border-foreground/10 last:border-r-0 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-bridge-accent/50 ${
                      active
                        ? "bg-bridge-accent/15"
                        : "hover:bg-foreground/5 disabled:hover:bg-transparent"
                    } ${!canEdit ? "opacity-40 cursor-not-allowed" : "disabled:cursor-not-allowed"}`}
                  >
                    {/* 겹 수를 막대로 — 3이 2를 포함한다는 걸 숫자보다 빨리 말한다 */}
                    <span className="flex items-end gap-0.5 h-[7px]" aria-hidden="true">
                      {[3, 5, 7].slice(0, spec.level).map((h) => (
                        <span
                          key={h}
                          style={{ height: `${h}px` }}
                          className={`w-3 rounded-sm ${
                            active ? "bg-bridge-accent" : "bg-foreground/20"
                          }`}
                        />
                      ))}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        active ? "text-bridge-accent" : "text-slate-400"
                      }`}
                    >
                      {spec.name}
                    </span>
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-bridge-accent" />
                    ) : (
                      <span className="text-xs text-slate-500 tabular-nums">
                        {spec.depth}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              {current.desc}
            </p>
            {(current.adds.length > 0 || current.hides.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {current.adds.map((a) => (
                  <span
                    key={a}
                    className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  >
                    ＋ {a}
                  </span>
                ))}
                {current.hides.map((h) => (
                  <span
                    key={h}
                    className="text-xs px-2 py-0.5 rounded-full border border-foreground/10 text-slate-500"
                  >
                    숨김 · {h}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 옵션 — 순서 없는 스위치. 한 줄 행으로 세우고 설명은 접는다 */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
              레벨과 상관없이 켜고 끄는 것
            </span>
            <div className="rounded-xl border border-foreground/10 overflow-hidden">
              {OPTIONS.map((spec) => {
                const on = features.has(spec.key);
                const busy = saving === `opt-${spec.key}`;
                const isOpen = expanded.has(spec.key);
                return (
                  <div
                    key={spec.key}
                    className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-center border-b border-foreground/10 last:border-b-0 hover:bg-foreground/5 transition-colors"
                    onMouseEnter={() => setHoverZone(spec.target)}
                    onMouseLeave={() => setHoverZone(null)}
                  >
                    {/* 켜짐은 레일로만 말한다 — 카드 전체를 칠하면 강조가 다섯이 된다 */}
                    <span
                      aria-hidden="true"
                      className={`self-stretch transition-colors ${
                        on ? "bg-bridge-accent" : "bg-transparent"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(spec.key)}
                      aria-expanded={isOpen}
                      className="text-left min-w-0 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-bridge-accent/50"
                    >
                      <span className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-foreground">
                        {spec.name}
                        <ChevronDown
                          className={`w-3 h-3 text-slate-500 transition-transform motion-reduce:transition-none ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </span>
                      <span
                        className={`block text-xs text-slate-500 leading-relaxed ${
                          isOpen ? "" : "truncate"
                        }`}
                      >
                        {spec.summary}
                      </span>
                      {isOpen && (
                        <span className="block mt-1.5 pt-1.5 border-t border-dashed border-foreground/10 text-xs text-slate-400 leading-relaxed">
                          {spec.detail}
                        </span>
                      )}
                    </button>
                    <span className="px-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={spec.name}
                        disabled={!canEdit || !!saving}
                        onClick={() => toggleOption(spec)}
                        className={`relative block w-11 h-6 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                          on ? "bg-bridge-accent" : "bg-foreground/15"
                        }`}
                      >
                        <span
                          className={`absolute left-0 top-1 w-4 h-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${
                            on ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                        {busy && (
                          <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 animate-spin text-white" />
                        )}
                      </button>
                    </span>
                  </div>
                );
              })}

              {/* 못 끄는 것도 같은 목록에 세운다 — 빠진 게 아니라 고정된 것으로 읽히게 */}
              {LOCKED.map((item) => (
                <div
                  key={item.name}
                  aria-disabled="true"
                  className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-center border-b border-foreground/10 last:border-b-0"
                >
                  <span aria-hidden="true" className="self-stretch bg-transparent" />
                  <div className="min-w-0 px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-slate-400">
                      {item.name}
                      <span className="text-xs font-normal uppercase tracking-widest px-1.5 rounded border border-foreground/10 text-slate-500">
                        always
                      </span>
                    </span>
                    <span className="block text-xs text-slate-500 leading-relaxed truncate">
                      {item.summary}
                    </span>
                  </div>
                  <span className="px-3">
                    <span
                      role="switch"
                      aria-checked="true"
                      aria-disabled="true"
                      aria-label={`${item.name} · 끌 수 없음`}
                      className="relative block w-11 h-6 rounded-full bg-foreground/10 cursor-not-allowed"
                    >
                      <span className="absolute left-0 top-1 translate-x-6 w-4 h-4 rounded-full bg-slate-500" />
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mt-2">
              <b className="font-bold text-slate-500">always</b> 표시는 끌 수 없습니다. 끝난
              일이 갈 곳이 없으면 컬럼이 무한정 길어지기 때문입니다.
            </p>
          </div>
        </div>

        {/* ── 미리보기 ── */}
        <aside className="hidden md:block border-l border-foreground/[0.08] bg-bridge-dark px-4 pt-4 pb-5">
          {preview}
          <p className="text-xs text-slate-600 leading-relaxed mt-3 pt-3 border-t border-foreground/[0.08]">
            끄면 화면에서 사라질 뿐{" "}
            <b className="font-bold text-slate-500">데이터는 그대로 남습니다</b>. 다시 켜면
            있던 그대로 돌아옵니다.
          </p>
        </aside>
      </div>

      <div className="flex items-center gap-3 px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">Esc 닫기</span>
        {justSaved && (
          <span
            role="status"
            className="text-xs text-emerald-600 dark:text-emerald-400"
          >
            저장됨
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
        >
          완료
        </button>
      </div>
    </MotionModal>
  );
}
