import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { sermonAudioStore } from './sermonAudioStore';
import { audioLocate, fmtTime, isLocalId, type SermonAudioSegment } from './sermonTypes';

/**
 * 설교 녹음 재생 바 — 상단 바 아래 한 줄.
 * 위치는 설교 타이머 경과 초(전체 축)로 다루고, 토막(segment)은 안에서 알아서 바꾼다.
 * 아직 안 올린 토막은 IndexedDB 조각을 합쳐 Blob URL 로 튼다.
 */

export interface SermonPlayerHandle {
  /** 경과 초 t 로 이동. play 면 바로 재생 */
  seek: (t: number, play?: boolean) => void;
  /** 재생 중이거나 멈춰 있는 위치(경과 초). 아직 아무것도 안 틀었으면 null */
  position: () => number | null;
  playing: () => boolean;
  pause: () => void;
}

interface Props {
  segments: SermonAudioSegment[];
  /** 전체 축 끝 (= audioEnd) */
  end: number;
  /** 서버에 못 올린 토막 수 */
  pending: number;
  offline: boolean;
}

export const SermonPlayer = forwardRef<SermonPlayerHandle, Props>(function SermonPlayer(
  { segments, end, pending, offline },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const segRef = useRef<SermonAudioSegment | null>(null);
  const blobUrl = useRef<string | null>(null);
  const pendingSeek = useRef<{ at: number; play: boolean } | null>(null);
  const touched = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const revoke = () => {
    if (blobUrl.current) {
      URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
    }
  };

  /** 토막을 <audio> 에 싣는다. 같은 토막이면 그대로 */
  const load = useCallback(async (seg: SermonAudioSegment): Promise<boolean> => {
    const a = audioRef.current;
    if (!a) return false;
    if (segRef.current?.id === seg.id && a.src) return true;
    segRef.current = seg;
    setErr(null);
    let src: string | null = null;
    if (seg.url && !isLocalId(seg.id)) {
      src = seg.url;
    } else {
      setLoading(true);
      try {
        const blob = await sermonAudioStore.assemble(seg.id, seg.mime);
        if (blob) {
          revoke();
          blobUrl.current = URL.createObjectURL(blob);
          src = blobUrl.current;
        }
      } catch (e) {
        console.warn('sermon: assemble failed', e);
      }
      setLoading(false);
    }
    if (segRef.current?.id !== seg.id) return false; // 그 사이 다른 토막으로 바뀜
    if (!src) {
      setErr('이 구간의 녹음 파일을 찾을 수 없어요');
      return false;
    }
    a.src = src;
    a.load();
    return true;
  }, []);

  const seek = useCallback(
    (t: number, play = true) => {
      const loc = audioLocate({ audio: { segments: segmentsRef.current } }, t);
      const a = audioRef.current;
      if (!loc || !a) return;
      touched.current = true;
      setPos(loc.seg.offset + loc.at);
      void load(loc.seg).then((ok) => {
        if (!ok || segRef.current?.id !== loc.seg.id) return;
        const apply = () => {
          try {
            a.currentTime = loc.at;
          } catch {
            pendingSeek.current = { at: loc.at, play };
            return;
          }
          if (play) a.play().catch(() => setPlaying(false));
        };
        if (a.readyState >= 1) apply();
        else {
          pendingSeek.current = { at: loc.at, play };
          a.addEventListener(
            'loadedmetadata',
            () => {
              const p = pendingSeek.current;
              pendingSeek.current = null;
              if (!p) return;
              try {
                a.currentTime = p.at;
              } catch {
                /* ignore */
              }
              if (p.play) a.play().catch(() => setPlaying(false));
            },
            { once: true },
          );
        }
      });
    },
    [load],
  );

  useImperativeHandle(
    ref,
    () => ({
      seek,
      position: () => (touched.current ? pos : null),
      playing: () => playing,
      pause: () => audioRef.current?.pause(),
    }),
    [seek, pos, playing],
  );

  // <audio> 이벤트
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      const s = segRef.current;
      if (s) setPos(s.offset + a.currentTime);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      const s = segRef.current;
      const segs = segmentsRef.current;
      const i = s ? segs.findIndex((x) => x.id === s.id) : -1;
      const next = i >= 0 ? segs[i + 1] : undefined;
      if (next) seek(next.offset, true);
      else setPlaying(false);
    };
    const onError = () => {
      setErr(offline ? '연결되면 녹음을 들을 수 있어요' : '녹음을 불러오지 못했어요');
      setPlaying(false);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
    };
  }, [seek, offline]);

  useEffect(() => () => revoke(), []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      return;
    }
    if (!segRef.current) seek(0, true);
    else a.play().catch(() => setPlaying(false));
  };

  const shown = scrub ?? pos;
  const max = Math.max(1, Math.round(end));

  return (
    <div className="sn-player" role="group" aria-label="설교 녹음">
      <audio ref={audioRef} preload="metadata" />
      <button
        type="button"
        className="sn-pbtn"
        aria-label={playing ? '녹음 일시정지' : '녹음 재생'}
        disabled={loading}
        onClick={toggle}
      >
        {playing ? <Pause className="sn-icon" /> : <Play className="sn-icon" />}
      </button>
      <span className="sn-mono sn-ptime">
        {fmtTime(shown)}
        <span className="sn-pend"> / {fmtTime(end)}</span>
      </span>
      <input
        id="sn-player-range"
        className="sn-prange"
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(max, Math.round(shown))}
        aria-label="재생 위치"
        aria-valuetext={fmtTime(shown)}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={() => {
          if (scrub != null) seek(scrub, playing || !segRef.current ? playing : false);
          setScrub(null);
        }}
        onKeyUp={() => {
          if (scrub != null) seek(scrub, playing);
          setScrub(null);
        }}
      />
      {err ? (
        <span className="sn-pnote sn-warn">{err}</span>
      ) : loading ? (
        <span className="sn-pnote">불러오는 중…</span>
      ) : pending > 0 ? (
        <span className="sn-pnote" title="연결되고 로그인돼 있으면 자동으로 올라가요">
          기기에만 있음
        </span>
      ) : null}
    </div>
  );
});
