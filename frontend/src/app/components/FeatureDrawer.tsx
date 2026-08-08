import { Check, Loader2, Lock } from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import type { BoardUiConfig } from "../hooks/useBoardUiConfig";
import type { BoardUiLevel, BoardUiOption } from "../hooks/useBoardFeatures";

/**
 * 기능 서랍 — 이 보드가 무엇을 쓰는지 한 곳에서 보고 바꾼다.
 *
 * 설계: `docs/Design/level-model.html` · `docs/Design/level-onboarding-plan.html`
 *
 * 축이 둘이고 UI도 둘로 갈라 놓는다.
 *  · **레벨**  = 시간 묶음 깊이. 사다리라 하나만 고르는 라디오.
 *  · **옵션**  = 순서 없는 스위치라 각각 토글.
 *
 * 끄는 건 숨기는 것이지 지우는 게 아니다 — 레벨을 내려도 마일스톤·스프린트 행은 남고
 * 다시 올리면 있던 그대로 돌아온다. 이 사실을 화면에서 말해줘야 사람이 마음 놓고 내린다.
 */

interface LevelSpec {
  level: BoardUiLevel;
  name: string;
  depth: string;
  desc: string;
}

const LEVELS: LevelSpec[] = [
  {
    level: 1,
    name: "안 묶음",
    depth: "0겹",
    desc: "할 일을 적고 하나씩 지웁니다. 마감도 담기도 없습니다.",
  },
  {
    level: 2,
    name: "주기",
    depth: "1겹",
    desc: "이번 주기에 할 것만 담고 종료일에 끊습니다. 못 끝낸 건 다음 주기로 넘어갑니다.",
  },
  {
    level: 3,
    name: "단계 ▸ 주기",
    depth: "2겹",
    desc: "여러 주기를 단계로 묶습니다. 로드맵과 간트가 여기서 제 값을 합니다.",
  },
];

interface OptionSpec {
  key: BoardUiOption;
  name: string;
  desc: string;
  where: string;
}

const OPTIONS: OptionSpec[] = [
  {
    key: "members",
    name: "구성원별 보기",
    desc: "컬럼을 사람으로 세웁니다. 한 작업을 여러 명이 나눠 밀기 때문에 같은 카드가 여러 컬럼에 섭니다.",
    where: "스프린트 헤더 오른쪽",
  },
  {
    key: "review",
    name: "리뷰 단계",
    desc: "끝내기 전에 누가 봐줘야 하는 일을 따로 세웁니다. 끄면 진행 → 완료 두 칸이 됩니다.",
    where: "보드 컬럼 · 카드 호버 액션",
  },
  {
    key: "timeblock",
    name: "개인 시간 블록",
    desc: "할 일마다 자기 캘린더에 시간을 잡습니다. 팀 마감이 아니라 개인 일정입니다.",
    where: "카드 안 할 일 줄",
  },
  {
    key: "jira",
    name: "JIRA 연동 화면",
    desc: "JIRA 이슈를 카드로 가져옵니다. 연동이 붙어 있어야 화면이 뜹니다.",
    where: "보드 화면 선택 줄",
  },
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

  const setLevel = (level: BoardUiLevel) => {
    if (!canEdit) return;
    uiConfig.setLevel(level);
  };

  const toggleOption = (key: BoardUiOption) => {
    if (!canEdit) return;
    uiConfig.toggleOption(key);
  };

  return (
    <MotionModal open={open} onClose={onClose} aria-labelledby="feature-drawer-title">
      <div className="w-full sm:max-w-lg bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl overflow-hidden">
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <h2
            id="feature-drawer-title"
            className="text-sm md:text-lg font-bold text-foreground tracking-tight"
          >
            이 보드에서 쓰는 기능
          </h2>
          {!canEdit && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Lock className="w-3 h-3" />
              관리자만 변경
            </span>
          )}
        </div>

        <div className="px-5 pb-5 pt-4 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-5">
          <p className="text-xs text-slate-500 leading-relaxed">
            끄면 화면에서 사라질 뿐 <b className="text-slate-400">데이터는 그대로 남습니다</b>.
            다시 켜면 있던 그대로 돌아옵니다.
          </p>

          {/* 레벨 — 사다리라 하나만 고른다 */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              시간을 몇 겹으로 묶을까요
            </span>
            <div className="space-y-2" role="radiogroup" aria-label="시간 묶음 깊이">
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
                    className={`w-full text-left rounded-xl border p-3.5 transition-colors disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                      active
                        ? "border-bridge-accent bg-bridge-accent/10"
                        : "border-foreground/10 hover:border-foreground/20 hover:bg-foreground/5"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {spec.level}. {spec.name}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {spec.depth}
                      </span>
                      <span className="ml-auto">
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
                        ) : active ? (
                          <Check className="w-4 h-4 text-bridge-accent" />
                        ) : null}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-slate-500 leading-relaxed">
                      {spec.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 옵션 — 순서 없는 스위치 */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              레벨과 상관없이 켜고 끄는 것
            </span>
            <div className="space-y-2">
              {OPTIONS.map((spec) => {
                const on = features.has(spec.key);
                const busy = saving === `opt-${spec.key}`;
                return (
                  <div
                    key={spec.key}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                      on
                        ? "border-bridge-accent/50 bg-bridge-accent/[0.07]"
                        : "border-foreground/10"
                    }`}
                  >
                    <span className="flex-1 min-w-0 space-y-1">
                      <span className="block text-sm font-bold text-foreground">
                        {spec.name}
                      </span>
                      <span className="block text-xs text-slate-500 leading-relaxed">
                        {spec.desc}
                      </span>
                      <span className="block text-xs text-bridge-secondary">
                        나타나는 자리 · {spec.where}
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={spec.name}
                      disabled={!canEdit || !!saving}
                      onClick={() => toggleOption(spec.key)}
                      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                        on ? "bg-bridge-accent" : "bg-foreground/15"
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${
                          on ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                      {busy && (
                        <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 animate-spin text-white" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 완료 컬럼은 스위치로 두지 않는다 — 왜 없는지 말해주지 않으면 누락으로 읽힌다. */}
          <p className="text-xs text-slate-600 leading-relaxed border-t border-foreground/[0.08] pt-4">
            <b className="text-slate-500">완료(Done) 컬럼은 끌 수 없습니다.</b> 끝난 일이 갈 곳이
            없으면 컬럼이 무한정 길어집니다. 묶음 ▸ 작업 ▸ 할 일 구조와 할 일 줄의 담당자도
            레벨과 무관하게 항상 있습니다.
          </p>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-600">Esc 닫기</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            닫기
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
