import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../utils/services', () => ({ personalFeatureAPI: {} }));
vi.mock('./sermonAudioStore', () => ({ sermonAudioStore: {} }));
vi.mock('./useBible', () => ({ hasStoredBible: () => Promise.resolve(true) }));
vi.mock('sonner', () => ({ toast: vi.fn() }));

import { OfflineEntrySheet } from './OfflineEntrySheet';
import type { SyncStatus } from './sermonStore';

const status = (p: Partial<SyncStatus> = {}): SyncStatus => ({
  anonymous: false,
  pending: 0,
  online: null,
  lastSync: 0,
  loading: false,
  localOk: true,
  audioPct: null,
  localFull: false,
  slow: false,
  restoring: false,
  limit: false,
  ...p,
});
const TITLE = '지금은 인터넷에 연결돼 있지 않아요';

describe('OfflineEntrySheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('끊긴 채 들어오면 1.5초 뒤에 한 번 뜬다', () => {
    render(
      <OfflineEntrySheet status={status({ online: false })} anonymous={false} mascot="galpi" />,
    );
    expect(screen.queryByText(TITLE)).toBeNull();
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it('1.5초 안에 다시 연결되면 띄우지 않는다', () => {
    const { rerender } = render(
      <OfflineEntrySheet status={status({ online: false })} anonymous={false} mascot="galpi" />,
    );
    act(() => vi.advanceTimersByTime(800));
    rerender(
      <OfflineEntrySheet status={status({ online: true })} anonymous={false} mascot="galpi" />,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('로그인 전이면 띄우지 않는다', () => {
    render(<OfflineEntrySheet status={status({ online: false })} anonymous mascot="galpi" />);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('들어온 지 15초가 지나 끊기면(쓰던 중) 띄우지 않는다', () => {
    const { rerender } = render(
      <OfflineEntrySheet status={status({ online: true })} anonymous={false} mascot="galpi" />,
    );
    act(() => vi.advanceTimersByTime(16_000));
    rerender(
      <OfflineEntrySheet status={status({ online: false })} anonymous={false} mascot="galpi" />,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('열린 채 연결이 돌아오면 다시 연결됐다고 바뀐다', () => {
    const { rerender } = render(
      <OfflineEntrySheet status={status({ online: false })} anonymous={false} mascot="galpi" />,
    );
    act(() => vi.advanceTimersByTime(1500));
    rerender(
      <OfflineEntrySheet status={status({ online: true })} anonymous={false} mascot="galpi" />,
    );
    expect(screen.getByText('다시 연결됐어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계속 적기' })).toBeInTheDocument();
  });

  it('다시 보지 않기를 누르면 이 기기에서는 다시 뜨지 않는다', () => {
    const { unmount } = render(
      <OfflineEntrySheet status={status({ online: false })} anonymous={false} mascot="galpi" />,
    );
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole('button', { name: '다시 보지 않기' }));
    expect(screen.queryByText(TITLE)).toBeNull();
    unmount();
    sessionStorage.clear(); // 새로 연 앱
    render(
      <OfflineEntrySheet status={status({ online: false })} anonymous={false} mascot="galpi" />,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('같은 세션에서는 한 번만 뜬다', () => {
    const { unmount } = render(
      <OfflineEntrySheet status={status({ online: false })} anonymous={false} mascot="galpi" />,
    );
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole('button', { name: '바로 적기' }));
    unmount();
    render(
      <OfflineEntrySheet status={status({ online: false })} anonymous={false} mascot="galpi" />,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
