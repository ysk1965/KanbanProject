# Task Detail Modal: 헤더 액션 통합 + 블록 상태 칩 인터랙티브화

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** TaskDetailModal 헤더에 흩어진 6개의 아이콘 버튼을 정리해서 (1) 블록 상태 변경(DONE 포함)을 기존 `[In Progress]` 상태 칩 자체의 드롭다운으로 흡수하고, (2) 보조 액션(Feature 이동, 다른 보드로 이동/복사, 삭제)은 케밥(⋯) 메뉴로 묶고, (3) 헤더에는 핵심 유틸 2개(`[🔗 Link] [⋯]`)만 남긴다.

**Architecture:**
- Radix `DropdownMenu` (`frontend/src/app/components/ui/dropdown-menu.tsx`) 재사용. 상태 칩 + 케밥 모두 동일 컴포넌트.
- 헤더 액션 영역과 블록 상태 칩을 각각 작은 presentational 컴포넌트(`TaskHeaderActionsMenu`, `BlockStatusPicker`)로 분리해서 TaskDetailModal 본체(2715줄)의 가독성을 회복. 모달 본체는 상태/다이얼로그를 그대로 보유하고, 신규 컴포넌트는 콜백만 받음.
- 블록 상태 변경 시: **DONE으로 이동 → 기존 confirmation 다이얼로그 유지** (Feature 진행률 부수효과 있음 + 워크플로우 마일스톤). **다른 블록으로 이동 → 직접 호출** (DnD와 동일 무게).
- i18n 키 4개 추가, 10개 로케일에 동시 작업.

**Tech Stack:** React 18, TypeScript, Radix UI DropdownMenu, Lucide Icons, react-i18next, Tailwind 4 + Bridge 디자인 토큰.

---

## 배경 / 현재 상태

`frontend/src/app/components/TaskDetailModal.tsx` 헤더에 다음 6+1개 버튼이 분산:

**헤더 액션 영역 (`:842-906`)**
| # | 버튼 | 아이콘 | 조건 | 핸들러 |
|---|------|-------|------|--------|
| 1 | 링크 복사 | `Link` / `Check` | 항상 | `handleCopyTaskLink` |
| 2 | DONE | `CheckCircle2` + "DONE" | `canEdit && onMoveToDone && block !== "Done"` | `setShowDoneDialog(true)` |
| 3 | 블록 이동(Done 해제) | `Undo2` | `canEdit && onMoveToBlock && block === "Done"` | `setShowMoveDialog(true)` |
| 4 | 다른 보드로 이동 | `ArrowRight` | `canEdit` | `setMoveCopyMode("move")` |
| 5 | 다른 보드로 복사 | `Copy` | `canEdit` | `setMoveCopyMode("copy")` |
| 6 | 삭제 | `Trash2` | `canEdit` | `setShowDeleteDialog(true)` |

**Feature 칩 옆 (`:791-799`)**
| 7 | Feature 이동 | `ArrowRightLeft` | `canEdit && onMoveToFeature && features.length > 1` | `setShowMoveFeatureDialog(true)` |

**블록 상태 칩 (`:802-806`)** — 현재 비인터랙티브
- `Layers + task.block_name` 표시, 클릭 시 동작 없음. 보조 정보로만 기능.

### 사용 가능한 props (확인 완료)
- `blocks: Block[]` (`:111`, `:143`) — 모든 보드 블록 리스트, 각 항목에 `id`, `name`, `fixed_type` (`"FEATURE"` / `"DONE"` / `null`).
- `task.block_id` (`types/index.ts:384`) — 현재 블록 매칭용.
- `onMoveToDone(taskId)` (`:103`) / `onMoveToBlock(taskId, blockId)` (`:104`) — 두 핸들러 모두 prop으로 들어옴.

**문제점:**
- 6+1개 액션이 두 위치에 분산 → 발견성 떨어짐 (특히 Feature 이동은 칩 옆에 있어서 인지 못 하는 사용자 많음).
- 자주 안 쓰는 액션(다른 보드 이동/복사)이 자주 쓰는 DONE과 동일 시각 무게.
- 위험 액션(삭제) 1-click 거리 → 오작동 위험.
- 커스텀 블록 (예: In Progress, Review)으로의 1-click 이동은 현재 **DnD 전용** — 모달 안에서 불가능. 모바일에서 마찰.

---

## 변경 후 구조

