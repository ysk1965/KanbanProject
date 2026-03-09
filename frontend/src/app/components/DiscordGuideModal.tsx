import { ExternalLink, Copy, CheckCircle2, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionModal } from './ui/MotionModal';

interface DiscordGuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS_CONFIG = [
  {
    titleKey: 'discordGuide.step1Title',
    descKey: 'discordGuide.step1Desc',
    link: {
      url: 'https://discord.com/channels/@me',
      label: 'discord.com',
    },
  },
  {
    titleKey: 'discordGuide.step2Title',
    descKey: 'discordGuide.step2Desc',
  },
  {
    titleKey: 'discordGuide.step3Title',
    descKey: 'discordGuide.step3Desc',
    detailKey: 'discordGuide.step3Detail',
  },
  {
    titleKey: 'discordGuide.step4Title',
    descKey: 'discordGuide.step4Desc',
    detailKey: 'discordGuide.step4Detail',
  },
  {
    titleKey: 'discordGuide.step5Title',
    descKey: 'discordGuide.step5Desc',
    detailKey: 'discordGuide.step5Detail',
    copyExample: 'https://discord.com/api/webhooks/000000000000000000/xxxxxxxxxxxx',
  },
];

export function DiscordGuideModal({ open, onOpenChange }: DiscordGuideModalProps) {
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
    <MotionModal open={open} onClose={() => onOpenChange(false)} className="sm:max-w-[520px] p-0 overflow-hidden max-h-[80dvh]">
        <div className="overflow-y-auto max-h-[80dvh] p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-bridge-accent/15 flex items-center justify-center flex-shrink-0">
                {/* Discord logo mark */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-bridge-accent">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.053a19.905 19.905 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/>
                </svg>
              </div>
              {t('discordGuide.title')}
            </h2>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
              {t('discordGuide.description')}
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
                          title={t('discordGuide.copyTitle')}
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
              {t('discordGuide.tipTitle')}
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {t('discordGuide.tipContent')}
            </p>
          </div>
        </div>
    </MotionModal>
  );
}
