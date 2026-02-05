import { useState } from 'react';
import { X, Check, Rocket, Calendar, BarChart3, Target, Zap } from 'lucide-react';

export type UpgradeTrigger =
  | 'task_limit'
  | 'weekly_schedule'
  | 'daily_schedule'
  | 'milestone'
  | 'statistics'
  | 'trial_ending';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  trigger: UpgradeTrigger;
  seatCount: number;
  onUpgrade: (billingCycle: 'MONTHLY' | 'YEARLY') => Promise<void>;
}

const TRIGGER_MESSAGES: Record<UpgradeTrigger, { title: string; description: string }> = {
  task_limit: {
    title: 'Task 한도에 도달했습니다',
    description: 'Standard 보드는 최대 10개의 Task만 생성할 수 있습니다.',
  },
  weekly_schedule: {
    title: '위클리 스케줄은 Premium 기능입니다',
    description: 'Gantt 차트로 팀의 일정을 한눈에 관리하세요.',
  },
  daily_schedule: {
    title: '데일리 스케줄은 Premium 기능입니다',
    description: '팀원별 시간 블록으로 하루 업무를 효율적으로 배치하세요.',
  },
  milestone: {
    title: '마일스톤은 Premium 기능입니다',
    description: 'Feature를 기간별로 그룹화하여 프로젝트를 체계적으로 관리하세요.',
  },
  statistics: {
    title: '통계 대시보드는 Premium 기능입니다',
    description: '팀의 생산성과 업무 분석을 통해 의사결정을 지원합니다.',
  },
  trial_ending: {
    title: 'Trial이 곧 종료됩니다',
    description: 'Premium을 유지하고 모든 기능을 계속 사용하세요.',
  },
};

const PREMIUM_FEATURES = [
  { icon: Zap, text: '무제한 Task 생성' },
  { icon: Calendar, text: '위클리 스케줄 (Gantt 차트)' },
  { icon: BarChart3, text: '데일리 스케줄 (타임블록)' },
  { icon: Target, text: '마일스톤 관리' },
];

const PRICE_PER_SEAT = {
  monthly: 5,
  yearly: 50,
};

export function UpgradeModal({
  open,
  onClose,
  trigger,
  seatCount,
  onUpgrade,
}: UpgradeModalProps) {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('YEARLY');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!open) return null;

  const triggerMessage = TRIGGER_MESSAGES[trigger];
  const monthlyPrice = PRICE_PER_SEAT.monthly * seatCount;
  const yearlyPrice = PRICE_PER_SEAT.yearly * seatCount;
  const yearlyMonthlyPrice = yearlyPrice / 12;
  const discountPercentage = 17;

  const handleUpgrade = async () => {
    setIsProcessing(true);
    try {
      await onUpgrade(billingCycle);
      onClose();
    } catch (error) {
      console.error('Upgrade failed:', error);
      alert('업그레이드에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bridge-obsidian rounded-2xl shadow-2xl w-full max-w-lg border border-white/20 overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-bridge-accent/20 rounded-xl">
              <Rocket className="h-6 w-6 text-bridge-accent" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Premium으로 업그레이드</h2>
          </div>

          {/* Trigger message */}
          <div className="bg-bridge-dark/50 rounded-xl p-4 border border-white/15">
            <p className="text-foreground font-medium mb-1">{triggerMessage.title}</p>
            <p className="text-slate-400 text-sm">{triggerMessage.description}</p>
          </div>
        </div>

        {/* Features */}
        <div className="px-6 pb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            Premium 혜택
          </p>
          <div className="space-y-2">
            {PREMIUM_FEATURES.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="p-1.5 bg-bridge-accent/10 rounded-lg">
                  <feature.icon className="h-4 w-4 text-bridge-accent" />
                </div>
                <span className="text-slate-300 text-sm">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div className="px-6 pb-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            요금 선택
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* Monthly */}
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={`relative p-4 rounded-xl border transition-all ${
                billingCycle === 'MONTHLY'
                  ? 'border-bridge-accent bg-bridge-accent/10'
                  : 'border-white/20 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <div className="text-left">
                <p className="text-slate-400 text-xs mb-1">월 결제</p>
                <p className="text-foreground text-xl font-bold">${monthlyPrice}</p>
                <p className="text-slate-400 text-xs">/month</p>
              </div>
              {billingCycle === 'MONTHLY' && (
                <div className="absolute top-3 right-3">
                  <Check className="h-4 w-4 text-bridge-accent" />
                </div>
              )}
            </button>

            {/* Yearly */}
            <button
              onClick={() => setBillingCycle('YEARLY')}
              className={`relative p-4 rounded-xl border transition-all ${
                billingCycle === 'YEARLY'
                  ? 'border-bridge-accent bg-bridge-accent/10'
                  : 'border-white/20 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <div className="absolute -top-2 -right-2">
                <span className="px-2 py-0.5 bg-bridge-secondary text-bridge-dark text-[10px] font-bold rounded-full">
                  {discountPercentage}% 할인
                </span>
              </div>
              <div className="text-left">
                <p className="text-slate-400 text-xs mb-1">연 결제</p>
                <p className="text-foreground text-xl font-bold">${yearlyPrice}</p>
                <p className="text-slate-400 text-xs">/year (${yearlyMonthlyPrice.toFixed(2)}/mo)</p>
              </div>
              {billingCycle === 'YEARLY' && (
                <div className="absolute top-3 right-3">
                  <Check className="h-4 w-4 text-bridge-accent" />
                </div>
              )}
            </button>
          </div>

          {/* Seat info */}
          <p className="text-slate-400 text-xs mt-3 text-center">
            현재 유료 멤버: {seatCount}명 × ${billingCycle === 'MONTHLY' ? PRICE_PER_SEAT.monthly : PRICE_PER_SEAT.yearly}
            {billingCycle === 'YEARLY' ? '/year' : '/month'}
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white/5 border border-white/20 text-foreground rounded-xl font-medium hover:bg-white/10 transition-all"
          >
            나중에
          </button>
          <button
            onClick={handleUpgrade}
            disabled={isProcessing}
            className="flex-1 px-4 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? '처리 중...' : 'Premium 시작하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
