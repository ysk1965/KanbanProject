import { X, CheckCircle2, Rocket, Star } from 'lucide-react';
import { MotionModal } from '../ui/MotionModal';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberCount?: number;
}

const FEATURES = [
  '무제한 Task 생성',
  '위클리 스케줄 (Gantt 차트)',
  '데일리 스케줄 (타임블록)',
  '마일스톤 관리',
  '팀 통계 대시보드',
  '우선 지원',
];

export function UpgradeModal({ isOpen, onClose, memberCount = 1 }: UpgradeModalProps) {
  const monthlyPrice = 5;
  const yearlyPrice = 50;
  const yearlyMonthlyPrice = Math.round(yearlyPrice / 12 * 100) / 100;
  const discountPercent = Math.round((1 - yearlyMonthlyPrice / monthlyPrice) * 100);

  return (
    <MotionModal open={isOpen} onClose={onClose} className="sm:max-w-2xl p-0 overflow-hidden">
        {/* Header */}
        <div className="p-8 text-center bg-gradient-to-b from-bridge-accent/10 to-transparent">
          <button
            onClick={onClose}
            className="absolute p-2 transition-colors right-4 top-4 text-white/40 hover:text-foreground"
          >
            <X size={20} />
          </button>
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-bridge-accent/20 rounded-full">
              <Rocket className="text-bridge-accent" size={32} />
            </div>
          </div>
          <h2 className="mb-2 text-3xl font-bold tracking-tight font-jakarta text-foreground">
            Premium으로 업그레이드
          </h2>
          <p className="text-slate-400">더 많은 기능으로 팀의 생산성을 높이세요</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Features list */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {FEATURES.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3 text-muted-foreground">
                <CheckCircle2 size={18} className="text-bridge-secondary shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>

          {/* Pricing Options */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Monthly */}
            <button className="flex flex-col items-center p-6 transition-all border group rounded-xl border-bridge-border hover:border-bridge-accent/50 bg-foreground/5">
              <span className="mb-1 text-xs font-semibold tracking-widest text-slate-400 uppercase">
                Monthly
              </span>
              <span className="text-2xl font-bold text-foreground">
                ${monthlyPrice}
                <span className="text-sm font-normal text-slate-400">/user/month</span>
              </span>
              <div className="px-4 py-2 mt-4 text-sm font-medium transition-colors border border-bridge-border rounded-lg text-foreground group-hover:bg-foreground group-hover:text-bridge-dark">
                선택
              </div>
            </button>

            {/* Yearly */}
            <button className="relative flex flex-col items-center p-6 transition-all border group rounded-xl border-bridge-accent/50 bg-bridge-accent/5">
              <div className="absolute top-0 right-0 px-2 py-1 flex items-center gap-1 text-[10px] font-bold text-white uppercase bg-bridge-accent rounded-bl-lg -translate-y-px translate-x-px">
                <Star size={10} /> 추천
              </div>
              <span className="mb-1 text-xs font-semibold tracking-widest text-bridge-accent uppercase">
                Yearly
              </span>
              <span className="text-2xl font-bold text-foreground">
                ${yearlyPrice}
                <span className="text-sm font-normal text-slate-400">/user/year</span>
              </span>
              <span className="mt-1 text-[10px] text-bridge-secondary font-bold uppercase tracking-wider">
                {discountPercent}% DISCOUNT
              </span>
              <div className="px-4 py-2 mt-4 text-sm font-medium transition-colors bg-bridge-accent rounded-lg text-white group-hover:bg-bridge-accent/80">
                선택
              </div>
            </button>
          </div>

          {/* Summary */}
          <div className="p-4 text-center rounded-xl bg-black/40">
            <p className="text-sm text-slate-400">
              현재 유료 멤버: <span className="font-bold text-foreground">{memberCount}명</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              예상 비용: ${memberCount * monthlyPrice}/month 또는 $
              {memberCount * yearlyPrice}/year
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-8 border-t border-bridge-border bg-white/[0.02]">
          <button
            onClick={onClose}
            className="text-sm font-medium text-slate-400 hover:text-foreground transition-colors"
          >
            나중에 하기
          </button>
          <button className="px-8 py-3 font-bold transition-all rounded-full bg-bridge-accent hover:bg-bridge-accent/80 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] text-white">
            Premium 시작하기
          </button>
        </div>
    </MotionModal>
  );
}