### 헤더 (Primary)
```
[🔗 Link]  [⋯ More]
```
2개로 축소. canEdit=false면 `[🔗]` 단독.

### 블록 상태 칩 (Status Picker)
```
[⌘ In Progress ▾]
```
기존 비인터랙티브 칩에 `▾` 표시 + 클릭 시 `BlockStatusPicker` 드롭다운 오픈. 메뉴 항목:
- **블록 목록** (FEATURE 제외, fixed_type=DONE 제외 — DONE은 별도 강조 항목)
  - 현재 블록은 `Check` 아이콘으로 마킹 (`DropdownMenuCheckboxItem` 패턴)
  - 클릭 시 `onMoveToBlock(task.id, blockId)` 직접 호출 (다이얼로그 없음)
- `DropdownMenuSeparator`
- **Done 항목** (emerald 강조)
  - 클릭 시 기존 `setShowDoneDialog(true)` → confirmation 다이얼로그 → `onMoveToDone(task.id)`
- 만약 현재 블록이 Done이면:
  - Done 항목이 disabled (현재 상태)
  - 다른 블록을 클릭하면 `onMoveToBlock` 호출 → "Done 해제 → 해당 블록으로 이동" 효과 = 기존 Undo 버튼 대체

권한:
- `canEdit=false` → 칩에 `▾` 미표시, 클릭 비활성, 기존처럼 정보만 표시.

### 케밥 ⋯ (Secondary Actions)
```
┌────────────────────────────┐
│  ⇄  Feature 이동            │  ← features.length>1 일 때만
│  →  다른 보드로 이동         │
│  ⎘  다른 보드로 복사         │
│  ──────────────────────    │
│  🗑  삭제                  │  ← red-400, hover bg-red/10
└────────────────────────────┘
```
`canEdit=false` → 트리거 자체 미렌더 (`null` 반환).

### 인라인 Feature 이동 버튼 (`:791-799`)
- 제거. 케밥으로 일원화. Feature 칩 자체는 `onOpenFeature` 클릭 동작 유지.

---

## 컴포넌트 설계

### 신규 컴포넌트 1: `BlockStatusPicker`
파일: `frontend/src/app/components/BlockStatusPicker.tsx`

```tsx
interface BlockStatusPickerProps {
  blocks: Block[];                                  // 전체 보드 블록
  currentBlockId: string;                           // 매칭/체크 표시용
  currentBlockName?: string;                        // 표시용
  canEdit: boolean;
  onSelectBlock: (blockId: string) => void;         // 일반 블록 선택 → 직접 호출
  onSelectDone: () => void;                         // Done 선택 → confirmation 다이얼로그 트리거
}
```

**렌더 규칙:**
- `canEdit=false` → 기존 비인터랙티브 칩 그대로 (배경 `bg-foreground/10`, `Layers + name`).
- `canEdit=true` → `DropdownMenuTrigger`로 감싼 칩 (`▾` 아이콘 추가, hover 효과).
- 메뉴 항목:
  - `blocks.filter(b => b.fixed_type !== "FEATURE" && b.fixed_type !== "DONE")` 순서대로 렌더 (`DropdownMenuItem`).
    - 현재 블록(`b.id === currentBlockId`)이면 좌측에 `Check` 아이콘 표시 + `text-foreground` 강조.
    - 그 외에는 `text-slate-400` 아이콘 + `text-foreground` 텍스트.
    - 현재 블록 항목은 `disabled` (no-op).
  - `DropdownMenuSeparator`
  - Done 항목 (`blocks.find(b => b.fixed_type === "DONE")`):
    - 텍스트 `task.markComplete` ("완료 처리"), emerald-400.
    - 현재 블록이 Done이면 `disabled` + `Check` 마킹.
    - 클릭 시 `onSelectDone()` 호출 (= confirmation 다이얼로그).

### 신규 컴포넌트 2: `TaskHeaderActionsMenu`
파일: `frontend/src/app/components/TaskHeaderActionsMenu.tsx`

```tsx
interface TaskHeaderActionsMenuProps {
  canEdit: boolean;
  hasMultipleFeatures: boolean;       // features.length > 1 && onMoveToFeature
  onMoveFeature: () => void;
  onMoveToBoard: () => void;
  onCopyToBoard: () => void;
  onDelete: () => void;
}
```

`canEdit=false` 또는 노출할 항목이 0개면 `null` 반환.

---

## 작업 순서

