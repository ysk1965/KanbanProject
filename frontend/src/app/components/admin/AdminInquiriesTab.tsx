import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Clock, Loader2, CheckCircle2, AlertCircle, Send, ChevronLeft, Paperclip, X } from 'lucide-react';
import { adminService } from '../../utils/services';
import type { InquirySummary, InquiryDetail, InquiryStatus, InquiryListResponse } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import type { TFunction } from 'i18next';

function getStatusConfig(t: TFunction): Record<InquiryStatus, { label: string; color: string; bgColor: string }> {
  return {
    PENDING: { label: t('admin.inquiries.statusPending'), color: 'text-yellow-400', bgColor: 'bg-yellow-400/10' },
    IN_PROGRESS: { label: t('admin.inquiries.statusInProgress'), color: 'text-blue-400', bgColor: 'bg-blue-400/10' },
    RESOLVED: { label: t('admin.inquiries.statusResolved'), color: 'text-green-400', bgColor: 'bg-green-400/10' },
    CLOSED: { label: t('admin.inquiries.statusClosed'), color: 'text-slate-400', bgColor: 'bg-slate-400/10' },
  };
}

function getStatusOptions(t: TFunction): { value: string; label: string }[] {
  return [
    { value: '', label: t('common.all') },
    { value: 'PENDING', label: t('admin.inquiries.statusPending') },
    { value: 'IN_PROGRESS', label: t('admin.inquiries.statusInProgress') },
    { value: 'RESOLVED', label: t('admin.inquiries.statusResolved') },
    { value: 'CLOSED', label: t('admin.inquiries.statusClosed') },
  ];
}

