import { describe, expect, it } from 'vitest';
import {
  audioDuration,
  audioEnd,
  audioLocate,
  audioPending,
  normalizeNote,
  type SermonAudioSegment,
} from './sermonTypes';
import { audioExt, pickAudioMime, recordingSupported } from './useSermonRecorder';

const seg = (p: Partial<SermonAudioSegment> & { id: string; offset: number; duration: number }) =>
  ({ url: null, mime: 'audio/webm', size: 0, ...p }) as SermonAudioSegment;

describe('녹음 토막 헬퍼', () => {
  const note = {
    audio: {
      segments: [
        seg({ id: 'f1', offset: 0, duration: 600, url: 'https://x/1' }),
        // 10분~12분 사이는 끊김
        seg({ id: 'local-a2', offset: 720, duration: 1800 }),
      ],
    },
  };

  it('끝·총길이·미전송 수', () => {
    expect(audioEnd(note)).toBe(2520);
    expect(audioDuration(note)).toBe(2400);
    expect(audioPending(note)).toBe(1);
    expect(audioPending({ audio: undefined })).toBe(0);
  });

  it('t 가 속한 토막과 토막 안 위치', () => {
    expect(audioLocate(note, 30)).toEqual({ seg: note.audio.segments[0], at: 30 });
    expect(audioLocate(note, 800)).toEqual({ seg: note.audio.segments[1], at: 80 });
  });

  it('끊긴 구간이면 다음 토막 처음, 끝을 넘으면 마지막 토막 끝', () => {
    expect(audioLocate(note, 650)).toEqual({ seg: note.audio.segments[1], at: 0 });
    expect(audioLocate(note, 9999)).toEqual({ seg: note.audio.segments[1], at: 1799 });
    expect(audioLocate({ audio: undefined }, 10)).toBeNull();
  });

  it('normalizeNote 는 audio 가 없으면 키를 만들지 않고, 있으면 offset 순으로 정리한다', () => {
    expect('audio' in normalizeNote('n1', { title: 'x' })).toBe(false);
    const n = normalizeNote('n2', {
      audio: {
        segments: [
          seg({ id: 'b', offset: 100, duration: 5 }),
          seg({ id: 'a', offset: 0, duration: 5, lost: true }),
        ],
      },
    } as never);
    expect(n.audio?.segments.map((s) => s.id)).toEqual(['a', 'b']);
    expect(n.audio?.segments[0].lost).toBe(true);
    expect(normalizeNote('n3', { audio: { segments: [] } } as never).audio).toBeUndefined();
  });
});

describe('녹음 지원 판정 (jsdom 에는 MediaRecorder 가 없다)', () => {
  it('미지원 환경이면 false → 타이머만 동작', () => {
    expect(recordingSupported()).toBe(false);
    expect(pickAudioMime()).toBeNull();
  });
  it('확장자', () => {
    expect(audioExt('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExt('audio/mp4')).toBe('m4a');
    expect(audioExt('audio/ogg;codecs=opus')).toBe('ogg');
  });
});
