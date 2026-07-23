import { useEffect, useState, useCallback } from 'react';
import { X, Loader2, HardDrive, Image, Film, FileText, File as FileIcon } from 'lucide-react';
import { MotionModal } from '../ui/MotionModal';
import { myStorageService } from '../../utils/services';
import type { StorageUsageDetail, StorageCategoryUsage } from '../../utils/api';
import { formatBytes } from './storageUtils';

interface StorageUsageDetailModalProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_META: Record<
  StorageCategoryUsage['category'],
  { label: string; color: string; Icon: typeof Image }
> = {
  IMAGE: { label: '이미지', color: 'var(--tw-image, #6366f1)', Icon: Image },
  VIDEO: { label: '영상', color: '#14b8a6', Icon: Film },
  DOCUMENT: { label: '문서', color: '#d97706', Icon: FileText },
  OTHER: { label: '기타', color: '#8a93a1', Icon: FileIcon },
};

// 세그먼트 바 색상 (테마 무관 고정 — 브랜드 팔레트)
const SEG_COLOR: Record<StorageCategoryUsage['category'], string> = {
  IMAGE: '#6366f1',
  VIDEO: '#14b8a6',
  DOCUMENT: '#d97706',
  OTHER: '#94a3b8',
};

export function StorageUsageDetailModal({ open, onClose }: StorageUsageDetailModalProps) {
  const [detail, setDetail] = useState<StorageUsageDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await myStorageService.getUsageDetail());
    } catch (e) {
      console.error('Failed to load usage detail:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const used = detail?.used ?? 0;
  const quota = detail?.quota ?? 0;
  const remaining = Math.max(0, quota - used);
  const percent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  const nearFull = percent >= 90;

  const categories = (detail?.categories ?? []).filter((c) => c.bytes > 0);

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label="스토리지 사용량 상세"
      className="w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-bold text-foreground">스토리지 사용량</span>
        </div>
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1.5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 pb-5 pt-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : (
          <>
            {/* 총량 */}
            <div className="flex items-end justify-between gap-2 mb-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground tabular-nums">
                  {formatBytes(used)}
                </span>
                <span className="text-sm text-slate-500 tabular-nums">/ {formatBytes(quota)}</span>
              </div>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  detail?.tier === 'PREMIUM'
                    ? 'bg-bridge-secondary/15 text-bridge-secondary'
                    : 'bg-bridge-accent/15 text-bridge-accent'
                }`}
              >
                {detail?.tier ?? '—'}
              </span>
            </div>
            <p className={`text-xs mb-3 ${nearFull ? 'text-amber-500' : 'text-slate-500'}`}>
              <b className={nearFull ? 'text-amber-500' : 'text-emerald-500'}>
                {formatBytes(remaining)}
              </b>{' '}
              남음 · 파일 {detail?.file_count ?? 0}개
            </p>

            {/* 세그먼트 바 */}
            <div className="h-2 rounded-full overflow-hidden bg-foreground/10 flex">
              {categories.length === 0 ? (
                <div className="h-full w-0" />
              ) : (
                categories.map((c) => (
                  <div
                    key={c.category}
                    style={{
                      width: `${quota > 0 ? (c.bytes / quota) * 100 : 0}%`,
                      background: SEG_COLOR[c.category],
                    }}
                    className="h-full"
                  />
                ))
              )}
            </div>
            <p className="text-xs text-slate-500 text-right mt-1.5 tabular-nums">
              {Math.round(percent)}% 사용
            </p>

            {/* 범례 (타입별 분해) */}
            <div className="mt-4 flex flex-col gap-1">
              {(detail?.categories ?? []).map((c) => {
                const meta = CATEGORY_META[c.category];
                const Icon = meta.Icon;
                return (
                  <div
                    key={c.category}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02]"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-none"
                      style={{ background: SEG_COLOR[c.category] }}
                    />
                    <Icon className="w-4 h-4 text-slate-400 flex-none" />
                    <span className="text-xs font-medium text-foreground flex-1">{meta.label}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{c.count}개</span>
                    <span className="text-xs font-bold text-foreground tabular-nums w-16 text-right">
                      {formatBytes(c.bytes)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </MotionModal>
  );
}
