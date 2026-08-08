import { useCallback, useState } from "react";
import { toast } from "sonner";
import { boardAPI } from "../utils/api";
import type { Board } from "../types";
import {
  serializeBoardOptions,
  useBoardFeatures,
  type BoardFeatures,
  type BoardUiLevel,
  type BoardUiOption,
} from "./useBoardFeatures";

/**
 * 보드 화면 복잡도의 **읽기 + 쓰기**를 한 곳에 모은다.
 *
 * 기능 서랍과 유령 슬롯이 같은 값을 바꾸므로 저장 경로가 둘로 갈리면 안 된다 —
 * 한쪽만 낙관적 갱신을 하거나 한쪽만 실패 토스트를 띄우면 화면이 서로 다른 말을 한다.
 *
 * 저장 성공 시 부모의 `board` 상태를 갱신해 화면 전체가 즉시 따라 움직인다.
 * 서버 응답을 진실로 삼는다(낙관적 갱신 안 함) — 옵션 문자열은 서버가 정규화하므로
 * 클라이언트가 만든 값과 다를 수 있다.
 */
export interface BoardUiConfig {
  features: BoardFeatures;
  /** 저장 중인 항목 키 (`level-2`, `opt-members`…). 없으면 null. */
  pending: string | null;
  setLevel: (level: BoardUiLevel) => void;
  toggleOption: (option: BoardUiOption) => void;
  enableOption: (option: BoardUiOption) => void;
}

export function useBoardUiConfig(
  boardId: string | undefined,
  board: Board | null,
  setBoard: React.Dispatch<React.SetStateAction<Board | null>>,
  /**
   * 레벨이 **올라간** 직후 호출된다. 승급 마법사(정리 작업)를 여는 자리다.
   * 전환 자체는 이미 끝난 뒤라 마법사는 막고 서지 않고 건너뛸 수 있다 —
   * 레벨은 표시 게이트라 되돌리는 비용이 없고, 정리를 미뤄도 화면이 안 깨진다.
   */
  onLevelRaised?: (level: BoardUiLevel) => void,
): BoardUiConfig {
  const features = useBoardFeatures(board);
  const [pending, setPending] = useState<string | null>(null);

  const apply = useCallback(
    async (
      payload: { ui_level?: number; ui_options?: string },
      key: string,
    ) => {
      if (!boardId || pending) return;
      setPending(key);
      try {
        const next = await boardAPI.updateUiConfig(boardId, payload);
        setBoard((prev) =>
          prev
            ? {
                ...prev,
                ui_level: next.ui_level ?? prev.ui_level,
                ui_options: next.ui_options ?? prev.ui_options,
              }
            : prev,
        );
      } catch {
        toast.error("설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        setPending(null);
      }
    },
    [boardId, pending, setBoard],
  );

  const setLevel = useCallback(
    (level: BoardUiLevel) => {
      if (level === features.level) return;
      const raising = level > features.level;
      void apply({ ui_level: level }, `level-${level}`).then(() => {
        if (raising) onLevelRaised?.(level);
      });
    },
    [apply, features.level, onLevelRaised],
  );

  const writeOptions = useCallback(
    (nextOptions: BoardUiOption[], key: string) => {
      void apply({ ui_options: serializeBoardOptions(nextOptions) }, key);
    },
    [apply],
  );

  const toggleOption = useCallback(
    (option: BoardUiOption) => {
      const next = features.has(option)
        ? features.options.filter((o) => o !== option)
        : [...features.options, option];
      writeOptions(next, `opt-${option}`);
    },
    [features, writeOptions],
  );

  const enableOption = useCallback(
    (option: BoardUiOption) => {
      if (features.has(option)) return;
      writeOptions([...features.options, option], `opt-${option}`);
    },
    [features, writeOptions],
  );

  return { features, pending, setLevel, toggleOption, enableOption };
}
