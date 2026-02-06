import { Flag, Target, BarChart3, Calendar, ArrowRight, X } from 'lucide-react';

interface MilestoneOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateMilestone: () => void;
}

export function MilestoneOnboardingModal({
  isOpen,
  onClose,
  onCreateMilestone,
}: MilestoneOnboardingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-kanban-bg rounded-2xl w-full max-w-xl overflow-hidden border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        {/* 헤더 */}
        <div className="relative px-6 pt-6 pb-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Flag size={16} className="text-indigo-400" />
            </div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">마일스톤으로 프로젝트를 관리하세요</h2>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed pl-[42px]">
            Feature를 마일스톤으로 묶어 일정과 진행률을 한눈에 파악할 수 있어요.
          </p>
        </div>

        {/* 시각적 샘플 예시 */}
        <div className="mx-6 mb-5 rounded-xl border border-dashed border-white/10 overflow-hidden">
          <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">미리보기</span>
          </div>
          <div className="p-4 space-y-3 opacity-60 pointer-events-none select-none">
            {/* 샘플 마일스톤 카드 */}
            <div className="bg-white/[0.03] rounded-lg border border-white/10 p-3">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Flag size={12} className="text-indigo-400" />
                  <span className="text-xs font-bold text-zinc-300">v1.0 출시</span>
                </div>
                <span className="text-[10px] text-zinc-500">2/1 ~ 2/28</span>
              </div>
              {/* 진행률 바 */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-zinc-500">진행률</span>
                  <span className="text-[10px] font-bold text-indigo-400">65%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: '65%' }} />
                </div>
              </div>
              {/* 연결된 Feature 목록 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-400" />
                  <span className="text-[11px] text-zinc-400">로그인 기능 구현</span>
                  <span className="ml-auto text-[9px] font-bold text-emerald-400">완료</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-[11px] text-zinc-400">대시보드 UI 개발</span>
                  <span className="ml-auto text-[9px] font-bold text-indigo-400">진행중</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-teal-400" />
                  <span className="text-[11px] text-zinc-400">API 연동</span>
                  <span className="ml-auto text-[9px] font-bold text-zinc-500">대기</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 효과 설명 */}
        <div className="mx-6 mb-5 space-y-2.5">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Target size={12} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-300">Feature를 묶어 목표 관리</p>
              <p className="text-[11px] text-zinc-500">관련 Feature를 하나의 마일스톤으로 그룹화하여 목표별로 관리해요.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Calendar size={12} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-300">일정 기반 진행률 추적</p>
              <p className="text-[11px] text-zinc-500">시작일과 종료일을 설정하고, Task 완료에 따라 진행률이 자동 계산돼요.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <BarChart3 size={12} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-300">번다운 차트 & 병목 분석</p>
              <p className="text-[11px] text-zinc-500">매니지먼트 탭에서 번다운 차트와 팀원별 할당 현황을 확인할 수 있어요.</p>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            나중에
          </button>
          <button
            onClick={() => {
              onClose();
              onCreateMilestone();
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500 transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]"
          >
            첫 마일스톤 만들기
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