### Task 1: i18n 키 추가 (10개 로케일)

**Files:**
- Modify: `frontend/src/app/i18n/locales/{ko,en,ja,zh,zh-TW,vi,th,es,pt-BR,hi}.json`

**Step 1: 추가할 키 (4개, `task` 객체 내부)**

| Key | ko | en | ja | zh | zh-TW | vi | th | es | pt-BR | hi |
|-----|----|----|----|----|----|----|----|----|----|----|
| `task.moreActions` | 더보기 | More actions | その他 | 更多操作 | 更多動作 | Hành động khác | เพิ่มเติม | Más acciones | Mais ações | अधिक क्रियाएं |
| `task.moveToBoard` | 다른 보드로 이동 | Move to another board | 別のボードへ移動 | 移动到其他看板 | 移動到其他看板 | Chuyển sang bảng khác | ย้ายไปบอร์ดอื่น | Mover a otro tablero | Mover para outro quadro | अन्य बोर्ड में स्थानांतरित करें |
| `task.copyToBoard` | 다른 보드로 복사 | Copy to another board | 別のボードへコピー | 复制到其他看板 | 複製到其他看板 | Sao chép sang bảng khác | คัดลอกไปบอร์ดอื่น | Copiar a otro tablero | Copiar para outro quadro | अन्य बोर्ड में कॉपी करें |
| `task.changeStatus` | 상태 변경 | Change status | ステータス変更 | 更改状态 | 變更狀態 | Đổi trạng thái | เปลี่ยนสถานะ | Cambiar estado | Alterar status | स्थिति बदलें |

`task.markComplete`는 기존(완료 처리) 재사용.

**Step 2: JSON 유효성 검증**

```bash
cd frontend && for f in src/app/i18n/locales/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f', 'utf8'))" || echo "FAIL: $f"; done
```
Expected: 출력 없음 (모두 valid).

**Step 3: Commit**

```bash
git add frontend/src/app/i18n/locales/
git commit -m "feat(i18n): add task.moreActions / moveToBoard / copyToBoard / changeStatus keys"
```

---

### Task 2: `TaskHeaderActionsMenu` 컴포넌트 작성

**Files:**
- Create: `frontend/src/app/components/TaskHeaderActionsMenu.tsx`

**Step 1: 파일 생성**

