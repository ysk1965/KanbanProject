import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Share2,
  Loader2,
  Copy,
  Check,
  Trash2,
  Plus,
  Eye,
  Upload,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { MotionModal } from '../../ui/MotionModal';
import { orgPhotoService } from '../../../utils/services';
import { formatDateTime, formatRelativeTime } from '../../../utils/dateUtils';
import type {
  OrgPhotoTab,
  PhotoShareLink,
  PhotoShareLinkType,
} from '../../../types';

interface AlbumShareManagerModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  albums: OrgPhotoTab[];
  focusTabId?: string | null;
  onAlbumsUpdate?: (updated: OrgPhotoTab[]) => void;
}

interface ExpiryPreset {
  value: number;
  labelKey: '1d' | '7d' | '30d' | 'never';
}

const EXPIRY_PRESETS: ExpiryPreset[] = [
  { value: 1, labelKey: '1d' },
  { value: 7, labelKey: '7d' },
  { value: 30, labelKey: '30d' },
  { value: 0, labelKey: 'never' },
];

function buildShareUrl(link: PhotoShareLink): string {
  const origin = window.location.origin;
  if (link.link_type === 'VIEW') {
    return link.tab_id
      ? `${origin}/shared/album/${link.token}`
      : `${origin}/shared/gallery/${link.token}`;
  }
  return link.tab_id
    ? `${origin}/shared/upload/${link.token}`
    : `${origin}/shared/gallery-upload/${link.token}`;
}

