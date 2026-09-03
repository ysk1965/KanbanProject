import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import type { ChecklistPreset } from "../types";
import { checklistPresetService } from "../utils/services";
import { MotionModal } from "./ui/MotionModal";

/** 새 프리셋 드래프트를 뜻하는 선택 키 (서버 id와 충돌하지 않는 값) */
const NEW_KEY = "__new__";

interface DraftItem {
  /** 리스트 렌더 키 — 기존 항목은 서버 id, 새 항목은 로컬 발급 */
  key: string;
  title: string;
}

interface Draft {
  name: string;
  items: DraftItem[];
}

let draftSeq = 0;
const nextKey = () => `draft-${++draftSeq}`;

const toDraft = (preset: ChecklistPreset | undefined): Draft =>
  preset
    ? {
        name: preset.name,
        items: [...preset.items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((i) => ({ key: i.id, title: i.title })),
      }
    : { name: "", items: [] };

/**
 * 체크리스트 프리셋 관리 모달 — 좌측 목록에서 고르고 우측에서
 * 이름/항목(인라인 수정·추가·삭제·순서 이동)을 편집한다. 저장은 PUT 전체 교체.
 */
export function ChecklistPresetManageModal({
  open,
  boardId,
  presets,
  onClose,
  onPresetsChange,
}: {
  open: boolean;
  boardId: string;
  presets: ChecklistPreset[];
  onClose: () => void;
  /** 생성/수정/삭제 결과를 부모 목록에 반영 */
  onPresetsChange: (presets: ChecklistPreset[]) => void;
}) {
  const { t } = useTranslation();
  /** 선택 중인 프리셋 id, NEW_KEY = 새 프리셋 드래프트 */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", items: [] });
  const [newItemTitle, setNewItemTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 열릴 때 첫 프리셋 선택 (없으면 새 드래프트)
  useEffect(() => {
    if (!open) return;
    const key = presets[0]?.id ?? NEW_KEY;
    setSelectedKey(key);
    setDraft(toDraft(presets[0]));
    setNewItemTitle("");
    setConfirmingDelete(false);
    // presets 갱신마다 선택을 되돌리면 편집 중 드래프트가 날아간다 — open 전이만 감지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const select = useCallback(
    (key: string) => {
      setSelectedKey(key);
      setDraft(
        key === NEW_KEY
          ? { name: "", items: [] }
          : toDraft(presets.find((p) => p.id === key)),
      );
      setNewItemTitle("");
      setConfirmingDelete(false);
    },
    [presets],
  );

  const patchItem = (key: string, title: string) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((i) => (i.key === key ? { ...i, title } : i)),
    }));

  const removeItem = (key: string) =>
    setDraft((d) => ({ ...d, items: d.items.filter((i) => i.key !== key) }));

  const moveItem = (key: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.items.findIndex((i) => i.key === key);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= d.items.length) return d;
      const items = [...d.items];
      [items[idx], items[to]] = [items[to], items[idx]];
      return { ...d, items };
    });

  const addItem = () => {
    const title = newItemTitle.trim();
    if (!title) return;
    setDraft((d) => ({
      ...d,
      items: [...d.items, { key: nextKey(), title }],
    }));
    setNewItemTitle("");
  };

  const canSave =
    !!draft.name.trim() &&
    draft.items.some((i) => i.title.trim()) &&
    !saving;

  const handleSave = async () => {
    if (!canSave || !selectedKey) return;
    const body = {
      name: draft.name.trim(),
      items: draft.items
        .map((i) => ({ title: i.title.trim() }))
        .filter((i) => i.title),
    };
    setSaving(true);
    try {
      if (selectedKey === NEW_KEY) {
        const created = await checklistPresetService.createPreset(
          boardId,
          body,
        );
        onPresetsChange([...presets, created]);
        setSelectedKey(created.id);
        setDraft(toDraft(created));
      } else {
        const updated = await checklistPresetService.updatePreset(
          boardId,
          selectedKey,
          body,
        );
        onPresetsChange(presets.map((p) => (p.id === updated.id ? updated : p)));
        setDraft(toDraft(updated));
      }
    } catch {
      /* 실패 시 드래프트 유지 — 재시도 가능 */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedKey || selectedKey === NEW_KEY || saving) return;
    setSaving(true);
    try {
      await checklistPresetService.deletePreset(boardId, selectedKey);
      const next = presets.filter((p) => p.id !== selectedKey);
      onPresetsChange(next);
      const key = next[0]?.id ?? NEW_KEY;
      setSelectedKey(key);
      setDraft(toDraft(next[0]));
      setConfirmingDelete(false);
    } catch {
      /* 실패 시 유지 */
    } finally {
      setSaving(false);
    }
  };

  const isNew = selectedKey === NEW_KEY;

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      className="sm:max-w-2xl"
      aria-labelledby="checklist-preset-manage-title"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <ListChecks className="h-4 w-4 text-bridge-accent" />
        <h2
          id="checklist-preset-manage-title"
          className="text-xs md:text-sm font-bold text-foreground"
        >
          {t("milestone.preset.manageTitle", {
            defaultValue: "체크리스트 프리셋 관리",
          })}
        </h2>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 flex gap-4 min-h-[280px]">
        {/* 좌: 프리셋 목록 */}
        <div className="w-44 flex-shrink-0 border-r border-foreground/[0.08] pr-3 space-y-0.5 max-h-80 overflow-y-auto custom-scrollbar">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => select(p.id)}
              className={`w-full px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors ${
                selectedKey === p.id
                  ? "text-bridge-accent font-bold bg-bridge-accent/10"
                  : "text-foreground hover:bg-foreground/5"
              }`}
            >
              <span className="block truncate">{p.name}</span>
              <span className="block text-slate-500 tabular-nums">
                {t("milestone.preset.itemCount", {
                  count: p.item_count,
                  defaultValue: "{{count}}개 항목",
                })}
              </span>
            </button>
          ))}
          <button
            onClick={() => select(NEW_KEY)}
            className={`w-full flex items-center gap-1 px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors ${
              isNew
                ? "text-bridge-accent font-bold bg-bridge-accent/10"
                : "text-slate-500 hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            <Plus className="h-3 w-3" />
            {t("milestone.preset.newPreset", { defaultValue: "새 프리셋" })}
          </button>
        </div>

        {/* 우: 편집 영역 */}
        <div className="flex-1 min-w-0 space-y-3">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              {t("milestone.preset.nameLabel", { defaultValue: "이름" })}
            </span>
            <input
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
              placeholder={t("milestone.preset.namePlaceholder", {
                defaultValue: "프리셋 이름",
              })}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl px-3 py-2 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          </label>

          <div>
            <span className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              {t("milestone.preset.itemsLabel", { defaultValue: "항목" })}
            </span>
            <div className="space-y-1 max-h-52 overflow-y-auto custom-scrollbar">
              {draft.items.map((item, idx) => (
                <div key={item.key} className="flex items-center gap-1.5">
                  <input
                    value={item.title}
                    onChange={(e) => patchItem(item.key, e.target.value)}
                    className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2.5 py-1 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                  />
                  <button
                    onClick={() => moveItem(item.key, -1)}
                    disabled={idx === 0}
                    aria-label={t("milestone.preset.moveUp", {
                      defaultValue: "위로",
                    })}
                    className="p-1 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => moveItem(item.key, 1)}
                    disabled={idx === draft.items.length - 1}
                    aria-label={t("milestone.preset.moveDown", {
                      defaultValue: "아래로",
                    })}
                    className="p-1 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeItem(item.key)}
                    aria-label={t("milestone.preset.removeItem", {
                      defaultValue: "항목 삭제",
                    })}
                    className="p-1 rounded-lg text-slate-500 hover:text-red-500 hover:bg-foreground/5 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter") addItem();
                }}
                placeholder={t("milestone.preset.addItemPlaceholder", {
                  defaultValue: "항목 입력 후 Enter",
                })}
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2.5 py-1 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>
          </div>

          {/* 프리셋 삭제 — 확인 후 실행 */}
          {!isNew && (
            <div className="pt-1">
              {confirmingDelete ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">
                    {t("milestone.preset.deleteConfirm", {
                      defaultValue: "이 프리셋을 삭제할까요?",
                    })}
                  </span>
                  <button
                    onClick={() => void handleDelete()}
                    disabled={saving}
                    className="font-bold text-red-500 hover:underline disabled:opacity-50"
                  >
                    {t("common.delete", { defaultValue: "삭제" })}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="text-slate-500 hover:text-foreground transition-colors"
                  >
                    {t("common.cancel", { defaultValue: "취소" })}
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("milestone.preset.deletePreset", {
                    defaultValue: "프리셋 삭제",
                  })}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          {t("milestone.preset.escClose", { defaultValue: "Esc 닫기" })}
        </span>
        <button
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t("common.save", { defaultValue: "저장" })}
        </button>
      </div>
    </MotionModal>
  );
}
