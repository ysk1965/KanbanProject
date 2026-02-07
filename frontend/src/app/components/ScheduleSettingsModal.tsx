import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, Layers, ChevronDown, Info } from 'lucide-react';
import { Button } from './ui/button';

export type ScheduleDisplayMode = 'time' | 'block';

interface ScheduleSettingsModalProps {
  currentStartTime: string; // "HH:mm" format
  currentWorkHours: number;
  currentDisplayMode: ScheduleDisplayMode;
  onSave: (startTime: string, workHours: number, displayMode: ScheduleDisplayMode) => void;
  onClose: () => void;
}

// 시간 옵션 생성 (00:00 ~ 23:30, 30분 단위)
const generateTimeOptions = () => {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    options.push(`${hour.toString().padStart(2, '0')}:00`);
    options.push(`${hour.toString().padStart(2, '0')}:30`);
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// 블록 개수 옵션 (4개 ~ 24개)
const BLOCK_OPTIONS = Array.from({ length: 21 }, (_, i) => i + 4);

export function ScheduleSettingsModal({
  currentStartTime,
  currentWorkHours,
  currentDisplayMode,
  onSave,
  onClose,
}: ScheduleSettingsModalProps) {
  const { t } = useTranslation();
  // 시간 모드 or 블록 모드
  const [mode, setMode] = useState<ScheduleDisplayMode>(currentDisplayMode);

  // 시간 모드 상태
  const [startTime, setStartTime] = useState(currentStartTime.substring(0, 5));
  const currentEndHour = parseInt(currentStartTime.split(':')[0]) + currentWorkHours;
  const [endTime, setEndTime] = useState(
    `${Math.min(currentEndHour, 23).toString().padStart(2, '0')}:00`
  );

  // 블록 모드 상태
  const [blockCount, setBlockCount] = useState(currentWorkHours * 2); // 30분 = 1블록

  // 드롭다운 상태
  const [isStartTimeOpen, setIsStartTimeOpen] = useState(false);
  const [isEndTimeOpen, setIsEndTimeOpen] = useState(false);
  const [isBlockCountOpen, setIsBlockCountOpen] = useState(false);

  // 계산된 값들
  const calculatedValues = useMemo(() => {
    if (mode === 'time') {
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const totalMinutes = Math.max(endMinutes - startMinutes, 30);
      const hours = totalMinutes / 60;
      const blocks = Math.floor(totalMinutes / 30);
      return { hours, blocks, totalMinutes };
    } else {
      const totalMinutes = blockCount * 30;
      const hours = totalMinutes / 60;
      return { hours, blocks: blockCount, totalMinutes };
    }
  }, [mode, startTime, endTime, blockCount]);

  // 유효성 검사
  const isValid = useMemo(() => {
    if (mode === 'time') {
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return endMinutes > startMinutes;
    }
    return blockCount >= 4;
  }, [mode, startTime, endTime, blockCount]);

  const handleSave = () => {
    if (!isValid) return;

    if (mode === 'time') {
      const workHours = calculatedValues.hours;
      onSave(startTime + ':00', workHours, mode);
    } else {
      // 블록 모드: 블록 개수 * 0.5 = 시간
      const workHours = blockCount * 0.5;
      onSave('00:00:00', workHours, mode);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-bridge-obsidian rounded-xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden border border-white/20">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
          <h2 className="text-lg font-semibold text-foreground">{t('schedule.settingsTitle')}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 모드 선택 */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              {t('schedule.managementMethod')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('time')}
                className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                  mode === 'time'
                    ? 'border-blue-500 bg-blue-500/10 text-foreground'
                    : 'border-white/20 bg-bridge-dark text-slate-400 hover:border-white/20'
                }`}
              >
                <Clock className={`h-5 w-5 ${mode === 'time' ? 'text-blue-400' : ''}`} />
                <div className="text-left">
                  <div className="font-medium">{t('schedule.timeBased')}</div>
                  <div className="text-xs text-slate-400">{t('schedule.timeBasedDesc')}</div>
                </div>
              </button>
              <button
                onClick={() => setMode('block')}
                className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                  mode === 'block'
                    ? 'border-blue-500 bg-blue-500/10 text-foreground'
                    : 'border-white/20 bg-bridge-dark text-slate-400 hover:border-white/20'
                }`}
              >
                <Layers className={`h-5 w-5 ${mode === 'block' ? 'text-blue-400' : ''}`} />
                <div className="text-left">
                  <div className="font-medium">{t('schedule.blockBased')}</div>
                  <div className="text-xs text-slate-400">{t('schedule.blockBasedDesc')}</div>
                </div>
              </button>
            </div>
          </div>

          {mode === 'time' ? (
            /* 시간 모드 설정 */
            <div className="space-y-4">
              {/* 시작 시간 */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('schedule.startTime')}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsStartTimeOpen(!isStartTimeOpen);
                      setIsEndTimeOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-bridge-dark border border-white/20 rounded-lg text-left hover:border-white/20 transition-colors"
                  >
                    <span className="text-foreground font-medium">{startTime}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isStartTimeOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isStartTimeOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bridge-dark border border-white/20 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {TIME_OPTIONS.map((time) => (
                        <button
                          key={time}
                          onClick={() => {
                            setStartTime(time);
                            setIsStartTimeOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-white/5 text-sm ${
                            time === startTime ? 'bg-blue-500/20 text-blue-400' : 'text-slate-300'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 종료 시간 */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('schedule.endTime')}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEndTimeOpen(!isEndTimeOpen);
                      setIsStartTimeOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-bridge-dark border border-white/20 rounded-lg text-left hover:border-white/20 transition-colors"
                  >
                    <span className="text-foreground font-medium">{endTime}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isEndTimeOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isEndTimeOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bridge-dark border border-white/20 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {TIME_OPTIONS.map((time) => (
                        <button
                          key={time}
                          onClick={() => {
                            setEndTime(time);
                            setIsEndTimeOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-white/5 text-sm ${
                            time === endTime ? 'bg-blue-500/20 text-blue-400' : 'text-slate-300'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* 블록 모드 설정 */
            <div className="space-y-4">
              {/* 블록 개수 */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('schedule.blockCount')}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBlockCountOpen(!isBlockCountOpen);
                      setIsStartTimeOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-bridge-dark border border-white/20 rounded-lg text-left hover:border-white/20 transition-colors"
                  >
                    <span className="text-foreground font-medium">{t('schedule.blocksUnit', { count: blockCount })}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isBlockCountOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isBlockCountOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bridge-dark border border-white/20 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {BLOCK_OPTIONS.map((count) => (
                        <button
                          key={count}
                          onClick={() => {
                            setBlockCount(count);
                            setIsBlockCountOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-white/5 text-sm ${
                            count === blockCount ? 'bg-blue-500/20 text-blue-400' : 'text-slate-300'
                          }`}
                        >
                          {t('schedule.blocksWithHours', { count, hours: (count * 30 / 60).toFixed(1) })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 미리보기 정보 */}
          <div className="bg-bridge-dark rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Info className="h-4 w-4" />
              <span>{t('schedule.settingsPreview')}</span>
            </div>
            {mode === 'time' ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">{t('schedule.workingHours')}</span>
                  <span className="text-foreground ml-2">{startTime} ~ {endTime}</span>
                </div>
                <div>
                  <span className="text-slate-400">{t('schedule.totalHours')}</span>
                  <span className="text-foreground ml-2">{t('schedule.hoursUnit', { hours: calculatedValues.hours.toFixed(1) })}</span>
                </div>
                <div>
                  <span className="text-slate-400">{t('schedule.totalBlocks')}</span>
                  <span className="text-foreground ml-2">{t('schedule.blocksUnit', { count: calculatedValues.blocks })}</span>
                </div>
                <div>
                  <span className="text-slate-400">{t('schedule.blockUnitLabel')}</span>
                  <span className="text-foreground ml-2">{t('schedule.blockUnit')}</span>
                </div>
              </div>
            ) : (
              <div className="text-sm">
                <span className="text-slate-400">{t('schedule.totalBlockCount')}</span>
                <span className="text-foreground ml-2 text-lg font-semibold">{t('schedule.blocksUnit', { count: blockCount })}</span>
              </div>
            )}
          </div>

          {/* 유효성 검사 오류 */}
          {!isValid && (
            <div className="text-red-400 text-sm">
              {mode === 'time'
                ? t('schedule.endAfterStart')
                : t('schedule.minBlocksRequired')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/20 flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-white/20 text-slate-300 hover:bg-white/5 hover:text-foreground"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