```tsx
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowRightLeft,
  Copy,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface TaskHeaderActionsMenuProps {
  canEdit: boolean;
  hasMultipleFeatures: boolean;
  onMoveFeature: () => void;
  onMoveToBoard: () => void;
  onCopyToBoard: () => void;
  onDelete: () => void;
}

export function TaskHeaderActionsMenu({
  canEdit,
  hasMultipleFeatures,
  onMoveFeature,
  onMoveToBoard,
  onCopyToBoard,
  onDelete,
}: TaskHeaderActionsMenuProps) {
  const { t } = useTranslation();

  if (!canEdit) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-foreground hover:bg-foreground/10"
          title={t("task.moreActions")}
          aria-label={t("task.moreActions")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[200px] bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl p-1"
      >
        {hasMultipleFeatures && (
          <DropdownMenuItem
            onClick={onMoveFeature}
            className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-foreground/5 focus:bg-foreground/5 outline-none"
          >
            <ArrowRightLeft className="h-4 w-4 text-slate-400" />
            <span className="text-foreground">{t("task.moveFeature")}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={onMoveToBoard}
          className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-foreground/5 focus:bg-foreground/5 outline-none"
        >
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <span className="text-foreground">{t("task.moveToBoard")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onCopyToBoard}
          className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-foreground/5 focus:bg-foreground/5 outline-none"
        >
          <Copy className="h-4 w-4 text-slate-400" />
          <span className="text-foreground">{t("task.copyToBoard")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 h-px bg-foreground/[0.08]" />
        <DropdownMenuItem
          onClick={onDelete}
          className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-red-500/10 focus:bg-red-500/10 outline-none text-red-400"
        >
          <Trash2 className="h-4 w-4" />
          <span>{t("common.delete")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 2: 빌드 검증**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: 성공 (아직 사용처 없으므로 unused 경고 가능).

**Step 3: Commit**

```bash
git add frontend/src/app/components/TaskHeaderActionsMenu.tsx
git commit -m "feat(task): add TaskHeaderActionsMenu component"
```

---

### Task 3: `BlockStatusPicker` 컴포넌트 작성

**Files:**
- Create: `frontend/src/app/components/BlockStatusPicker.tsx`

**Step 1: 파일 생성**

```tsx
import { useTranslation } from "react-i18next";
import { Check, CheckCircle2, ChevronDown, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { Block } from "../types";

interface BlockStatusPickerProps {
  blocks: Block[];
  currentBlockId: string;
  currentBlockName?: string;
  canEdit: boolean;
  onSelectBlock: (blockId: string) => void;
  onSelectDone: () => void;
}

export function BlockStatusPicker({
  blocks,
  currentBlockId,
  currentBlockName,
  canEdit,
  onSelectBlock,
  onSelectDone,
}: BlockStatusPickerProps) {
  const { t } = useTranslation();

  const doneBlock = blocks.find((b) => b.fixed_type === "DONE");
  const isCurrentlyDone = doneBlock?.id === currentBlockId;
  const selectableBlocks = blocks.filter(
    (b) => b.fixed_type !== "FEATURE" && b.fixed_type !== "DONE",
  );

  // 비편집 권한 → 기존 정적 칩
  if (!canEdit) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-foreground/10 text-muted-foreground border border-foreground/10">
        <Layers className="h-3 w-3" />
        {currentBlockName}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-foreground/10 text-foreground border border-foreground/10 hover:bg-foreground/[0.15] hover:border-foreground/15 transition-colors"
          title={t("task.changeStatus")}
          aria-label={t("task.changeStatus")}
        >
          <Layers className="h-3 w-3" />
          {currentBlockName}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="min-w-[200px] bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl p-1"
      >
        {selectableBlocks.map((block) => {
          const isCurrent = block.id === currentBlockId;
          return (
            <DropdownMenuItem
              key={block.id}
              disabled={isCurrent}
              onClick={() => !isCurrent && onSelectBlock(block.id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg outline-none ${
                isCurrent
                  ? "text-foreground cursor-default"
                  : "text-foreground cursor-pointer hover:bg-foreground/5 focus:bg-foreground/5"
              }`}
            >
              {isCurrent ? (
                <Check className="h-4 w-4 text-bridge-accent" />
              ) : (
                <Layers className="h-4 w-4 text-slate-400" />
              )}
              <span>{block.name}</span>
            </DropdownMenuItem>
          );
        })}
        {doneBlock && (
          <>
            <DropdownMenuSeparator className="my-1 h-px bg-foreground/[0.08]" />
            <DropdownMenuItem
              disabled={isCurrentlyDone}
              onClick={() => !isCurrentlyDone && onSelectDone()}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg outline-none text-emerald-400 ${
                isCurrentlyDone
                  ? "cursor-default opacity-70"
                  : "cursor-pointer hover:bg-emerald-500/10 focus:bg-emerald-500/10"
              }`}
            >
              {isCurrentlyDone ? (
                <Check className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span className="font-bold">{t("task.markComplete")}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 2: 빌드 검증**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: 성공.

**Step 3: Commit**

```bash
git add frontend/src/app/components/BlockStatusPicker.tsx
git commit -m "feat(task): add BlockStatusPicker component"
```

---

### Task 4: TaskDetailModal 통합

**Files:**
- Modify: `frontend/src/app/components/TaskDetailModal.tsx` (import 추가, 헤더 영역 + 블록 상태 칩 교체, 인라인 Feature 이동 버튼 제거)

**Step 1: import 추가**

상단 import 섹션에 추가:
```tsx
import { TaskHeaderActionsMenu } from "./TaskHeaderActionsMenu";
import { BlockStatusPicker } from "./BlockStatusPicker";
```

**Step 2: 블록 상태 칩 교체 (lines 802-806)**

```tsx
// BEFORE
{task.block_name && (
  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-foreground/10 text-muted-foreground border border-foreground/10">
    <Layers className="h-3 w-3" />
    {task.block_name}
  </div>
)}

// AFTER
{task.block_id && (
  <BlockStatusPicker
    blocks={blocks}
    currentBlockId={task.block_id}
    currentBlockName={task.block_name}
    canEdit={!!canEdit && (!!onMoveToBlock || !!onMoveToDone)}
    onSelectBlock={(blockId) => {
      if (task && onMoveToBlock) {
        onMoveToBlock(task.id, blockId);
      }
    }}
    onSelectDone={() => setShowDoneDialog(true)}
  />
)}
```

**Step 3: Feature 칩 옆 인라인 이동 버튼 제거 (lines 791-799)**

```tsx
// BEFORE
{canEdit && onMoveToFeature && features.length > 1 && (
  <button
    onClick={() => setShowMoveFeatureDialog(true)}
    className="p-1 rounded-full text-slate-400 hover:text-foreground hover:bg-foreground/10 transition-colors"
    title={t("task.moveFeature")}
  >
    <ArrowRightLeft className="h-3 w-3" />
  </button>
)}

// AFTER — 블록 전체 삭제 (케밥 메뉴로 이전)
```

**Step 4: 헤더 액션 영역 재구성 (lines 842-906)**

```tsx
// AFTER
<div className="flex items-center gap-1">
  <Button
    variant="ghost"
    size="sm"
    onClick={handleCopyTaskLink}
    className="text-slate-400 hover:text-foreground hover:bg-foreground/10"
    title={t("share.copyLink")}
    aria-label={t("share.copyLink")}
  >
    {linkCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Link className="h-4 w-4" />}
  </Button>
  <TaskHeaderActionsMenu
    canEdit={!!canEdit}
    hasMultipleFeatures={!!onMoveToFeature && features.length > 1}
    onMoveFeature={() => setShowMoveFeatureDialog(true)}
    onMoveToBoard={() => setMoveCopyMode("move")}
    onCopyToBoard={() => setMoveCopyMode("copy")}
    onDelete={() => setShowDeleteDialog(true)}
  />
</div>
```

**Step 5: `showMoveDialog`(블록 선택 다이얼로그)는 그대로 유지하되, 이제 헤더에서 트리거되는 경로 없음**

`showMoveDialog`는 BlockStatusPicker가 직접 `onMoveToBlock`을 호출하므로 더 이상 필요 없을 수 있음. **검증 필요:** `setShowMoveDialog(true)` 호출이 헤더 외 다른 곳에서도 사용되는지 grep:

```bash
cd frontend && grep -n "setShowMoveDialog\|showMoveDialog" src/app/components/TaskDetailModal.tsx
```

- 헤더 외 사용처 없으면 → state(`showMoveDialog`, `selectedBlockId`)와 다이얼로그 JSX(`:1420-1480` 근처) 모두 제거.
- 다른 사용처 있으면 → 보존.

**Step 6: 빌드 검증**

```bash
cd frontend && npm run build 2>&1 | tail -30
```
Expected: 성공, TS 에러 0개.

**Step 7: Commit**

```bash
git add frontend/src/app/components/TaskDetailModal.tsx
git commit -m "feat(task): integrate header actions menu and interactive block status picker"
```

---

### Task 5: 수동 QA — 시나리오 체크리스트

`npm run dev` + `./gradlew bootRun` 실행 후 브라우저(`http://localhost:5173`)에서 클릭 회귀 검증. (자동 테스트 인프라 없음.)

| # | 시나리오 | 기대 결과 |
|---|---------|----------|
| 1 | Task 카드 클릭 → 모달 오픈 (Owner/Admin) | 헤더에 `[🔗] [⋯]` 2개만 |
| 2 | 블록 상태 칩 `[In Progress ▾]` 클릭 | 드롭다운 오픈: 모든 블록(FEATURE 제외) + 구분선 + Done 강조 |
| 3 | 칩 메뉴에서 다른 블록(예: Review) 선택 | 즉시 이동, 다이얼로그 없음, 모달 닫힘 또는 갱신 |
| 4 | 칩 메뉴에서 Done 선택 | 기존 confirmation 다이얼로그 오픈 → 확인 시 onMoveToDone |
| 5 | 현재 블록(In Progress) 항목 | `Check` 아이콘 마킹, disabled (no-op) |
| 6 | 현재 Done 상태에서 칩 클릭 | Done 항목이 `Check` + disabled, 다른 블록 선택은 정상 작동 (= Undo 효과) |
| 7 | ⋯ 클릭 | 메뉴: Feature 이동, 다른 보드로 이동, 다른 보드로 복사, ―, 삭제(빨강) |
| 8 | Feature 1개 보드 | ⋯ 메뉴에서 "Feature 이동" 항목 없음 |
| 9 | Viewer 권한 | 헤더 `[🔗]`만, 칩은 비인터랙티브(▾ 없음, hover 없음) |
| 10 | "다른 보드로 이동/복사" 클릭 | 기존 TaskMoveModal 정상 오픈 |
| 11 | "Feature 이동" 클릭 | MoveFeatureDialog 정상 오픈 |
| 12 | "삭제" 클릭 | DeleteDialog 정상 오픈 |
| 13 | 키보드: Tab → 칩 → Enter → ↓/↑ → Enter | Radix 기본 a11y (포커스, 화살표 nav, Esc 닫기) |
| 14 | 다국어: en/ja 전환 | "더보기"/"상태 변경" 등 새 키 정상 출력, 폴백 없음 |
| 15 | 모바일(375px) | 헤더 깔끔, 칩 메뉴 `align="start"` / 케밥 메뉴 `align="end"` 모두 화면 안에 들어옴 |
| 16 | 라이트 모드 | 모든 요소 가독성 OK (bridge-obsidian 자동 전환) |
| 17 | DnD로 Done 블록에 드롭 | 기존 동작 유지 (모달 외부 동작이지만 회귀 확인) |

**Step 1: 이슈 발견 시 수정 후 commit. 이슈 없으면 다음 태스크.**

---

### Task 6: 미사용 import 및 dead state 정리

**Files:**
- Modify: `frontend/src/app/components/TaskDetailModal.tsx`

**Step 1: lucide import 정리**

```bash
cd frontend && grep -nE "(ArrowRightLeft|ArrowRight|Copy|Trash2|Undo2|CheckCircle2)" src/app/components/TaskDetailModal.tsx
```

각 아이콘이 헤더 외 다른 곳(다이얼로그 내부 등)에 쓰이는지 확인. 사용처 0인 것만 import에서 제거.

- `ArrowRightLeft`: 인라인 Feature 버튼만 사용 → 제거
- `Undo2`: 헤더만 사용 → 제거  
- `CheckCircle2`: 헤더 + BlockStatusPicker 내부에서 자체 import → 모달에서 제거
- `ArrowRight`/`Copy`/`Trash2`: 다이얼로그 내부 사용 가능 → grep 결과로 판단

**Step 2: dead state 정리**

Task 4 Step 5에서 `showMoveDialog`/`selectedBlockId` 제거 여부 확정됨. 제거 시:
- `useState` 라인 삭제
- 관련 다이얼로그 JSX 삭제
- 핸들러 안에서 `setShowMoveDialog(false)` 호출 모두 정리

**Step 3: 빌드**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: 성공, unused 경고 0개.

**Step 4: Commit**

```bash
git add frontend/src/app/components/TaskDetailModal.tsx
git commit -m "chore(task): remove unused imports and legacy block move dialog"
```

---

## 의사결정 / 트레이드오프

### D1. 블록 변경 시 confirmation 다이얼로그 정책
- **Done으로 이동 → 다이얼로그 유지.** 이유: (1) Feature 진행률 갱신 부수효과, (2) 워크플로우 마일스톤이라 실수 방지 가치 있음, (3) 기존 동작 보존.
- **다른 블록으로 이동 → 직접 호출.** 이유: DnD와 동일 무게로 다루는 것이 일관성 있음. 칩에서 1번 클릭 + 항목 1번 클릭 = 이미 2-step.

### D2. 블록 상태 칩 위치
- **현재 위치(Feature 칩 옆) 유지.** 이미 사용자가 보던 곳이라 학습 비용 ↓. 인터랙션만 추가.

### D3. FEATURE 블록 노출 여부
- **숨김.** Task는 FEATURE 블록으로 이동 불가 (Feature 카드 전용). 기존 `showMoveDialog`도 `fixed_type !== "FEATURE"` 필터링 동일.

### D4. 메뉴 안에서 Done 시각 위치
- **별도 그룹(구분선 아래) + emerald 강조.** Done은 다른 일반 블록과 의미가 다름(완료 = 마일스톤). 구분선 + 색으로 분리.

### D5. 트리거 시각: `▾` 표시 여부
- **canEdit=true일 때만 ▾ 표시.** Viewer는 칩이 비인터랙티브이므로 ▾ 없음 → affordance 일관성.

---

## Out of Scope

- TaskDetailModal 전체 리팩토링/분해 (2715줄).
- DraggableCard / 다른 컴포넌트의 우클릭 컨텍스트 메뉴 통합.
- 키보드 단축키 (예: `D` → DONE).
- 블록 상태 변경 후 Undo 토스트.
- 모바일 반응형 모달 자체 개선.
