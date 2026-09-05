import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Settings2 } from "lucide-react";
import type { ChecklistPreset } from "../types";

/**
 * 프리셋 칩 + 선택 팝오버 — 태스크 셀의 백로그 칩과 같은 시각 문법.
 * 미지정이면 점선 칩(인디고 틴트), 지정이면 채워진 칩(프리셋 이름).
 * 팝오버는 좌측 프리셋 목록 / 우측 항목 미리보기 / 하단 액션(적용·해제·저장·관리).
 */
export function ChecklistPresetPopover({
  presets,
  members,
  presetId,
  taskItemTitles,
  defaultSaveName,
  canEdit,
  onApply,
  onClear,
  onSaveCurrent,
  onManage,
}: {
  presets: ChecklistPreset[];
  /** 항목 미리보기의 담당자 이름 표시용 (보드 멤버) */
  members: { id: string; name: string }[];
  /** 이 태스크에 지정된 프리셋 id (없으면 null) */
  presetId: string | null;
  /** 태스크의 현재 체크 항목 제목들 — "현재 항목을 프리셋으로 저장" 재료 */
  taskItemTitles: string[];
  /** 프리셋 저장 시 이름 기본값 (태스크가 속한 피처명) */
  defaultSaveName: string;
  canEdit: boolean;
  onApply: (presetId: string) => Promise<void>;
  onClear: () => Promise<void>;
  onSaveCurrent: (name: string) => Promise<void>;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /** 팝오버 안에서 미리보기 중인 프리셋 */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** "현재 항목을 프리셋으로 저장" 이름 입력 모드 */
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState(false);

  const current = presetId ? presets.find((p) => p.id === presetId) : undefined;

  const toggleOpen = useCallback(() => {
    setOpen((v) => {
      if (!v) {
        setSelectedId(presetId ?? null);
        setSaveMode(false);
      }
      return !v;
    });
  }, [presetId]);

  const run = useCallback(async (fn: () => Promise<void>, close: boolean) => {
    setBusy(true);
    try {
      await fn();
      if (close) setOpen(false);
      else setSaveMode(false);
    } catch {
      /* 실패 시 팝오버 유지 — 재시도 가능 */
    } finally {
      setBusy(false);
    }
  }, []);

  // 읽기 전용: 지정된 프리셋만 정적 칩으로 보여주고, 미지정이면 아무것도 안 그린다
  if (!canEdit) {
    return current ? (
      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent whitespace-nowrap">
        {current.name}
      </span>
    ) : null;
  }

  const selected =
    (selectedId ? presets.find((p) => p.id === selectedId) : undefined) ??
    presets[0];
  const canSaveCurrent = taskItemTitles.length > 0;

  const commitSave = () => {
    const name = saveName.trim();
    if (!name || busy) return;
    void run(() => onSaveCurrent(name), false);
  };

  const startSaveMode = () => {
    setSaveName(defaultSaveName);
    setSaveMode(true);
  };

  const linkClass =
    "text-xs text-slate-500 hover:text-foreground transition-colors";

  return (
    <span className="relative inline-flex">
      <button
        onClick={toggleOpen}
        aria-expanded={open}
        className={
          current
            ? "text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity"
            : "text-xs font-medium px-1.5 py-0.5 rounded-full border border-dashed border-bridge-accent/50 text-bridge-accent/70 whitespace-nowrap cursor-pointer hover:text-bridge-accent hover:border-bridge-accent transition-colors"
        }
      >
        {current?.name ??
          t("milestone.preset.chip", { defaultValue: "프리셋" })}
      </button>
      {open && (
        <>
          <span
            className="fixed inset-0 z-30 block"
            onClick={() => setOpen(false)}
          />
          <span className="absolute top-full left-0 mt-1 z-40 w-80 bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl block">
            {presets.length === 0 ? (
              /* 빈 상태 — 아직 프리셋이 없다 */
              <span className="block p-4 space-y-3">
                <span className="block text-xs text-slate-500">
                  {t("milestone.preset.empty", {
                    defaultValue:
                      "아직 프리셋이 없습니다. 자주 쓰는 체크리스트를 저장해 두고 한 번에 추가하세요.",
                  })}
                </span>
                {saveMode ? (
                  <input
                    autoFocus
                    value={saveName}
                    disabled={busy}
                    placeholder={t("milestone.preset.namePlaceholder", {
                      defaultValue: "프리셋 이름",
                    })}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter") commitSave();
                      else if (e.key === "Escape") setSaveMode(false);
                    }}
                    className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl px-3 py-1.5 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                  />
                ) : (
                  <span className="flex items-center gap-3">
                    {canSaveCurrent && (
                      <button onClick={startSaveMode} className={linkClass}>
                        {t("milestone.preset.saveCurrentShort", {
                          defaultValue: "현재 항목으로 저장",
                        })}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setOpen(false);
                        onManage();
                      }}
                      className={linkClass}
                    >
                      {t("milestone.preset.createNew", {
                        defaultValue: "새 프리셋 만들기",
                      })}
                    </button>
                  </span>
                )}
              </span>
            ) : (
              <>
                {/* 좌: 프리셋 목록 / 우: 선택 프리셋 항목 미리보기 */}
                <span className="flex max-h-60">
                  <span className="block w-[45%] border-r border-foreground/[0.08] overflow-y-auto custom-scrollbar py-1.5">
                    {presets.map((p) => {
                      const on = p.id === selected?.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedId(p.id)}
                          className={`w-full px-3 py-1.5 text-left transition-colors block ${
                            on ? "bg-bridge-accent/10" : "hover:bg-foreground/5"
                          }`}
                        >
                          <span
                            className={`block text-xs truncate ${
                              on
                                ? "text-bridge-accent font-bold"
                                : "text-foreground"
                            }`}
                          >
                            {p.name}
                          </span>
                          <span className="block text-xs text-slate-500 tabular-nums">
                            {t("milestone.preset.itemCount", {
                              count: p.item_count,
                              defaultValue: "{{count}}개 항목",
                            })}
                          </span>
                        </button>
                      );
                    })}
                  </span>
                  <span className="block flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                    {selected && selected.items.length > 0 ? (
                      [...selected.items]
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((item) => {
                          const assigneeName = item.assignee_id
                            ? members.find((m) => m.id === item.assignee_id)
                                ?.name
                            : undefined;
                          return (
                            <span
                              key={item.id}
                              className="flex items-start gap-1.5 text-xs text-foreground/80"
                            >
                              <span className="w-3 h-3 mt-px rounded border border-foreground/25 flex-shrink-0" />
                              <span className="min-w-0 break-words">
                                {item.title}
                                {assigneeName && (
                                  <span className="ml-1 text-slate-500">
                                    {assigneeName}
                                  </span>
                                )}
                              </span>
                            </span>
                          );
                        })
                    ) : (
                      <span className="block text-xs text-slate-600">
                        {t("milestone.preset.noItems", {
                          defaultValue: "항목 없음",
                        })}
                      </span>
                    )}
                  </span>
                </span>

                {/* 하단 액션 */}
                <span className="block border-t border-foreground/[0.08] p-3 space-y-2">
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        selected && void run(() => onApply(selected.id), true)
                      }
                      disabled={busy || !selected}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {t("milestone.preset.applyN", {
                        count: selected?.item_count ?? 0,
                        defaultValue: "{{count}}개 항목 추가",
                      })}
                    </button>
                    {presetId && (
                      <button
                        onClick={() => void run(() => onClear(), true)}
                        disabled={busy}
                        className="text-xs text-slate-500 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        {t("milestone.preset.clear", {
                          defaultValue: "지정 해제",
                        })}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setOpen(false);
                        onManage();
                      }}
                      className={`ml-auto flex items-center gap-1 ${linkClass}`}
                    >
                      <Settings2 className="h-3 w-3" />
                      {t("milestone.preset.manage", {
                        defaultValue: "프리셋 관리",
                      })}
                    </button>
                  </span>
                  {canSaveCurrent &&
                    (saveMode ? (
                      <input
                        autoFocus
                        value={saveName}
                        disabled={busy}
                        placeholder={t("milestone.preset.namePlaceholder", {
                          defaultValue: "프리셋 이름",
                        })}
                        onChange={(e) => setSaveName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Enter") commitSave();
                          else if (e.key === "Escape") setSaveMode(false);
                        }}
                        className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl px-3 py-1.5 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                      />
                    ) : (
                      <button onClick={startSaveMode} className={linkClass}>
                        {t("milestone.preset.saveCurrent", {
                          defaultValue: "현재 항목을 프리셋으로 저장",
                        })}
                      </button>
                    ))}
                </span>
              </>
            )}
          </span>
        </>
      )}
    </span>
  );
}
