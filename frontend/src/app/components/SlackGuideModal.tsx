import { ExternalLink, Copy, CheckCircle2, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionModal } from './ui/MotionModal';

interface SlackGuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS_CONFIG = [
  {
    titleKey: 'slackGuide.step1Title',
    descKey: 'slackGuide.step1Desc',
    link: {
      url: 'https://api.slack.com/apps',
      label: 'api.slack.com/apps',
    },
  },
  {
    titleKey: 'slackGuide.step2Title',
    descKey: 'slackGuide.step2Desc',
    image: '/images/slack-guide/step2-create-an-app.png',
  },
  {
    titleKey: 'slackGuide.stepAppNameTitle',
    descKey: 'slackGuide.stepAppNameDesc',
    detailKey: 'slackGuide.stepAppNameDetail',
    image: '/images/slack-guide/step3-set-wrokspace.png',
  },
  {
    titleKey: 'slackGuide.step3Title',
    descKey: 'slackGuide.step3Desc',
    detailKey: 'slackGuide.step3Detail',
    image: '/images/slack-guide/step4-set-webhook.png',
  },
  {
    titleKey: 'slackGuide.step4Title',
    descKey: 'slackGuide.step4Desc',
    detailKey: 'slackGuide.step4Detail',
    image: '/images/slack-guide/step5-add-new-webhook.png',
  },
  {
    titleKey: 'slackGuide.step5Title',
    descKey: 'slackGuide.step5Desc',
    detailKey: 'slackGuide.step5Detail',
    copyExample: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX',
    image: '/images/slack-guide/step6-copy-webhook-url.png',
  },
  {
    titleKey: 'slackGuide.step6Title',
    descKey: 'slackGuide.step6Desc',
    detailKey: 'slackGuide.step6Detail',
  },
];

export function SlackGuideModal({ open, onOpenChange }: SlackGuideModalProps) {
  const { t } = useTranslation();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // clipboard API not available
    }
  };

  return (
    <MotionModal open={open} onClose={() => onOpenChange(false)} className="sm:max-w-[520px] p-0 overflow-hidden max-h-[80vh]">
        <div className="overflow-y-auto max-h-[80vh] p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-bridge-accent/15 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-bridge-accent">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="currentColor"/>
                </svg>
              </div>
              {t('slackGuide.title')}
            </h2>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
              {t('slackGuide.description')}
            </p>
          </div>

          <div className="space-y-1">
            {STEPS_CONFIG.map((step, index) => (
              <div key={index} className="group">
                <div className="flex gap-3 py-3">
                  {/* Step number */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-bridge-accent/15 text-bridge-accent text-[11px] font-bold flex items-center justify-center">
                      {index + 1}
                    </div>
                    {index < STEPS_CONFIG.length - 1 && (
                      <div className="w-px flex-1 bg-white/5 mt-1.5" />
                    )}
                  </div>

                  {/* Step content */}
                  <div className="flex-1 min-w-0 pb-2">
                    <h4 className="text-[12px] font-medium text-foreground mb-1">
                      {t(step.titleKey)}
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {t(step.descKey)}
                    </p>
                    {step.detailKey && (
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                        {t(step.detailKey)}
                      </p>
                    )}

                    {/* Guide image */}
                    {step.image && (
                      <div className="mt-2.5 rounded-lg overflow-hidden border border-foreground/10">
                        <img
                          src={step.image}
                          alt={t(step.titleKey)}
                          className="w-full h-auto"
                          loading="lazy"
                        />
                      </div>
                    )}

                    {/* Link button */}
                    {step.link && (
                      <a
                        href={step.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1.5 text-[11px] text-bridge-accent bg-bridge-accent/10 hover:bg-bridge-accent/20 rounded-md transition-colors"
                      >
                        <ExternalLink size={11} />
                        {step.link.label}
                        <ArrowRight size={10} />
                      </a>
                    )}

                    {/* Copy example */}
                    {step.copyExample && (
                      <div className="mt-2 flex items-center gap-1.5 p-2 bg-white/[0.03] rounded-lg border border-foreground/5">
                        <code className="text-[10px] text-slate-400 flex-1 truncate font-mono">
                          {step.copyExample}
                        </code>
                        <button
                          onClick={() => handleCopy(step.copyExample!, index)}
                          className="flex-shrink-0 p-1 text-slate-500 hover:text-foreground transition-colors"
                          title={t('slackGuide.copyTitle')}
                        >
                          {copiedIndex === index
                            ? <CheckCircle2 size={12} className="text-green-400" />
                            : <Copy size={12} />
                          }
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tip section */}
          <div className="mt-4 p-3 bg-bridge-accent/5 rounded-xl border border-bridge-accent/10">
            <p className="text-[11px] text-muted-foreground font-medium mb-1">
              {t('slackGuide.tipTitle')}
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {t('slackGuide.tipContent')}
            </p>
          </div>
        </div>
    </MotionModal>
  );
}
