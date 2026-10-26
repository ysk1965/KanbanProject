import { useCallback, useEffect, useRef, useState } from 'react';
import { AUDIO_MAX_BYTES } from './sermonMedia';
import { sermonAudioStore } from './sermonAudioStore';
import { localFileId } from './sermonTypes';

/**
 * 설교 녹음 — 타이머와 같은 시계를 쓴다.
 *
 * - 토막(segment) 하나 = MediaRecorder 한 번. 시작할 때의 경과 초를 offset 으로 적어 두므로
 *   생각에 찍힌 t 로 그대로 재생 위치를 찾는다. (타이머와 녹음이 같이 멈추고 같이 간다)
 * - 10초마다 나오는 조각은 바로 IndexedDB 에 쓴다. 메모리에 쌓지 않는다.
 * - 트랙이 끝나거나(전화·다른 앱) 레코더가 죽으면 토막을 닫고 onInterrupted 를 부른다.
 *   화면이 돌아오면 호출자가 start() 로 새 토막을 연다.
 * - 화면이 꺼지면 iOS 는 녹음을 멈추므로, 녹음 중엔 Wake Lock 으로 화면을 켜 둔다.
 */

export type RecorderStatus = 'off' | 'starting' | 'on' | 'paused';

export interface RecorderCallbacks {
  noteId: () => string;
  /** 지금 설교 타이머 경과 초 */
  getElapsed: () => number;
  onSegmentStart: (seg: { id: string; mime: string; offset: number }) => void;
  /** 조각을 받을 때마다 — 길이·크기 갱신 */
  onSegmentProgress: (seg: { id: string; duration: number; size: number }) => void;
  onSegmentEnd: (seg: { id: string; duration: number; size: number }) => void;
  /** 의도치 않게 끊김 (토막은 이미 닫힘) */
  onInterrupted: () => void;
  /** 토막 상한(AUDIO_MAX_BYTES)에 닿아 닫힘 */
  onLimit: () => void;
}

const TIMESLICE_MS = 10_000;
const MUTE_GRACE_MS = 3_000;

export function recordingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function')
    return false;
  return typeof MediaRecorder !== 'undefined';
}

export function pickAudioMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  const cands = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  return cands.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** 'audio/webm;codecs=opus' → 'webm' */
export function audioExt(mime: string): string {
  if (/mp4|aac|m4a/.test(mime)) return 'm4a';
  if (/ogg/.test(mime)) return 'ogg';
  return 'webm';
}

interface LiveSeg {
  id: string;
  mime: string;
  offset: number;
  seq: number;
  bytes: number;
}

