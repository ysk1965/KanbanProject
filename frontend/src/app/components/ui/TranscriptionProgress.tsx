import { useTranslation } from 'react-i18next';

interface TranscriptionProgressProps {
  stage: string;
  percent: number;
  current?: number;
  total?: number;
  size?: number;
  strokeWidth?: number;
}

export function TranscriptionProgress({
  stage,
  percent,
  current,
  total,
  size = 48,
  strokeWidth = 3,
}: TranscriptionProgressProps) {
  const { t } = useTranslation();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(percent, 100) / 100);

  const stageLabels: Record<string, string> = {
    UPLOADING: t('meeting.progressUploading', '업로드 중...'),
    TRANSCRIBING: t('meeting.progressTranscribing', '음성 변환 중...'),
    DIARIZING: t('meeting.progressDiarizing', '화자 구분 중...'),
    COMPLETE: t('meeting.progressComplete', '완료'),
    ERROR: t('meeting.progressError', '오류'),
  };

  const stageLabel = stageLabels[stage] || stage;
  const showChunks = stage === 'TRANSCRIBING' && total != null && total > 1;

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-foreground/5"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="text-bridge-accent transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-foreground">
            {Math.round(percent)}%
          </span>
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-slate-400 leading-tight">
          {stageLabel}
        </span>
        {showChunks && (
          <span className="text-xs text-slate-500">
            ({current}/{total})
          </span>
        )}
      </div>
    </div>
  );
}
