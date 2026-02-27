import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PartyPopper, Cake, Briefcase } from 'lucide-react';
import { personalDashboardService } from '../../utils/services';
import type { CelebrationsData, CelebrationItem } from '../../types';
import { resolveFileUrl } from '../../utils/api';

interface CelebrationsWidgetProps {
  date: string;
}

function CelebrationRow({ item, index }: { item: CelebrationItem; index: number }) {
  const [sent, setSent] = useState(item.already_sent);

  const handleSend = () => {
    // Placeholder: would call API to send celebration message
    setSent(true);
  };

  const TypeIcon = item.type === 'BIRTHDAY' ? Cake : Briefcase;
  const typeLabel = item.type === 'BIRTHDAY' ? '생일 축하' : '입사기념일';
  const typeColor = item.type === 'BIRTHDAY' ? 'text-pink-400' : 'text-purple-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex items-center gap-3 py-2"
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center overflow-hidden shrink-0">
        {item.member_profile_image ? (
          <img
            src={resolveFileUrl(item.member_profile_image)}
            alt={item.member_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-sm font-bold text-foreground">
            {item.member_name.charAt(0)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-foreground truncate">{item.member_name}</span>
          <span className="text-[10px] text-slate-500 truncate">{item.org_name}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <TypeIcon className={`w-3 h-3 ${typeColor}`} />
          <span className={`text-[11px] ${typeColor}`}>{typeLabel}</span>
        </div>
      </div>

      {/* Action */}
      {sent ? (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">
          보냄
        </span>
      ) : item.can_send_message ? (
        <button
          onClick={handleSend}
          className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-pink-500/15 text-pink-400 hover:bg-pink-500/25 transition-colors shrink-0"
        >
          축하 보내기
        </button>
      ) : null}
    </motion.div>
  );
}

export function CelebrationsWidget({ date }: CelebrationsWidgetProps) {
  const [data, setData] = useState<CelebrationsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    personalDashboardService.getCelebrations(date)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [date]);

  // Loading state: show nothing (widget only appears when there are celebrations)
  if (loading) return null;

  // Conditional rendering: only show when celebrations exist
  if (!data || data.celebrations.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08 }}
      className="rounded-2xl border border-pink-500/20 bg-gradient-to-r from-pink-500/5 to-purple-500/5 overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 md:px-5 py-2 md:py-3 border-b border-pink-500/10">
        <div className="flex items-center gap-2">
          <PartyPopper className="w-4 h-4 text-pink-400" />
          <h3 className="text-[13px] md:text-sm font-bold text-foreground">오늘의 축하</h3>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-400">
            {data.celebrations.length}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 md:px-5 py-2 md:py-3">
        {data.celebrations.map((item, idx) => (
          <CelebrationRow
            key={`${item.member_user_id}-${item.type}`}
            item={item}
            index={idx}
          />
        ))}
      </div>
    </motion.div>
  );
}