export function AlbumShareManagerModal({
  open,
  onClose,
  orgId,
  albums,
  focusTabId,
  onAlbumsUpdate,
}: AlbumShareManagerModalProps) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<PhotoShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuingKey, setIssuingKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!open) return;
    try {
      setLoading(true);
      const result = await orgPhotoService.listShareLinks(orgId);
      setLinks(result.links);
    } catch {
      toast.error(t('photoGallery.shareToggleError', 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [open, orgId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refreshAlbumsLegacy = useCallback(async () => {
    if (!onAlbumsUpdate) return;
    try {
      const updated = await orgPhotoService.getTabs(orgId);
      onAlbumsUpdate(updated);
    } catch {
      // best-effort: legacy is_shared/is_upload_enabled refresh
    }
  }, [onAlbumsUpdate, orgId]);

  const handleIssue = useCallback(
    async (
      tabId: string | null,
      type: PhotoShareLinkType,
      expiresInDays: number | null,
      title: string | null,
    ) => {
      const sectionKey = `${tabId ?? 'gallery'}-${type}`;
      try {
        setIssuingKey(sectionKey);
        const link = await orgPhotoService.issueShareLink(orgId, {
          tab_id: tabId,
          link_type: type,
          expires_in_days: expiresInDays,
          title,
        });
        setLinks((prev) => [link, ...prev]);
        await refreshAlbumsLegacy();
        toast.success(t('photoGallery.linkIssued', '링크가 발급되었습니다'));
      } catch {
        toast.error(t('photoGallery.shareToggleError', '발급에 실패했습니다'));
      } finally {
        setIssuingKey(null);
      }
    },
    [orgId, refreshAlbumsLegacy, t],
  );

  const handleRevoke = useCallback(
    async (linkId: string) => {
      const ok = window.confirm(
        t('photoGallery.confirmExpire', '이 링크를 즉시 만료시키시겠습니까?'),
      );
      if (!ok) return;
      try {
        setRevokingId(linkId);
        await orgPhotoService.revokeShareLink(orgId, linkId);
        setLinks((prev) => prev.filter((l) => l.id !== linkId));
        await refreshAlbumsLegacy();
        toast.success(t('photoGallery.linkRevoked', '링크가 만료되었습니다'));
      } catch {
        toast.error(t('photoGallery.shareToggleError', '만료 처리에 실패했습니다'));
      } finally {
        setRevokingId(null);
      }
    },
    [orgId, refreshAlbumsLegacy, t],
  );

  const handleCopy = useCallback(
    async (link: PhotoShareLink) => {
      try {
        await navigator.clipboard.writeText(buildShareUrl(link));
        setCopiedId(link.id);
        toast.success(t('photoGallery.shareCopied', '복사됨'));
        setTimeout(() => setCopiedId(null), 1800);
      } catch {
        toast.error('Failed to copy');
      }
    },
    [t],
  );

  const galleryLinks = useMemo(
    () => links.filter((l) => l.tab_id === null),
    [links],
  );
  const tabLinksMap = useMemo(() => {
    const map = new Map<string, PhotoShareLink[]>();
    for (const link of links) {
      if (link.tab_id) {
        if (!map.has(link.tab_id)) map.set(link.tab_id, []);
        map.get(link.tab_id)!.push(link);
      }
    }
    return map;
  }, [links]);

  const sortedAlbums = useMemo(() => {
    if (!focusTabId) return albums;
    return [...albums].sort((a, b) =>
      a.id === focusTabId ? -1 : b.id === focusTabId ? 1 : 0,
    );
  }, [albums, focusTabId]);

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-2xl">
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
          <Share2 size={16} className="text-bridge-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-foreground">
            {t('photoGallery.shareManagerTitle', '공유 링크 관리')}
          </h3>
          <p className="text-xs text-slate-500 truncate">
            {t(
              'photoGallery.manageLinksDesc',
              '발급된 공유 링크를 확인하고 즉시 만료시킬 수 있습니다',
            )}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
        </div>
      ) : (
        <div className="px-5 pb-5 pt-4 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
          <ShareLinkSection
            title={t('photoGallery.galleryAllAlbums', '갤러리 전체')}
            tabId={null}
            links={galleryLinks}
            issuingKey={issuingKey}
            revokingId={revokingId}
            copiedId={copiedId}
            onIssue={handleIssue}
            onRevoke={handleRevoke}
            onCopy={handleCopy}
          />

          {sortedAlbums.map((album) => (
            <ShareLinkSection
              key={album.id}
              title={album.name}
              tabId={album.id}
              links={tabLinksMap.get(album.id) ?? []}
              issuingKey={issuingKey}
              revokingId={revokingId}
              copiedId={copiedId}
              onIssue={handleIssue}
              onRevoke={handleRevoke}
              onCopy={handleCopy}
              defaultExpanded={album.id === focusTabId}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          Esc {t('common.close', '닫기')}
        </span>
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-all"
        >
          {t('common.done', '완료')}
        </button>
      </div>
    </MotionModal>
  );
}

interface ShareLinkSectionProps {
  title: string;
  tabId: string | null;
  links: PhotoShareLink[];
  issuingKey: string | null;
  revokingId: string | null;
  copiedId: string | null;
  onIssue: (
    tabId: string | null,
    type: PhotoShareLinkType,
    expiresInDays: number | null,
    title: string | null,
  ) => void;
  onRevoke: (linkId: string) => void;
  onCopy: (link: PhotoShareLink) => void;
  defaultExpanded?: boolean;
}

function ShareLinkSection({
  title,
  tabId,
  links,
  issuingKey,
  revokingId,
  copiedId,
  onIssue,
  onRevoke,
  onCopy,
  defaultExpanded,
}: ShareLinkSectionProps) {
  const { t } = useTranslation();
  const [formType, setFormType] = useState<PhotoShareLinkType | null>(
    defaultExpanded && links.length === 0 ? 'VIEW' : null,
  );
  const [formExpiresInDays, setFormExpiresInDays] = useState<number>(7);
  const [formTitle, setFormTitle] = useState('');

  const sectionKey = tabId ?? 'gallery';
  const isIssuing =
    issuingKey === `${sectionKey}-VIEW` || issuingKey === `${sectionKey}-UPLOAD`;

  const submit = (type: PhotoShareLinkType) => {
    onIssue(
      tabId,
      type,
      formExpiresInDays === 0 ? null : formExpiresInDays,
      formTitle.trim() || null,
    );
    setFormTitle('');
    setFormType(null);
  };

  return (
    <div className="rounded-2xl border border-foreground/[0.08] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-foreground/[0.06] border-b border-foreground/[0.06]">
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex-1 truncate">
          {title}
        </h4>
        <button
          onClick={() => setFormType(formType === 'VIEW' ? null : 'VIEW')}
          disabled={isIssuing}
          className="text-xs font-bold px-2 py-1 rounded-lg bg-bridge-accent/15 text-bridge-accent hover:bg-bridge-accent/25 transition-colors flex items-center gap-1"
        >
          <Plus size={12} />
          {t('photoGallery.newViewLink', '새 보기 링크')}
        </button>
        <button
          onClick={() => setFormType(formType === 'UPLOAD' ? null : 'UPLOAD')}
          disabled={isIssuing}
          className="text-xs font-bold px-2 py-1 rounded-lg bg-bridge-secondary/15 text-bridge-secondary hover:bg-bridge-secondary/25 transition-colors flex items-center gap-1"
        >
          <Upload size={12} />
          {t('photoGallery.newUploadLink', '새 업로드 링크')}
        </button>
      </div>

      {formType && (
        <div className="px-3 py-3 border-b border-foreground/[0.06] space-y-2 bg-foreground/[0.02]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {t('photoGallery.expiresIn', '만료')}
            </span>
            {EXPIRY_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setFormExpiresInDays(preset.value)}
                className={`text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
                  formExpiresInDays === preset.value
                    ? 'bg-bridge-accent text-white'
                    : 'bg-foreground/5 text-slate-400 hover:bg-foreground/10'
                }`}
              >
                {t(`photoGallery.expirePresets.${preset.labelKey}`)}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            maxLength={100}
            placeholder={t(
              'photoGallery.linkLabelPlaceholder',
              '라벨 (선택, 예: 외부 공유, 행사 안내)',
            )}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-2 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setFormType(null)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg text-slate-400 hover:bg-foreground/5"
            >
              {t('common.cancel', '취소')}
            </button>
            <button
              onClick={() => submit(formType)}
              disabled={isIssuing}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-colors ${
                formType === 'VIEW'
                  ? 'bg-bridge-accent hover:bg-bridge-accent/90'
                  : 'bg-bridge-secondary hover:bg-bridge-secondary/90'
              }`}
            >
              {isIssuing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                t('photoGallery.issueLink', '발급')
              )}
            </button>
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <div className="px-3 py-4 text-xs text-slate-500 text-center">
          {t('photoGallery.noLinksYet', '발급된 링크가 없습니다')}
        </div>
      ) : (
        <div className="divide-y divide-foreground/[0.06]">
          {links.map((link) => (
            <ShareLinkRow
              key={link.id}
              link={link}
              isRevoking={revokingId === link.id}
              isCopied={copiedId === link.id}
              onRevoke={() => onRevoke(link.id)}
              onCopy={() => onCopy(link)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ShareLinkRowProps {
  link: PhotoShareLink;
  isRevoking: boolean;
  isCopied: boolean;
  onRevoke: () => void;
  onCopy: () => void;
}

function ShareLinkRow({
  link,
  isRevoking,
  isCopied,
  onRevoke,
  onCopy,
}: ShareLinkRowProps) {
  const { t } = useTranslation();
  const url = buildShareUrl(link);
  const isUpload = link.link_type === 'UPLOAD';
  const typeColor = isUpload
    ? 'bg-bridge-secondary/15 text-bridge-secondary'
    : 'bg-bridge-accent/15 text-bridge-accent';

  let statusText: string;
  let statusCls: string;
  if (link.status === 'EXPIRED') {
    statusText = t('photoGallery.statusExpired', '만료됨');
    statusCls = 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  } else if (link.status === 'REVOKED') {
    statusText = t('photoGallery.statusRevoked', '회수됨');
    statusCls = 'bg-slate-500/15 text-slate-500';
  } else if (link.expires_at) {
    const ms = new Date(link.expires_at).getTime() - Date.now();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.max(0, Math.floor(ms / (1000 * 60 * 60)));
    statusText =
      days > 0
        ? t('photoGallery.daysLeft', '{{n}}일 남음', { n: days })
        : t('photoGallery.hoursLeft', '{{n}}시간 남음', { n: hours });
    statusCls = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  } else {
    statusText = t('photoGallery.expiresNever', '영구');
    statusCls = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  }

  return (
    <div className="px-3 py-2.5 hover:bg-foreground/[0.02] transition-colors">
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${typeColor} flex items-center gap-1 shrink-0`}
        >
          {isUpload ? <Upload size={10} /> : <Eye size={10} />}
          {isUpload
            ? t('photoGallery.linkType.upload', '업로드')
            : t('photoGallery.linkType.view', '보기')}
        </span>
        <span className="text-sm font-bold text-foreground truncate flex-1">
          {link.title || t('photoGallery.unnamed', '이름 없음')}
        </span>
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${statusCls} shrink-0`}
        >
          {statusText}
        </span>
        <button
          onClick={onCopy}
          className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
          aria-label={t('photoGallery.shareCopy', '복사')}
          title={t('photoGallery.shareCopy', '복사')}
        >
          {isCopied ? (
            <Check size={14} className="text-bridge-accent" />
          ) : (
            <Copy size={14} />
          )}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
          aria-label="Open in new tab"
        >
          <ExternalLink size={14} />
        </a>
        <button
          onClick={onRevoke}
          disabled={isRevoking}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
          aria-label={t('photoGallery.expireNow', '즉시 만료')}
          title={t('photoGallery.expireNow', '즉시 만료')}
        >
          {isRevoking ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
        </button>
      </div>
      <div className="mt-1.5 px-2 py-1 bg-foreground/[0.03] rounded-md">
        <span className="text-xs text-slate-500 truncate block">{url}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 flex-wrap">
        {link.access_count > 0 && (
          <span className="flex items-center gap-1">
            <Eye size={10} />
            {t('photoGallery.accessedNTimes', '{{n}}회 접근', {
              n: link.access_count,
            })}
          </span>
        )}
        {link.last_accessed_at && (
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {t('photoGallery.lastAccessed', '최근 {{time}}', {
              time: formatRelativeTime(link.last_accessed_at),
            })}
          </span>
        )}
        {link.created_by && link.created_at && (
          <span className="ml-auto text-slate-600">
            {link.created_by.name} · {formatDateTime(link.created_at)}
          </span>
        )}
      </div>
    </div>
  );
}
