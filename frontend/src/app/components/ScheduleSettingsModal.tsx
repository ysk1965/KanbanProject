import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, Layers, ChevronDown, Info, Coffee } from 'lucide-react';
import { Button } from './ui/button';
import { MotionModal } from './ui/MotionModal';

export type ScheduleDisplayMode = 'time' | 'block';

interface ScheduleSettingsModalProps {
  currentStartTime: string; // "HH:mm" format
  currentWorkHours: number;
  currentDisplayMode: ScheduleDisplayMode;
  currentBreakStartTime?: string | null;
  currentBreakEndTime?: string | null;
  onSave: (
    startTime: string,
    workHours: number,
    displayMode: ScheduleDisplayMode,
    breakStartTime?: string | null,
    breakEndTime?: string | null
  ) => void;
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
  currentBreakStartTime,
  currentBreakEndTime,
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

  // 점심시간 상태
  const [breakEnabled, setBreakEnabled] = useState(!!currentBreakStartTime && !!currentBreakEndTime);
  const [breakStartTime, setBreakStartTime] = useState(currentBreakStartTime?.substring(0, 5) || '12:00');
  const [breakEndTime, setBreakEndTime] = useState(currentBreakEndTime?.substring(0, 5) || '13:00');

  // 블록 모드 상태
  const [blockCount, setBlockCount] = useState(currentWorkHours * 2); // 30분 = 1블록

  // 드롭다운 상태
  const [isStartTimeOpen, setIsStartTimeOpen] = useState(false);
  const [isEndTimeOpen, setIsEndTimeOpen] = useState(false);
  const [isBlockCountOpen, setIsBlockCountOpen] = useState(false);
  const [isBreakStartOpen, setIsBreakStartOpen] = useState(false);
  const [isBreakEndOpen, setIsBreakEndOpen] = useState(false);

  // 드롭다운 리스트 refs
  const startTimeListRef = useRef<HTMLDivElement>(null);
  const endTimeListRef = useRef<HTMLDivElement>(null);
  const blockCountListRef = useRef<HTMLDivElement>(null);
  const breakStartListRef = useRef<HTMLDivElement>(null);
  const breakEndListRef = useRef<HTMLDivElement>(null);

  // 모든 드롭다운 닫기
  const closeAllDropdowns = useCallback(() => {
    setIsStartTimeOpen(false);
    setIsEndTimeOpen(false);
    setIsBlockCountOpen(false);
    setIsBreakStartOpen(false);
    setIsBreakEndOpen(false);
  }, []);

