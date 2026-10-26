import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadLook, persistLook } from '../sermonLook';
import type { SermonStore } from '../sermonStore';
import { ANONYMOUS_USER } from '../sermonStore';
import { sermonProfileAPI, type VerseEntry } from './profileApi';
import {
  defaultProfile,
  normalizeProfile,
  readCache,
  remapPins,
  sameProfile,
  togglePinList,
  writeCache,
  type PinToggle,
  type SermonProfileData,
} from './profileModel';

/**
 * 이름표 상태. 기기 캐시를 먼저 그리고(오프라인에서도), 로그인 상태면 서버와 맞춘다.
 *  - 기기에 못 올린 변경(dirty)이 있으면 기기 쪽이 이긴다 → 올림
 *  - 아니면 서버 값을 받는다. 서버에 아직 없고 기기 값이 기본값과 다르면 올림
 * 고칠 때마다 기기에 바로 적고, 0.7초 모았다가 서버에 통째로 PUT. 실패하면 30초 뒤 다시.
 * 잉크·캐릭터는 기존 꾸미기 키(sermon-look-v1)에도 같이 적어 다른 화면(카드·초대 페이지)이 따라오게 한다.
 */
export interface SermonProfileState {
  data: SermonProfileData;
  /** 대표 말씀 연대기 (로그인 상태에서만) */
  history: VerseEntry[];
  verseCount: number | null;
  /** 서버에 못 올린 변경이 남음 */
  pending: boolean;
  anonymous: boolean;
  update: (patch: Partial<SermonProfileData>) => void;
  /** exists 를 주면 지워진 노트를 가리키는 고정은 먼저 정리한다 (자리를 차지하지 않게) */
  togglePin: (noteId: string, exists?: (id: string) => boolean) => PinToggle;
  isPinned: (noteId: string) => boolean;
}

const SAVE_DELAY = 700;
const RETRY_DELAY = 30_000;

function initial(userId: string): { data: SermonProfileData; dirty: boolean } {
  const look = loadLook();
  const own = readCache(userId, look);
  if (own) return own;
  // 로그인 직후: 로그인 전에 꾸민 이름표를 이 계정으로 가져온다
  if (userId !== ANONYMOUS_USER) {
    const anon = readCache(ANONYMOUS_USER, look);
    if (anon && !sameProfile(anon.data, defaultProfile(look)))
      return { data: anon.data, dirty: true };
  }
  return { data: defaultProfile(look), dirty: false };
}

export function useSermonProfile({
  userId,
  anonymous,
  store,
}: {
  userId: string;
  anonymous: boolean;
  store: SermonStore;
}): SermonProfileState {
  const first = useMemo(() => initial(userId), [userId]);
  const [data, setData] = useState<SermonProfileData>(first.data);
  const [history, setHistory] = useState<VerseEntry[]>([]);
  const [verseCount, setVerseCount] = useState<number | null>(null);
  const [pending, setPending] = useState(first.dirty);
  const dataRef = useRef(data);
  const dirtyRef = useRef(first.dirty);
  /** 고칠 때마다 +1 — 올리는 사이에 또 고쳤으면 응답으로 덮지 않는다 */
  const verRef = useRef(0);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  const push = useCallback(async () => {
    if (anonymous || !dirtyRef.current) return;
    const ver = verRef.current;
    try {
      const res = await sermonProfileAPI.put(dataRef.current);
      if (!alive.current) return;
      setHistory(res.verse_history || []);
      setVerseCount(res.verse_count ?? null);
      if (ver === verRef.current) {
        dirtyRef.current = false;
        setPending(false);
        writeCache(userId, { data: dataRef.current, dirty: false });
      }
    } catch {
      if (!alive.current) return;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void push(), RETRY_DELAY);
    }
  }, [anonymous, userId]);

  const schedule = useCallback(() => {
    if (anonymous) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void push(), SAVE_DELAY);
  }, [anonymous, push]);

  const commit = useCallback(
    (next: SermonProfileData) => {
      dataRef.current = next;
      verRef.current += 1;
      setData(next);
      if (!anonymous) {
        dirtyRef.current = true;
        setPending(true);
      }
      writeCache(userId, { data: next, dirty: !anonymous });
      schedule();
    },
    [anonymous, schedule, userId],
  );

  // 서버와 맞추기
  useEffect(() => {
    alive.current = true;
    if (anonymous) return;
    let gone = false;
    void sermonProfileAPI
      .me()
      .then((res) => {
        if (gone) return;
        setHistory(res.verse_history || []);
        setVerseCount(res.verse_count ?? null);
        if (dirtyRef.current) {
          void push();
          return;
        }
        if (res.saved) {
          const server = normalizeProfile(res, loadLook());
          dataRef.current = server;
          setData(server);
          writeCache(userId, { data: server, dirty: false });
        } else if (!sameProfile(dataRef.current, defaultProfile(loadLook()))) {
          dirtyRef.current = true;
          setPending(true);
          void push();
        }
      })
      .catch(() => {
        /* 오프라인·서버 오류 — 기기 값으로 계속, 고치면 그때 다시 올린다 */
        if (!gone && dirtyRef.current) schedule();
      });
    return () => {
      gone = true;
    };
  }, [anonymous, push, schedule, userId]);

  useEffect(
    () => () => {
      alive.current = false;
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  // 화면을 떠날 때 모아 둔 변경을 바로 올린다 (실패해도 dirty 로 남아 다음에 올라감)
  useEffect(() => {
    if (anonymous) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) void push();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [anonymous, push]);

  // 로컬 노트 id 가 서버 id 로 바뀌면 고정 목록도
  useEffect(
    () =>
      store.onRemap((from, to) => {
        const pins = remapPins(dataRef.current.pins, from, to);
        if (pins) commit({ ...dataRef.current, pins });
      }),
    [store, commit],
  );

  // 잉크·캐릭터는 기존 꾸미기 키에도
  useEffect(() => {
    persistLook({ ink: data.ink, mascot: data.mascot });
  }, [data.ink, data.mascot]);

  const update = useCallback(
    (patch: Partial<SermonProfileData>) => commit({ ...dataRef.current, ...patch }),
    [commit],
  );
  const togglePin = useCallback(
    (noteId: string, exists?: (id: string) => boolean): PinToggle => {
      const live = exists
        ? dataRef.current.pins.filter((p) => p.note_id === noteId || exists(p.note_id))
        : dataRef.current.pins;
      const { pins, result } = togglePinList(live, noteId);
      if (result !== 'full') commit({ ...dataRef.current, pins });
      return result;
    },
    [commit],
  );
  const isPinned = useCallback(
    (noteId: string) => data.pins.some((p) => p.note_id === noteId),
    [data.pins],
  );

  return { data, history, verseCount, pending, anonymous, update, togglePin, isPinned };
}
