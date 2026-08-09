import type { BoardUiLevel, BoardUiOption } from "../hooks/useBoardFeatures";

/**
 * 이 설정으로 보드가 어떻게 서는지 보여주는 미니 와이어.
 *
 * 설계: `docs/Design/feature-drawer-redesign.html`
 *
 * 기능 서랍이 바꾸는 건 화면 구조인데 그동안 그 구조를 글로만 설명했다 —
 * "컬럼을 사람으로 세웁니다"를 읽게 하는 대신 사람으로 선 컬럼을 보여준다.
 *
 * 순수 프레젠테이션이다. 데이터에 손대지 않고 props만 그린다.
 */

/** 미리보기에서 짚을 수 있는 자리. 옵션 행 hover·변경 시 여기에 링을 두른다. */
export type PreviewZone = "tabs" | "phase" | "sprint" | "cols" | "card";

interface BoardMiniPreviewProps {
  level: BoardUiLevel;
  options: BoardUiOption[];
  /** 마우스가 얹힌 옵션이 가리키는 자리. */
  highlight?: PreviewZone | null;
  /** 방금 바뀐 자리 — 잠깐 강조해 무엇이 움직였는지 알린다. */
  flash?: PreviewZone | null;
}

/** 사람 컬럼일 때 세울 이름. 실제 멤버가 아니라 형태만 보여주는 자리표시자. */
const SAMPLE_MEMBERS: [string, string][] = [
  ["수현", "3"],
  ["도윤", "2"],
  ["민아", "4"],
];

export function BoardMiniPreview({
  level,
  options,
  highlight,
  flash,
}: BoardMiniPreviewProps) {
  const has = (o: BoardUiOption) => options.includes(o);

  const ring = (zone: PreviewZone) =>
    highlight === zone || flash === zone
      ? "ring-2 ring-bridge-accent ring-offset-2 ring-offset-bridge-dark"
      : "ring-0 ring-transparent";

  const columns: [string, string][] = has("members")
    ? SAMPLE_MEMBERS
    : has("review")
      ? [
          ["진행", "5"],
          ["리뷰", "2"],
          ["완료", "9"],
        ]
      : [
          ["진행", "5"],
          ["완료", "9"],
        ];

  const summary = has("members")
    ? "구성원별 보기가 켜져 컬럼이 사람으로 섰습니다."
    : has("review")
      ? "진행 → 리뷰 → 완료 세 칸입니다."
      : "진행 → 완료 두 칸입니다.";

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
        이 설정의 보드
      </span>

      <div
        className="rounded-xl border border-foreground/[0.08] bg-bridge-obsidian p-2.5 flex flex-col gap-2"
        aria-hidden="true"
      >
        {/* 화면 선택 줄 */}
        <div
          className={`flex gap-1 rounded-md transition-shadow ${ring("tabs")}`}
        >
          <span className="text-xs px-2 py-0.5 rounded-md bg-bridge-accent/15 text-bridge-accent border border-bridge-accent/40">
            보드
          </span>
          {level === 3 && (
            <>
              <span className="text-xs px-2 py-0.5 rounded-md border border-foreground/10 text-slate-500">
                로드맵
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md border border-foreground/10 text-slate-500">
                간트
              </span>
            </>
          )}
          {has("jira") && (
            <span className="text-xs px-2 py-0.5 rounded-md border border-foreground/10 text-slate-500">
              JIRA
            </span>
          )}
        </div>

        {/* 단계 레일 — 레벨 3에서만 */}
        {level === 3 && (
          <div className={`flex gap-1 rounded-md transition-shadow ${ring("phase")}`}>
            {["기획", "제작", "검수"].map((p) => (
              <span
                key={p}
                className="flex-1 text-center text-xs py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              >
                {p}
              </span>
            ))}
          </div>
        )}

        {/* 주기 바 — 레벨 2 이상 */}
        {level >= 2 && (
          <div
            className={`flex items-center gap-2 px-2 py-1 rounded-md bg-bridge-secondary/15 border border-bridge-secondary/30 transition-shadow ${ring("sprint")}`}
          >
            <span className="text-xs font-bold text-bridge-secondary">스프린트 7</span>
            {has("members") && (
              <span className="text-xs px-1.5 rounded-full border border-bridge-accent/40 text-bridge-accent">
                구성원별
              </span>
            )}
            <span className="ml-auto text-xs text-slate-500 tabular-nums">~03.14</span>
          </div>
        )}

        {/* 컬럼 */}
        <div className={`flex gap-1.5 rounded-md transition-shadow ${ring("cols")}`}>
          {columns.map(([name, count], i) => (
            <div
              key={name}
              className="flex-1 min-w-0 rounded-lg border border-foreground/[0.08] bg-bridge-dark p-1.5 flex flex-col gap-1.5"
            >
              <span className="block text-xs text-center text-slate-500 truncate">
                <b className="font-bold text-slate-400">{name}</b> {count}
              </span>
              {Array.from({ length: i === 0 ? 2 : 1 }).map((_, k) => {
                const isAnchor = i === 0 && k === 0;
                return (
                  <div
                    key={k}
                    className={`rounded-md border border-foreground/[0.08] bg-bridge-obsidian p-1.5 transition-shadow ${
                      isAnchor ? ring("card") : ""
                    }`}
                  >
                    <span className="block h-[3px] rounded-full bg-foreground/20" />
                    <span className="block h-[3px] w-2/3 rounded-full bg-foreground/10 mt-1" />
                    {has("timeblock") && isAnchor && (
                      <span className="inline-block mt-1.5 text-xs leading-none px-1 py-0.5 rounded bg-bridge-secondary/15 text-bridge-secondary border border-bridge-secondary/30 tabular-nums">
                        14:00
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">{summary}</p>
    </div>
  );
}