export function AdminInquiriesTab() {
  const { t } = useTranslation();
  const STATUS_CONFIG = getStatusConfig(t);
  const STATUS_OPTIONS = getStatusOptions(t);
  const [inquiries, setInquiries] = useState<InquirySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedInquiry, setSelectedInquiry] = useState<InquiryDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  const loadInquiries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data: InquiryListResponse = await adminService.getInquiries({
        page,
        size: 20,
        status: statusFilter || undefined,
      });
      setInquiries(data.inquiries);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load inquiries:', err);
      setError(t('admin.inquiries.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadInquiries();
  }, [loadInquiries]);

  const loadDetail = async (inquiryId: string) => {
    setIsLoadingDetail(true);
    try {
      const data = await adminService.getInquiryDetail(inquiryId);
      setSelectedInquiry(data);
    } catch (err) {
      console.error('Failed to load inquiry detail:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleReply = async () => {
    if (!selectedInquiry || !replyContent.trim()) return;
    setIsReplying(true);
    try {
      await adminService.replyToInquiry(selectedInquiry.id, replyContent.trim());
      setReplyContent('');
      await loadDetail(selectedInquiry.id);
      loadInquiries();
    } catch (err) {
      console.error('Failed to reply:', err);
    } finally {
      setIsReplying(false);
    }
  };

  const handleStatusChange = async (inquiryId: string, newStatus: string) => {
    try {
      await adminService.updateInquiryStatus(inquiryId, newStatus);
      await loadDetail(inquiryId);
      loadInquiries();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  if (selectedInquiry) {
    return (
      <InquiryDetailPanel
        inquiry={selectedInquiry}
        isLoading={isLoadingDetail}
        replyContent={replyContent}
        isReplying={isReplying}
        onReplyContentChange={setReplyContent}
        onReply={handleReply}
        onStatusChange={(status) => handleStatusChange(selectedInquiry.id, status)}
        onBack={() => setSelectedInquiry(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{t('admin.inquiries.title')}</h2>
        <p className="text-slate-400">{t('admin.inquiries.subtitle')}</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 md:gap-3 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map(option => (
          <button
            key={option.value}
            onClick={() => { setStatusFilter(option.value); setPage(0); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === option.value
                ? 'bg-bridge-accent text-white'
                : 'bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-bridge-accent" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-slate-400">{error}</p>
          <button
            onClick={loadInquiries}
            className="px-4 py-2 bg-bridge-accent text-white rounded-lg text-sm hover:bg-bridge-accent/90 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : inquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <MessageSquare size={48} className="text-slate-600" />
          <p className="text-slate-400">{t('admin.inquiries.noInquiries')}</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-foreground/[0.08]">
                  <th className="text-left px-3 py-3 md:px-6 md:py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('admin.inquiries.subject')}</th>
                  <th className="text-left px-3 py-3 md:px-6 md:py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('admin.inquiries.author')}</th>
                  <th className="text-left px-3 py-3 md:px-6 md:py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('admin.inquiries.status')}</th>
                  <th className="text-left px-3 py-3 md:px-6 md:py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('admin.inquiries.replies')}</th>
                  <th className="text-left px-3 py-3 md:px-6 md:py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('admin.inquiries.date')}</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map(inquiry => {
                  const statusConfig = STATUS_CONFIG[inquiry.status];
                  return (
                    <tr
                      key={inquiry.id}
                      onClick={() => loadDetail(inquiry.id)}
                      className="border-b border-foreground/[0.08] last:border-0 hover:bg-foreground/5 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className="text-foreground font-medium">{inquiry.title}</span>
                        {inquiry.attachment_count > 0 && (
                          <Paperclip size={12} className="inline ml-2 text-slate-500" />
                        )}
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                            <span className="text-xs text-bridge-accent font-bold">
                              {inquiry.user?.name?.charAt(0) || '?'}
                            </span>
                          </div>
                          <span className="text-muted-foreground text-sm">{inquiry.user?.name || '-'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color} ${statusConfig.bgColor}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className="text-slate-400 text-sm">{t('admin.inquiries.replyCount', { count: inquiry.reply_count })}</span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className="text-slate-500 text-sm">
                          {formatDate(inquiry.created_at, 'yyyy-MM-dd')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 bg-foreground/5 text-slate-400 rounded-lg text-sm hover:bg-foreground/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.previous')}
              </button>
              <span className="text-slate-400 text-sm px-3">
                {page + 1} / {Math.ceil(total / 20)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * 20 >= total}
                className="px-3 py-1.5 bg-foreground/5 text-slate-400 rounded-lg text-sm hover:bg-foreground/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InquiryDetailPanel({
  inquiry,
  isLoading,
  replyContent,
  isReplying,
  onReplyContentChange,
  onReply,
  onStatusChange,
  onBack,
}: {
  inquiry: InquiryDetail;
  isLoading: boolean;
  replyContent: string;
  isReplying: boolean;
  onReplyContentChange: (v: string) => void;
  onReply: () => void;
  onStatusChange: (status: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const STATUS_CONFIG = getStatusConfig(t);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-bridge-accent" />
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[inquiry.status];

  return (
    <div className="space-y-6">
      {/* Back Button + Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-foreground transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold text-foreground">{t('admin.inquiries.detail')}</h2>
      </div>

      {/* Inquiry Info Card */}
      <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-4 md:p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-foreground font-bold text-lg">{inquiry.title}</h3>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                  <span className="text-xs text-bridge-accent font-bold">
                    {inquiry.user?.name?.charAt(0) || '?'}
                  </span>
                </div>
                <span className="text-muted-foreground text-sm">{inquiry.user?.name}</span>
                <span className="text-slate-600 text-sm">({inquiry.user?.email})</span>
              </div>
              <span className="text-slate-500 text-sm">
                {formatDate(inquiry.created_at, t('admin.common.dateTimeFormat'))}
              </span>
            </div>
          </div>

          {/* Status Dropdown */}
          <select
            value={inquiry.status}
            onChange={e => onStatusChange(e.target.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border-0 outline-none cursor-pointer ${statusConfig.color} ${statusConfig.bgColor}`}
          >
            <option value="PENDING">{t('admin.inquiries.statusPending')}</option>
            <option value="IN_PROGRESS">{t('admin.inquiries.statusInProgress')}</option>
            <option value="RESOLVED">{t('admin.inquiries.statusResolved')}</option>
            <option value="CLOSED">{t('admin.inquiries.statusClosed')}</option>
          </select>
        </div>

        <div className="bg-foreground/5 rounded-xl p-4">
          <p className="text-muted-foreground text-sm whitespace-pre-wrap leading-relaxed">{inquiry.content}</p>
        </div>

        {inquiry.attachments.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('admin.inquiries.attachments')}</p>
            <div className="flex flex-wrap gap-2">
              {inquiry.attachments.map(att => (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-foreground/5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
                >
                  <Paperclip size={14} />
                  <span className="truncate max-w-[200px]">{att.original_file_name}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Replies */}
      {inquiry.replies.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('admin.inquiries.replyHistory')}</h4>
          {inquiry.replies.map(reply => (
            <div key={reply.id} className="bg-bridge-accent/10 border border-bridge-accent/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-bridge-accent/30 flex items-center justify-center">
                  <span className="text-xs text-white font-bold">
                    {reply.admin?.name?.charAt(0) || 'A'}
                  </span>
                </div>
                <span className="text-foreground text-sm font-medium">{reply.admin?.name}</span>
                <span className="text-slate-500 text-xs">
                  {formatDate(reply.created_at, t('admin.common.dateTimeFormat'))}
                </span>
              </div>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap leading-relaxed">{reply.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reply Form */}
      <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-3 md:p-4 space-y-3">
        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('admin.inquiries.writeReply')}</h4>
        <textarea
          value={replyContent}
          onChange={e => onReplyContentChange(e.target.value)}
          placeholder={t('admin.inquiries.replyPlaceholder')}
          rows={4}
          className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
          maxLength={5000}
        />
        <div className="flex justify-end">
          <button
            onClick={onReply}
            disabled={isReplying || !replyContent.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReplying ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {t('admin.inquiries.sendReply')}
          </button>
        </div>
      </div>
    </div>
  );
}
