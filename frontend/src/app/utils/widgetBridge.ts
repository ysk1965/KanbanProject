import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * iOS 위젯 브리지 (ios/App/App/BridgeWidgetPlugin.swift).
 * 앱이 위젯용 요약 JSON 을 App Group 에 쓰고, 위젯에서 누른 체크(대기열)를 받아 온다.
 * iOS 앱이 아니면 모두 아무 일도 하지 않는다.
 */

export interface WidgetPendingOp {
  id: string;
  op: 'apply' | 'plan';
  /** 바꿀 상태 (뒤집기가 아니라 이 값으로 맞춘다 — 두 번 받아도 같은 결과) */
  done: boolean;
  at: number;
  note_id?: string;
  thought_id?: string;
  plan_id?: string;
  rep?: 'once' | 'daily' | 'days';
  /** 할 일을 한 날 yyyy-MM-dd */
  date?: string;
  /** 그 주 일요일 yyyy-MM-dd */
  week?: string;
}

interface BridgeWidgetPlugin {
  setSnapshot(opts: { json: string }): Promise<void>;
  takePending(): Promise<{ ops: string }>;
  clearSnapshot(): Promise<void>;
}

const Native = registerPlugin<BridgeWidgetPlugin>('BridgeWidget');

export const widgetSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

export async function writeWidgetSnapshot(json: string): Promise<void> {
  if (!widgetSupported()) return;
  try {
    await Native.setSnapshot({ json });
  } catch {
    // 위젯 확장이 없는 빌드 — 무시
  }
}

export async function clearWidgetSnapshot(): Promise<void> {
  if (!widgetSupported()) return;
  try {
    await Native.clearSnapshot();
  } catch {
    /* ignore */
  }
}

/** 위젯에서 쌓인 체크를 꺼낸다 (꺼내면 대기열은 비워진다) */
export async function takeWidgetPending(): Promise<WidgetPendingOp[]> {
  if (!widgetSupported()) return [];
  try {
    const { ops } = await Native.takePending();
    const list = JSON.parse(ops || '[]') as unknown;
    return Array.isArray(list)
      ? list.filter(
          (o): o is WidgetPendingOp =>
            !!o && typeof o === 'object' && (o.op === 'apply' || o.op === 'plan'),
        )
      : [];
  } catch {
    return [];
  }
}
