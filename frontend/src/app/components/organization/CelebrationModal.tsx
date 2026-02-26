import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Cake, PartyPopper, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { MotionModal } from '../ui/MotionModal';
import { anniversaryService } from '../../utils/services';
import { formatRelativeTime } from '../../utils/dateUtils';
import { resolveFileUrl } from '../../utils/api';
import type { AnniversaryType, CelebrationMessage } from '../../types';

interface CelebrationModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  memberId: string;
  memberName: string;
  type: AnniversaryType;
  date: string;
  years?: number | null;
}

export function CelebrationModal({
  open,
  onClose,
  orgId,
  memberId,
  memberName,
  type,
  date,
  years,
}: CelebrationModalProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<CelebrationMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isBirthday = type === 'BIRTHDAY';
  const Icon = isBirthday ? Cake : PartyPopper;

  const title = isBirthday
    ? t('organization.anniversary.celebrationTitle_BIRTHDAY', "Happy Birthday, {{name}}!", { name: memberName })
    : t('organization.anniversary.celebrationTitle_HIRE_ANNIVERSARY', "Congratulations on {{name}}'s {{years}} Year Work Anniversary!", { name: memberName, years: String(years || '') });

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await anniversaryService.getMessages(orgId, memberId, { type, date });
      setMessages(data.messages || []);
    } catch {
      // Optional
    } finally {
      setLoading(false);
    }
  }, [orgId, memberId, type, date]);

  useEffect(() => {
    if (open) {
      fetchMessages();
      setNewMessage('');
      setError(null);
    }
  }, [open, fetchMessages]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    try {
      setSending(true);
      setError(null);
      await anniversaryService.createMessage(orgId, memberId, { type, date, message: newMessage.trim() });
      setNewMessage('');
      await fetchMessages();
      // Scroll to top to see new message
      if (listRef.current) {
        listRef.current.scrollTop = 0;
      }
    } catch (err: any) {
      if (err?.code === 'CB001') {
        setError(t('organization.anniversary.duplicateMessage', 'You have already sent a celebration message'));
      } else {
        setError(err?.message || 'Failed to send message');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose}>
      {/* Top Accent Line */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isBirthday ? 'bg-pink-500/15' : 'bg-amber-500/15'}`}>
          <Icon size={18} className={isBirthday ? 'text-pink-500' : 'text-amber-500'} />
        </div>
        <h2 className="text-sm font-bold text-foreground leading-snug">{title}</h2>
      </div>

      {/* Message Input */}
      <div className="px-5 pt-4 pb-3">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value.slice(0, 500))}
          placeholder={t('organization.anniversary.messagePlaceholder', 'Leave a celebration message...')}
          rows={3}
          className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 outline-none resize-none focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-slate-500">{newMessage.length}/500</span>
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={12} />
            {t('organization.anniversary.send', 'Send')}
          </button>
        </div>
        {error && (
          <p className="text-[11px] text-red-500 mt-1">{error}</p>
        )}
      </div>

      {/* Messages List */}
      <div ref={listRef} className="px-5 pb-4 max-h-[300px] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 bg-foreground/[0.03] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">
              {t('organization.anniversary.noMessages', 'No celebration messages yet')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, index) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="flex items-start gap-2.5 py-2"
              >
                {msg.author_profile_image_url ? (
                  <img
                    src={resolveFileUrl(msg.author_profile_image_url)}
                    alt={msg.author_name}
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-bridge-accent/15 flex items-center justify-center text-[10px] text-bridge-accent font-bold shrink-0">
                    {msg.author_name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{msg.author_name}</span>
                    <span className="text-[10px] text-slate-500">{formatRelativeTime(msg.created_at)}</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">{msg.message}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-[10px] text-slate-500">Esc {t('common.close', 'Close')}</span>
        {messages.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {t('organization.anniversary.messageCount', '{{count}} messages', { count: String(messages.length) })}
          </span>
        )}
      </div>
    </MotionModal>
  );
}