export function useSermonRecorder(cb: RecorderCallbacks) {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  const [status, setStatus] = useState<RecorderStatus>('off');
  /** 마이크 권한을 거부했거나 못 열었음 — 이 노트에서는 다시 묻지 않는다 */
  const [denied, setDenied] = useState(false);
  const statusRef = useRef<RecorderStatus>('off');
  const setSt = (s: RecorderStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const segRef = useRef<LiveSeg | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const muteTimer = useRef<number | null>(null);
  const finalizing = useRef<Promise<void> | null>(null);

  // ───────── Wake Lock ─────────
  const holdWake = useCallback(async () => {
    if (wakeRef.current || document.visibilityState !== 'visible') return;
    try {
      wakeRef.current = (await navigator.wakeLock?.request('screen')) ?? null;
      if (wakeRef.current) {
        wakeRef.current.addEventListener('release', () => {
          wakeRef.current = null;
        });
      }
    } catch {
      wakeRef.current = null;
    }
  }, []);
  const dropWake = useCallback(() => {
    const w = wakeRef.current;
    wakeRef.current = null;
    w?.release().catch(() => {});
  }, []);

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.onmute = null;
      t.onunmute = null;
      t.stop();
    });
    streamRef.current = null;
  };

  /** 지금 토막을 닫는다. 레코더·스트림을 정리하고 길이를 확정 */
  const finalize = useCallback((): Promise<void> => {
    if (finalizing.current) return finalizing.current;
    const rec = recRef.current;
    const seg = segRef.current;
    if (!rec && !seg) return Promise.resolve();
    const p = new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        if (muteTimer.current) {
          window.clearTimeout(muteTimer.current);
          muteTimer.current = null;
        }
        releaseStream();
        recRef.current = null;
        segRef.current = null;
        dropWake();
        setSt('off');
        if (seg) {
          const elapsed = cbRef.current.getElapsed();
          const duration = Math.max(0, elapsed - seg.offset);
          void sermonAudioStore.getSegment(seg.id).then((m) => {
            if (m)
              return sermonAudioStore.putSegment({
                ...m,
                done: true,
                bytes: seg.bytes,
                elapsedAt: elapsed,
              });
          });
          cbRef.current.onSegmentEnd({ id: seg.id, duration, size: seg.bytes });
        }
        finalizing.current = null;
        resolve();
      };
      if (!rec || rec.state === 'inactive') {
        done();
        return;
      }
      rec.onstop = done;
      // stop() 이 마지막 ondataavailable 을 먼저 내보낸다
      try {
        rec.stop();
      } catch {
        done();
      }
      // onstop 이 안 오는 브라우저 방어
      window.setTimeout(done, 1500);
    });
    finalizing.current = p;
    return p;
  }, [dropWake]);

  const interrupted = useCallback(() => {
    if (statusRef.current === 'off') return;
    void finalize().then(() => cbRef.current.onInterrupted());
  }, [finalize]);

  /** 새 토막을 연다. 권한이 없거나 지원하지 않으면 false */
  const start = useCallback(async (): Promise<boolean> => {
    if (!recordingSupported() || denied) return false;
    if (recRef.current) return true;
    setSt('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      console.warn('sermon: microphone unavailable', e);
      setDenied(true);
      setSt('off');
      return false;
    }
    const mime = pickAudioMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 48_000,
      });
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch (e) {
        console.warn('sermon: MediaRecorder failed', e);
        stream.getTracks().forEach((t) => t.stop());
        setDenied(true);
        setSt('off');
        return false;
      }
    }
    const offset = cbRef.current.getElapsed();
    const seg: LiveSeg = {
      id: localFileId('a'),
      mime: rec.mimeType || mime || 'audio/webm',
      offset,
      seq: 0,
      bytes: 0,
    };
    segRef.current = seg;
    recRef.current = rec;
    streamRef.current = stream;

    await sermonAudioStore.putSegment({
      seg: seg.id,
      note: cbRef.current.noteId(),
      mime: seg.mime,
      offset,
      startedAt: Date.now(),
      elapsedAt: offset,
      bytes: 0,
      done: false,
    });

    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size || segRef.current !== seg) return;
      const n = seg.seq++;
      seg.bytes += e.data.size;
      const elapsed = cbRef.current.getElapsed();
      void sermonAudioStore
        .putChunk(seg.id, n, e.data)
        .then(() => sermonAudioStore.getSegment(seg.id))
        .then((m) => {
          if (m && !m.done)
            return sermonAudioStore.putSegment({ ...m, bytes: seg.bytes, elapsedAt: elapsed });
        })
        .catch((err) => console.warn('sermon: chunk save failed', err));
      cbRef.current.onSegmentProgress({
        id: seg.id,
        duration: Math.max(0, elapsed - seg.offset),
        size: seg.bytes,
      });
      if (seg.bytes >= AUDIO_MAX_BYTES) {
        void finalize().then(() => cbRef.current.onLimit());
      }
    };
    rec.onerror = () => interrupted();
    stream.getAudioTracks().forEach((t) => {
      t.onended = () => interrupted();
      t.onmute = () => {
        if (muteTimer.current) window.clearTimeout(muteTimer.current);
        muteTimer.current = window.setTimeout(() => {
          muteTimer.current = null;
          if (t.muted && statusRef.current === 'on') interrupted();
        }, MUTE_GRACE_MS);
      };
      t.onunmute = () => {
        if (muteTimer.current) {
          window.clearTimeout(muteTimer.current);
          muteTimer.current = null;
        }
      };
    });

    try {
      rec.start(TIMESLICE_MS);
    } catch (e) {
      console.warn('sermon: recorder start failed', e);
      releaseStream();
      recRef.current = null;
      segRef.current = null;
      void sermonAudioStore.removeSegment(seg.id);
      setDenied(true);
      setSt('off');
      return false;
    }
    setSt('on');
    void holdWake();
    cbRef.current.onSegmentStart({ id: seg.id, mime: seg.mime, offset });
    return true;
  }, [denied, finalize, holdWake, interrupted]);

  const pause = useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== 'recording') return;
    try {
      rec.pause();
      setSt('paused');
    } catch {
      /* pause 미지원 → 그대로 둔다 (길이는 타이머 기준이라 어긋나지만 녹음은 남는다) */
    }
    dropWake();
  }, [dropWake]);

  /** 멈춘 토막을 잇는다. 레코더가 없으면(끊김) 새 토막 */
  const resume = useCallback(async (): Promise<boolean> => {
    const rec = recRef.current;
    if (rec && rec.state === 'paused') {
      try {
        rec.resume();
        setSt('on');
        void holdWake();
        return true;
      } catch {
        await finalize();
      }
    } else if (rec && rec.state === 'recording') {
      return true;
    }
    return start();
  }, [finalize, holdWake, start]);

  const stop = finalize;

  // 화면이 돌아왔을 때: 녹음 중이면 Wake Lock 다시, 레코더가 죽어 있으면 끊김 처리
  useEffect(() => {
    const fn = () => {
      if (document.visibilityState !== 'visible') return;
      if (statusRef.current === 'on') {
        const rec = recRef.current;
        if (!rec || rec.state === 'inactive') interrupted();
        else void holdWake();
      }
    };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, [holdWake, interrupted]);

  // 언마운트: 토막을 닫는다 (콜백은 ref 라 닫힌 뒤에도 노트에 반영된다)
  useEffect(() => {
    return () => {
      void finalize();
    };
  }, [finalize]);

  return {
    supported: recordingSupported(),
    status,
    denied,
    /** 지금 살아 있는 토막 id */
    currentSegmentId: () => segRef.current?.id ?? null,
    start,
    pause,
    resume,
    stop,
  };
}
