import { useState } from 'react';
import { X, CreditCard, Users, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Subscription, PricingPlan } from '../types';

interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  plans: PricingPlan[];
  onSubscribe: (planId: string, billingCycle: 'monthly' | 'yearly') => Promise<void>;
  onChangePlan: (planId: string, billingCycle: 'monthly' | 'yearly') => Promise<void>;
  onCancelSubscription: () => Promise<void>;
}

export function SubscriptionModal({
  open,
  onClose,
  subscription,
  plans,
  onSubscribe,
  onChangePlan,
  onCancelSubscription,
}: SubscriptionModalProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(
    subscription?.billing_cycle === 'YEARLY' ? 'yearly' : 'monthly'
  );
  const [selectedPlanId, setSelectedPlanId] = useState(subscription?.plan || '');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!open) return null;

  const handleSubscribe = async () => {
    if (!selectedPlanId) return;

    setIsProcessing(true);
    try {
      if (subscription?.status === 'ACTIVE') {
        await onChangePlan(selectedPlanId, billingCycle);
      } else {
        await onSubscribe(selectedPlanId, billingCycle);
      }
    } catch (error) {
      console.error('Subscription action failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('정말 구독을 취소하시겠습니까?')) return;

    setIsProcessing(true);
    try {
      await onCancelSubscription();
    } catch (error) {
      console.error('Cancel subscription failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: Subscription['status']) => {
    switch (status) {
      case 'TRIAL':
        return <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs">무료 체험</span>;
      case 'ACTIVE':
        return <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs">활성</span>;
      case 'GRACE':
        return <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-xs">유예 기간</span>;
      case 'SUSPENDED':
        return <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs">일시 중지</span>;
      case 'CANCELED':
        return <span className="bg-gray-500/20 text-gray-400 px-2 py-1 rounded text-xs">취소됨</span>;
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR');
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ko-KR').format(price);
  };

  // 현재 선택된 플랜 이름 찾기
  const currentPlanName = plans.find(p => p.id === subscription?.plan)?.name || subscription?.plan || '-';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bridge-obsidian rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-400" />
            <h2 className="text-xl font-semibold text-foreground">구독 관리</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 현재 구독 정보 */}
          {subscription && (
            <div className="bg-bridge-dark rounded-lg p-6 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">현재 구독</h3>
                {getStatusBadge(subscription.status)}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-400 mb-1">플랜</div>
                  <div className="text-foreground font-medium">
                    {currentPlanName}
                  </div>
                </div>

                {subscription.billing_cycle && (
                  <div>
                    <div className="text-slate-400 mb-1">결제 주기</div>
                    <div className="text-foreground font-medium">
                      {subscription.billing_cycle === 'MONTHLY' ? '월간' : '연간'}
                    </div>
                  </div>
                )}

                {subscription.price != null && (
                  <div>
                    <div className="text-slate-400 mb-1">가격</div>
                    <div className="text-foreground font-medium">
                      ₩{formatPrice(subscription.price)}
                    </div>
                  </div>
                )}

                {subscription.billable_member_count != null && (
                  <div>
                    <div className="text-slate-400 mb-1">멤버 수</div>
                    <div className="text-foreground font-medium">
                      {subscription.billable_member_count}명 / {subscription.member_limit || '-'}명
                    </div>
                  </div>
                )}

                {subscription.status === 'TRIAL' && subscription.trial_ends_at && (
                  <div className="col-span-2">
                    <div className="text-slate-400 mb-1">체험 종료일</div>
                    <div className="text-foreground font-medium">
                      {formatDate(subscription.trial_ends_at)}
                    </div>
                  </div>
                )}

                {subscription.status === 'ACTIVE' && (
                  <>
                    {subscription.current_period_start && subscription.current_period_end && (
                      <div>
                        <div className="text-slate-400 mb-1">현재 결제 기간</div>
                        <div className="text-foreground font-medium">
                          {formatDate(subscription.current_period_start)} -{' '}
                          {formatDate(subscription.current_period_end)}
                        </div>
                      </div>
                    )}

                    {subscription.next_payment_at && (
                      <div>
                        <div className="text-slate-400 mb-1">다음 결제일</div>
                        <div className="text-foreground font-medium">
                          {formatDate(subscription.next_payment_at)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {subscription.status === 'ACTIVE' && (
                <div className="mt-4">
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    size="sm"
                    className="border-red-600 text-red-400 hover:bg-red-600/20"
                    disabled={isProcessing}
                  >
                    구독 취소
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 결제 주기 선택 */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">결제 주기</h3>
            <div className="flex gap-4">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                  billingCycle === 'monthly'
                    ? 'border-blue-500 bg-blue-500/10 text-foreground'
                    : 'border-white/10 bg-bridge-dark text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="font-medium">월간 결제</div>
                <div className="text-sm mt-1 opacity-75">매월 자동 결제</div>
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors relative ${
                  billingCycle === 'yearly'
                    ? 'border-blue-500 bg-blue-500/10 text-foreground'
                    : 'border-white/10 bg-bridge-dark text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                  17% 할인
                </div>
                <div className="font-medium">연간 결제</div>
                <div className="text-sm mt-1 opacity-75">2개월 무료</div>
              </button>
            </div>
          </div>

          {/* 플랜 선택 */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4">플랜 선택</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((plan) => {
                const price =
                  billingCycle === 'monthly' ? plan.monthly_price : plan.yearly_price;
                const isCurrentPlan = subscription?.plan === plan.id;
                const isSelected = selectedPlanId === plan.id;

                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`text-left p-6 rounded-lg border-2 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-white/10 bg-bridge-dark hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-lg font-semibold text-foreground">{plan.name}</h4>
                      {isCurrentPlan && (
                        <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs">
                          현재
                        </span>
                      )}
                    </div>

                    <div className="mb-4">
                      <div className="text-2xl font-bold text-foreground">
                        ₩{formatPrice(price)}
                      </div>
                      <div className="text-sm text-slate-400">
                        / {billingCycle === 'monthly' ? '월' : '년'}
                      </div>
                      {billingCycle === 'yearly' && plan.discount_percentage > 0 && (
                        <div className="text-xs text-green-400 mt-1">
                          {plan.discount_percentage}% 할인
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-400" />
                        <span>
                          {plan.min_members}명 ~ {plan.max_members}명
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="border-t border-white/10 p-4 bg-bridge-dark flex gap-2">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
          >
            닫기
          </Button>
          <Button
            onClick={handleSubscribe}
            disabled={!selectedPlanId || isProcessing}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isProcessing
              ? '처리중...'
              : subscription?.status === 'ACTIVE'
              ? '플랜 변경'
              : '구독 시작'}
          </Button>
        </div>
      </div>
    </div>
  );
}
