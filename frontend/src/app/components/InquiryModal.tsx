import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Send, Paperclip, ChevronLeft, Clock, CheckCircle2, Loader2, AlertCircle, MessageSquare } from 'lucide-react';
import { inquiryService } from '../utils/services';
import { fileAPI } from '../utils/api';
import type { InquirySummary, InquiryDetail, InquiryStatus } from '../types';
import { formatDate } from '../utils/dateUtils';
import { MotionModal } from './ui/MotionModal';

interface InquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_CONFIG: Record<InquiryStatus, { labelKey: string; color: string; icon: React.ReactNode }> = {
  PENDING: { labelKey: 'inquiry.statusPending', color: 'text-yellow-400 bg-yellow-400/10', icon: <Clock size={12} /> },
  IN_PROGRESS: { labelKey: 'inquiry.statusInProgress', color: 'text-blue-400 bg-blue-400/10', icon: <Loader2 size={12} /> },
  RESOLVED: { labelKey: 'inquiry.statusResolved', color: 'text-green-400 bg-green-400/10', icon: <CheckCircle2 size={12} /> },
  CLOSED: { labelKey: 'inquiry.statusClosed', color: 'text-slate-400 bg-slate-400/10', icon: <AlertCircle size={12} /> },
};

export function InquiryModal({ isOpen, onClose }: InquiryModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<{ file: File; tempKey: string; previewUrl: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [inquiries, setInquiries] = useState<InquirySummary[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<InquiryDetail | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      loadInquiries();
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setContent('');
      setFiles([]);
      setSubmitSuccess(false);
      setSelectedInquiry(null);
    }
  }, [isOpen]);

  const loadInquiries = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await inquiryService.getMyInquiries();
      setInquiries(data);
    } catch (error) {
      console.error('Failed to load inquiries:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadInquiryDetail = async (inquiryId: string) => {
    setIsLoadingDetail(true);
    try {
      const data = await inquiryService.getInquiry(inquiryId);
      setSelectedInquiry(data);
    } catch (error) {
      console.error('Failed to load inquiry detail:', error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    for (let i = 0; i < selectedFiles.length; i++) {
      if (files.length + i >= 5) break;
      const file = selectedFiles[i];
      try {
        const result = await fileAPI.smartUpload(file);
        setFiles(prev => [...prev, { file, tempKey: result.tempKey, previewUrl: result.previewUrl }]);
      } catch (error) {
        console.error('File upload failed:', error);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    setIsSubmitting(true);
    try {
      await inquiryService.createInquiry({
        title: title.trim(),
        content: content.trim(),
        fileKeys: files.length > 0 ? files.map(f => f.tempKey) : undefined,
      });
      setSubmitSuccess(true);
      setTitle('');
      setContent('');
      setFiles([]);
      setTimeout(() => {
        setSubmitSuccess(false);
        setActiveTab('history');
        loadInquiries();
      }, 1500);
    } catch (error) {
      console.error('Failed to submit inquiry:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MotionModal open={isOpen} onClose={onClose} className="sm:max-w-lg max-h-[80dvh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10">
          <div className="flex items-center gap-3">
            {selectedInquiry && (
              <button
                onClick={() => setSelectedInquiry(null)}
                className="text-slate-400 hover:text-foreground transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <MessageSquare size={20} className="text-bridge-accent" />
            <h2 className="text-lg font-bold text-foreground">
              {selectedInquiry ? t('inquiry.detailTitle') : t('inquiry.title')}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        {!selectedInquiry && (
          <div className="flex border-b border-foreground/10">
            <button
              onClick={() => setActiveTab('new')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'new'
                  ? 'text-bridge-accent border-b-2 border-bridge-accent'
                  : 'text-slate-400 hover:text-foreground'
              }`}
            >
              {t('inquiry.newInquiry')}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'text-bridge-accent border-b-2 border-bridge-accent'
                  : 'text-slate-400 hover:text-foreground'
              }`}
            >
              {t('inquiry.myHistory')}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedInquiry ? (
            <InquiryDetailView inquiry={selectedInquiry} isLoading={isLoadingDetail} onReplySubmitted={() => loadInquiryDetail(selectedInquiry.id)} />
          ) : activeTab === 'new' ? (
            submitSuccess ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <CheckCircle2 size={48} className="text-green-400" />
                <p className="text-foreground font-semibold">{t('inquiry.submitted')}</p>
                <p className="text-slate-400 text-sm">{t('inquiry.submittedDesc')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                    {t('inquiry.titleLabel')}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={t('inquiry.titlePlaceholder')}
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                    {t('inquiry.contentLabel')}
                  </label>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder={t('inquiry.contentPlaceholder')}
                    rows={6}
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
                    maxLength={5000}
                  />
                </div>

                {/* File Upload */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                    {t('inquiry.attachments')} ({files.length}/5)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={files.length >= 5}
                    className="flex items-center gap-2 px-4 py-2 bg-foreground/5 border border-foreground/10 rounded-xl text-slate-400 hover:text-foreground hover:bg-foreground/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Paperclip size={16} />
                    <span className="text-sm">{t('inquiry.attachFile')}</span>
                  </button>
                  {files.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center justify-between bg-foreground/5 rounded-lg px-3 py-2">
                          <span className="text-sm text-muted-foreground truncate">{f.file.name}</span>
                          <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-400 ml-2">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            <InquiryHistoryView
              inquiries={inquiries}
              isLoading={isLoadingHistory}
              onSelect={loadInquiryDetail}
            />
          )}
        </div>

        {/* Footer */}
        {activeTab === 'new' && !submitSuccess && !selectedInquiry && (
          <div className="px-6 py-4 border-t border-foreground/10">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !title.trim() || !content.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              {isSubmitting ? t('inquiry.sending') : t('inquiry.send')}
            </button>
          </div>
        )}
    </MotionModal>
  );
}

function InquiryHistoryView({
  inquiries,
  isLoading,
  onSelect,
}: {
  inquiries: InquirySummary[];
  isLoading: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (inquiries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <MessageSquare size={40} className="text-slate-600" />
        <p className="text-slate-400 text-sm">{t('inquiry.noHistory')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {inquiries.map(inquiry => {
        const statusConfig = STATUS_CONFIG[inquiry.status];
        return (
          <button
            key={inquiry.id}
            onClick={() => onSelect(inquiry.id)}
            className="w-full text-left bg-foreground/5 hover:bg-foreground/10 border border-foreground/5 rounded-xl p-4 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="text-foreground font-medium truncate">{inquiry.title}</h4>
                <p className="text-slate-500 text-xs mt-1">
                  {formatDate(inquiry.created_at, 'yyyy-MM-dd')}
                  {inquiry.reply_count > 0 && (
                    <span className="ml-2 text-bridge-accent">{t('inquiry.replyCount', { count: inquiry.reply_count })}</span>
                  )}
                </p>
              </div>
              <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                {statusConfig.icon}
                {t(statusConfig.labelKey)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function InquiryDetailView({
  inquiry,
  isLoading,
  onReplySubmitted,
}: {
  inquiry: InquiryDetail;
  isLoading: boolean;
  onReplySubmitted: () => void;
}) {
  const { t } = useTranslation();
  const [replyContent, setReplyContent] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-bridge-accent" />
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[inquiry.status];
  const isClosed = inquiry.status === 'CLOSED';

  const handleReplySubmit = async () => {
    if (!replyContent.trim()) return;
    setIsSubmittingReply(true);
    try {
      await inquiryService.replyToInquiry(inquiry.id, replyContent.trim());
      setReplyContent('');
      onReplySubmitted();
    } catch (error) {
      console.error('Failed to submit reply:', error);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.icon}
            {t(statusInfo.labelKey)}
          </span>
          <span className="text-slate-500 text-xs">
            {formatDate(inquiry.created_at, 'yyyy-MM-dd')}
          </span>
        </div>
        <h3 className="text-foreground font-bold text-lg">{inquiry.title}</h3>
      </div>

      <div className="bg-foreground/5 rounded-xl p-4">
        <p className="text-muted-foreground text-sm whitespace-pre-wrap leading-relaxed">{inquiry.content}</p>
      </div>

      {inquiry.attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('inquiry.attachments')}</p>
          {inquiry.attachments.map(att => (
            <a
              key={att.id}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-foreground/5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
            >
              <Paperclip size={14} />
              <span className="truncate">{att.original_file_name}</span>
            </a>
          ))}
        </div>
      )}

      {inquiry.replies.length > 0 && (
        <div className="space-y-3 mt-6">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('inquiry.conversationHistory')}</p>
          {inquiry.replies.map(reply => {
            const isAdmin = reply.reply_type === 'ADMIN';
            const replier = isAdmin ? reply.admin : reply.user;
            const name = replier?.name || (isAdmin ? 'Admin' : '나');
            const initial = name.charAt(0) || (isAdmin ? 'A' : 'U');

            return (
              <div
                key={reply.id}
                className={`rounded-xl p-4 ${
                  isAdmin
                    ? 'bg-bridge-accent/10 border border-bridge-accent/20'
                    : 'bg-foreground/5 border border-foreground/10'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    isAdmin ? 'bg-bridge-accent/30' : 'bg-emerald-500/30'
                  }`}>
                    <span className="text-xs text-white font-bold">{initial}</span>
                  </div>
                  <span className="text-foreground text-sm font-medium">{name}</span>
                  {isAdmin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-bridge-accent/20 text-bridge-accent font-medium">Admin</span>
                  )}
                  <span className="text-slate-500 text-xs">
                    {formatDate(reply.created_at, 'yyyy-MM-dd')}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm whitespace-pre-wrap leading-relaxed">{reply.content}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* User Reply Input */}
      {!isClosed && (
        <div className="mt-6 space-y-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('inquiry.additionalInquiry')}</p>
          <textarea
            value={replyContent}
            onChange={e => setReplyContent(e.target.value)}
            placeholder={t('inquiry.additionalPlaceholder')}
            rows={3}
            className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
            maxLength={5000}
          />
          <button
            onClick={handleReplySubmit}
            disabled={isSubmittingReply || !replyContent.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmittingReply ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {isSubmittingReply ? t('inquiry.sending') : t('inquiry.sendReply')}
          </button>
        </div>
      )}
    </div>
  );
}