  // 드롭다운 열릴 때 선택된 항목으로 스크롤
  const scrollToSelected = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    const selectedEl = container.querySelector('[data-selected="true"]') as HTMLElement;
    if (selectedEl) {
      const containerHeight = container.clientHeight;
      container.scrollTop = selectedEl.offsetTop - containerHeight / 2 + selectedEl.offsetHeight / 2;
    }
  }, []);

  useEffect(() => {
    if (isStartTimeOpen) scrollToSelected(startTimeListRef.current);
  }, [isStartTimeOpen, scrollToSelected]);

  useEffect(() => {
    if (isEndTimeOpen) scrollToSelected(endTimeListRef.current);
  }, [isEndTimeOpen, scrollToSelected]);

  useEffect(() => {
    if (isBlockCountOpen) scrollToSelected(blockCountListRef.current);
  }, [isBlockCountOpen, scrollToSelected]);

  useEffect(() => {
    if (isBreakStartOpen) scrollToSelected(breakStartListRef.current);
  }, [isBreakStartOpen, scrollToSelected]);

  useEffect(() => {
    if (isBreakEndOpen) scrollToSelected(breakEndListRef.current);
  }, [isBreakEndOpen, scrollToSelected]);

  // 점심시간 분 계산
  const breakMinutes = useMemo(() => {
    if (!breakEnabled || mode !== 'time') return 0;
    const [bsH, bsM] = breakStartTime.split(':').map(Number);
    const [beH, beM] = breakEndTime.split(':').map(Number);
    const bsMin = bsH * 60 + bsM;
    const beMin = beH * 60 + beM;
    return Math.max(beMin - bsMin, 0);
  }, [breakEnabled, breakStartTime, breakEndTime, mode]);

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
      const effectiveMinutes = totalMinutes - breakMinutes;
      const effectiveHours = effectiveMinutes / 60;
      const effectiveBlocks = Math.floor(effectiveMinutes / 30);
      return { hours, blocks, totalMinutes, effectiveHours, effectiveBlocks };
    } else {
      const totalMinutes = blockCount * 30;
      const hours = totalMinutes / 60;
      return { hours, blocks: blockCount, totalMinutes, effectiveHours: hours, effectiveBlocks: blockCount };
    }
  }, [mode, startTime, endTime, blockCount, breakMinutes]);

  // 유효성 검사
  const isValid = useMemo(() => {
    if (mode === 'time') {
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      if (endMinutes <= startMinutes) return false;

      // 점심시간 유효성
      if (breakEnabled) {
        const [bsH, bsM] = breakStartTime.split(':').map(Number);
        const [beH, beM] = breakEndTime.split(':').map(Number);
        const bsMin = bsH * 60 + bsM;
        const beMin = beH * 60 + beM;
        if (beMin <= bsMin) return false;
        if (bsMin < startMinutes || beMin > endMinutes) return false;
      }

      return true;
    }
    return blockCount >= 4;
  }, [mode, startTime, endTime, blockCount, breakEnabled, breakStartTime, breakEndTime]);

  const handleSave = () => {
    if (!isValid) return;

    if (mode === 'time') {
      const workHours = calculatedValues.hours;
      onSave(
        startTime + ':00',
        workHours,
        mode,
        breakEnabled ? breakStartTime + ':00' : null,
        breakEnabled ? breakEndTime + ':00' : null
      );
    } else {
      // 블록 모드: 블록 개수 * 0.5 = 시간
      const workHours = blockCount * 0.5;
      onSave('00:00:00', workHours, mode, null, null);
    }
  };

  return (
    <MotionModal open={true} onClose={onClose} className="sm:max-w-[480px] p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10">
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
            <label className="block text-sm font-medium text-muted-foreground mb-3">
              {t('schedule.managementMethod')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('time')}
                className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                  mode === 'time'
                    ? 'border-bridge-accent bg-bridge-accent/10 text-foreground'
                    : 'border-foreground/10 bg-bridge-dark text-slate-400 hover:border-foreground/10'
                }`}
              >
                <Clock className={`h-5 w-5 ${mode === 'time' ? 'text-bridge-accent' : ''}`} />
                <div className="text-left">
                  <div className="font-medium">{t('schedule.timeBased')}</div>
                  <div className="text-xs text-slate-400">{t('schedule.timeBasedDesc')}</div>
                </div>
              </button>
              <button
                onClick={() => setMode('block')}
                className={`flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                  mode === 'block'
                    ? 'border-bridge-accent bg-bridge-accent/10 text-foreground'
                    : 'border-foreground/10 bg-bridge-dark text-slate-400 hover:border-foreground/10'
                }`}
              >
                <Layers className={`h-5 w-5 ${mode === 'block' ? 'text-bridge-accent' : ''}`} />
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
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  {t('schedule.startTime')}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      closeAllDropdowns();
                      setIsStartTimeOpen(!isStartTimeOpen);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-bridge-dark border border-foreground/10 rounded-lg text-left hover:border-foreground/10 transition-colors"
                  >
                    <span className="text-foreground font-medium">{startTime}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isStartTimeOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isStartTimeOpen && (
                    <div ref={startTimeListRef} className="absolute top-full left-0 right-0 mt-1 bg-bridge-dark border border-foreground/10 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {TIME_OPTIONS.map((time) => (
                        <button
                          key={time}
                          data-selected={time === startTime}
                          onClick={() => {
                            setStartTime(time);
                            setIsStartTimeOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-foreground/5 text-sm ${
                            time === startTime ? 'bg-bridge-accent/20 text-bridge-accent' : 'text-muted-foreground'
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
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  {t('schedule.endTime')}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      closeAllDropdowns();
                      setIsEndTimeOpen(!isEndTimeOpen);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-bridge-dark border border-foreground/10 rounded-lg text-left hover:border-foreground/10 transition-colors"
                  >
                    <span className="text-foreground font-medium">{endTime}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isEndTimeOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isEndTimeOpen && (
                    <div ref={endTimeListRef} className="absolute top-full left-0 right-0 mt-1 bg-bridge-dark border border-foreground/10 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {TIME_OPTIONS.map((time) => (
                        <button
                          key={time}
                          data-selected={time === endTime}
                          onClick={() => {
                            setEndTime(time);
                            setIsEndTimeOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-foreground/5 text-sm ${
                            time === endTime ? 'bg-bridge-accent/20 text-bridge-accent' : 'text-muted-foreground'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 점심시간 */}
              <div className="border border-foreground/10 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium text-muted-foreground">{t('schedule.breakTime')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBreakEnabled(!breakEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      breakEnabled ? 'bg-bridge-accent' : 'bg-white/20'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        breakEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {breakEnabled && (
                  <>
                    <p className="text-xs text-slate-500">{t('schedule.breakTimeDesc')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {/* 점심 시작 */}
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">{t('schedule.breakStart')}</label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              closeAllDropdowns();
                              setIsBreakStartOpen(!isBreakStartOpen);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 bg-bridge-dark border border-foreground/10 rounded-lg text-left text-sm"
                          >
                            <span className="text-foreground font-medium">{breakStartTime}</span>
                            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isBreakStartOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isBreakStartOpen && (
                            <div ref={breakStartListRef} className="absolute top-full left-0 right-0 mt-1 bg-bridge-dark border border-foreground/10 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
                              {TIME_OPTIONS.map((time) => (
                                <button
                                  key={time}
                                  data-selected={time === breakStartTime}
                                  onClick={() => {
                                    setBreakStartTime(time);
                                    setIsBreakStartOpen(false);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left hover:bg-foreground/5 text-xs ${
                                    time === breakStartTime ? 'bg-bridge-accent/20 text-bridge-accent' : 'text-muted-foreground'
                                  }`}
                                >
                                  {time}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 점심 종료 */}
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">{t('schedule.breakEnd')}</label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              closeAllDropdowns();
                              setIsBreakEndOpen(!isBreakEndOpen);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 bg-bridge-dark border border-foreground/10 rounded-lg text-left text-sm"
                          >
                            <span className="text-foreground font-medium">{breakEndTime}</span>
                            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isBreakEndOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isBreakEndOpen && (
                            <div ref={breakEndListRef} className="absolute top-full left-0 right-0 mt-1 bg-bridge-dark border border-foreground/10 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
                              {TIME_OPTIONS.map((time) => (
                                <button
                                  key={time}
                                  data-selected={time === breakEndTime}
                                  onClick={() => {
                                    setBreakEndTime(time);
                                    setIsBreakEndOpen(false);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left hover:bg-foreground/5 text-xs ${
                                    time === breakEndTime ? 'bg-bridge-accent/20 text-bridge-accent' : 'text-muted-foreground'
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
                  </>
                )}
              </div>
            </div>
          ) : (
            /* 블록 모드 설정 */
            <div className="space-y-4">
              {/* 블록 개수 */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  {t('schedule.blockCount')}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBlockCountOpen(!isBlockCountOpen);
                      setIsStartTimeOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-bridge-dark border border-foreground/10 rounded-lg text-left hover:border-foreground/10 transition-colors"
                  >
                    <span className="text-foreground font-medium">{t('schedule.blocksUnit', { count: blockCount })}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isBlockCountOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isBlockCountOpen && (
                    <div ref={blockCountListRef} className="absolute top-full left-0 right-0 mt-1 bg-bridge-dark border border-foreground/10 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {BLOCK_OPTIONS.map((count) => (
                        <button
                          key={count}
                          data-selected={count === blockCount}
                          onClick={() => {
                            setBlockCount(count);
                            setIsBlockCountOpen(false);
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-foreground/5 text-sm ${
                            count === blockCount ? 'bg-bridge-accent/20 text-bridge-accent' : 'text-muted-foreground'
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
                  <span className="text-foreground ml-2">
                    {breakEnabled && breakMinutes > 0 ? (
                      <>
                        {t('schedule.hoursUnit', { hours: calculatedValues.effectiveHours.toFixed(1) })}
                        <span className="text-amber-400/80 text-xs ml-1">
                          {t('schedule.excludingBreak', { hours: (breakMinutes / 60).toFixed(1) })}
                        </span>
                      </>
                    ) : (
                      t('schedule.hoursUnit', { hours: calculatedValues.hours.toFixed(1) })
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t('schedule.totalBlocks')}</span>
                  <span className="text-foreground ml-2">
                    {t('schedule.blocksUnit', { count: breakEnabled ? calculatedValues.effectiveBlocks : calculatedValues.blocks })}
                  </span>
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
        <div className="px-6 py-4 border-t border-foreground/10 flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-foreground/10 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid}
            className="flex-1 bg-bridge-accent hover:bg-bridge-accent/90 text-white disabled:opacity-50"
          >
            {t('common.save')}
          </Button>
        </div>
    </MotionModal>
  );
}
