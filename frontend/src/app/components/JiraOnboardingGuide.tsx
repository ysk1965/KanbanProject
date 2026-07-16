import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Check, Settings2 } from "lucide-react";
import { jiraAPI, JiraStatus } from "../utils/api";

interface JiraOnboardingGuideProps {
  boardId: string;
  status: JiraStatus | null;
  /** 설정 패널(연결/프로젝트 선택)로 이동 */
  onOpenSettings: () => void;
  /** 미러 셋업 완료 후 보드 새로고침 */
  onReady: () => void;
}

/**
 * JIRA 뷰 탭에 미설정 상태로 진입했을 때 보이는 온보딩 가이드.
 * 3단계(계정 연결 → 프로젝트 선택 → 동기화 켜기)를 가로 스텝퍼로 안내하고,
 * 진행 상태에 따라 CTA를 바꾼다. 마지막 단계는 미러 셋업을 직접 실행.
 */
export function JiraOnboardingGuide({
  boardId,
  status,
  onOpenSettings,
  onReady,
}: JiraOnboardingGuideProps) {
  const { t } = useTranslation();
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = !!status?.connected;
  const hasProject = !!status?.project_key;
  const mirrorReady = !!status?.mirror_ready;

  // 현재 단계: 첫 미완료 단계 (1|2|3)
  const currentStep = !connected ? 1 : !hasProject ? 2 : 3;

  const steps = [
    {
      n: 1,
      title: t("jiraIntegration.guideStep1", "JIRA 계정 연결"),
      desc: t("jiraIntegration.guideStep1Desc", "Atlassian 로그인"),
      done: connected,
    },
    {
      n: 2,
      title: t("jiraIntegration.guideStep2", "프로젝트 선택"),
      desc: hasProject
        ? status?.project_key || ""
        : t("jiraIntegration.guideStep2Desc", "동기화할 프로젝트"),
      done: hasProject,
    },
    {
      n: 3,
      title: t("jiraIntegration.guideStep3", "동기화 켜기"),
      desc: t("jiraIntegration.guideStep3Desc", "컬럼 자동 세팅"),
      done: mirrorReady,
    },
  ];

  const handleMirrorSetup = async () => {
    setIsSettingUp(true);
    setError(null);
    try {
      await jiraAPI.setupMirror(boardId);
      onReady();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("jiraIntegration.saveFailed", "저장에 실패했습니다"),
      );
    } finally {
      setIsSettingUp(false);
    }
  };

  const ctaLabel =
    currentStep === 1
      ? t("jiraIntegration.guideCtaConnect", "JIRA 계정 연결")
      : currentStep === 2
        ? t("jiraIntegration.guideCtaProject", "프로젝트 선택")
        : t("jiraIntegration.guideCtaEnable", "동기화 켜기");

  const onCta = currentStep === 3 ? handleMirrorSetup : onOpenSettings;

  const title =
    currentStep === 3
      ? t("jiraIntegration.guideTitleAlmost", "거의 다 됐어요 — 마지막 한 단계")
      : t("jiraIntegration.guideTitleStart", "JIRA와 이 보드를 연결해 보세요");

  const lede =
    currentStep === 3
      ? t(
          "jiraIntegration.guideLedeAlmost",
          "동기화를 켜면 이 탭이 JIRA 상태를 그대로 미러링합니다. 카드를 옮기면 JIRA도 같이, JIRA에서 바뀌면 여기도 같이.",
        )
      : t(
          "jiraIntegration.guideLedeStart",
          "연결이 끝나면 이 탭이 JIRA 상태를 그대로 미러링합니다. 컬럼이 자동으로 맞춰져요.",
        );

  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 h-full">
      {/* BRIDGE ↔ JIRA 연결 아이콘 */}
      <div className="flex items-center mb-5">
        <div className="w-11 h-11 rounded-xl grid place-items-center font-bold text-white bg-gradient-to-br from-bridge-accent to-indigo-600 z-10">
          B
        </div>
        <div className="w-8 h-0.5 mx-[-4px] bg-[repeating-linear-gradient(90deg,var(--bridge-secondary,#2DD4BF)_0_5px,transparent_5px_10px)]" />
        <div className="w-11 h-11 rounded-xl grid place-items-center font-bold text-white bg-gradient-to-br from-[#2684FF] to-[#0052CC] -ml-2">
          Ji
        </div>
      </div>

      <h3 className="text-base md:text-lg font-bold text-foreground mb-2 text-balance">
        {title}
      </h3>
      <p className="text-xs md:text-sm text-slate-500 max-w-md mb-7 leading-relaxed">
        {lede}
      </p>

      {/* 가로 스텝퍼 */}
      <div className="flex w-full max-w-md mb-6">
        {steps.map((s) => {
          const isDone = s.done;
          const isCurrent = !isDone && s.n === currentStep;
          return (
            <div
              key={s.n}
              className="relative flex-1 flex flex-col items-center px-1"
            >
              {/* 연결선 */}
              {s.n > 1 && (
                <span
                  className={`absolute top-4 right-1/2 w-full h-0.5 ${
                    isDone || isCurrent
                      ? "bg-bridge-secondary"
                      : "bg-foreground/15"
                  }`}
                />
              )}
              <div
                className={`relative z-10 w-8 h-8 rounded-full grid place-items-center text-xs font-bold transition-colors ${
                  isDone
                    ? "bg-bridge-secondary text-white"
                    : isCurrent
                      ? "bg-bridge-obsidian text-bridge-accent ring-4 ring-bridge-accent/20 border-2 border-bridge-accent"
                      : "bg-foreground/[0.06] text-slate-400 border-2 border-foreground/15"
                }`}
              >
                {isDone ? <Check size={14} /> : s.n}
              </div>
              <div
                className={`text-xs font-bold mt-2 leading-tight ${
                  isCurrent
                    ? "text-bridge-accent"
                    : isDone
                      ? "text-foreground"
                      : "text-slate-400"
                }`}
              >
                {s.title}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 leading-tight">
                {s.desc}
              </div>
            </div>
          );
        })}
      </div>

      {error && <div className="text-xs text-rose-400 mb-3">{error}</div>}

      <button
        onClick={onCta}
        disabled={isSettingUp}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all disabled:opacity-50 shadow-[0_8px_20px_-8px_rgba(99,102,241,0.7)]"
      >
        {isSettingUp ? (
          <Loader2 size={16} className="animate-spin" />
        ) : currentStep < 3 ? (
          <Settings2 size={16} />
        ) : null}
        {ctaLabel}
      </button>

      <div className="text-xs text-slate-500 mt-3.5">
        {t(
          "jiraIntegration.guideLater",
          "나중에 설정 › JIRA에서 언제든 바꿀 수 있어요.",
        )}
      </div>
    </div>
  );
}
