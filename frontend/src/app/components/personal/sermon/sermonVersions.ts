import { apiClient } from '../../../utils/api';
import { isLocalId, plainText, uid } from './sermonTypes';

/**
 * 본문 버전 기록 — 기획서 §9.
 * 노트를 열고 처음 고칠 때 그 직전 상태, 이후 10분마다, 닫을 때. 본문만 되돌리고 내 생각은 그대로.
 *
 * 기기 먼저: localStorage `sermon-ver-v1:<userId>` 에 노트당 최근 12개 (본문 사본 포함).
 * 서버 보관(노트당 30개, 계약: /api/v1/sermon-notes/{noteId}/versions):
 *  - 서버 id 노트의 새 버전은 올림 큐(`sermon-ver-up-v1:<userId>`, id 만)에 넣고 1.5초 모아 PUT (멱등)
 *  - `local-` 노트의 버전은 서버 id 로 바뀔 때(remapVersions) 큐에 들어간다
 *  - 끊기면 4초→60초 간격으로, online 이 되면 바로 다시. SNV001(노트 없음)이면 그 노트 몫을 버린다
 *  - 익명(anon)은 서버를 부르지 않는다
 * 버전 기록 창은 기기 것과 서버 것을 합쳐 보여 준다 (새 기기에서도 기록이 보이게).
 */
export type VersionReason = 'open' | 'auto' | 'close' | 'restore';

export interface NoteVersion {
  id: string;
  note_id: string;
  at: number;
  reason: VersionReason;
  title: string;
  body: string;
  chars: number;
}

export const VERSION_REASON_LABEL: Record<VersionReason, string> = {
  open: '열었을 때',
  auto: '자동 저장',
  close: '닫을 때',
  restore: '되돌리기 전',
};

const LOCAL_KEEP = 12;
const ANON = 'anon';
const AUTO_INTERVAL_MS = 10 * 60 * 1000;

function key(userId: string) {
  return `sermon-ver-v1:${userId}`;
}

function readAll(userId: string): Record<string, NoteVersion[]> {
  try {
    const v = localStorage.getItem(key(userId));
    return v ? (JSON.parse(v) as Record<string, NoteVersion[]>) : {};
  } catch {
    return {};
  }
}

function writeAll(userId: string, all: Record<string, NoteVersion[]>): boolean {
  try {
    localStorage.setItem(key(userId), JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function listVersions(userId: string, noteId: string): NoteVersion[] {
  return (readAll(userId)[noteId] || []).slice().sort((a, b) => b.at - a.at);
}

export function saveVersion(
  userId: string,
  noteId: string,
  title: string,
  body: string,
  reason: VersionReason,
): NoteVersion | null {
  const v: NoteVersion = {
    id: uid('v'),
    note_id: noteId,
    at: Date.now(),
    reason,
    title,
    body,
    chars: plainText(body).length,
  };
  const all = readAll(userId);
  const arr = (all[noteId] || []).filter((x) => x.id !== v.id);
  arr.unshift(v);
  all[noteId] = arr.slice(0, LOCAL_KEEP);
  if (!writeAll(userId, all)) {
    // 용량이 차면 더 적게 남긴다
    all[noteId] = arr.slice(0, 4);
    writeAll(userId, all);
  }
  enqueueUploads(userId, [v]);
  return v;
}

/** 노트 id 가 바뀌면(로컬 → 서버) 버전도 따라간다 */
export function remapVersions(userId: string, fromId: string, toId: string) {
  const all = readAll(userId);
  if (!all[fromId]) return;
  const moved = (all[fromId] || []).map((v) => ({ ...v, note_id: toId }));
  all[toId] = [...moved, ...(all[toId] || [])].slice(0, LOCAL_KEEP);
  delete all[fromId];
  writeAll(userId, all);
  // 로컬 id 일 때 남긴 버전은 이제 올릴 수 있다
  enqueueUploads(userId, moved);
}

/** 로그인 직후 익명 사용자의 버전 기록을 계정으로 옮긴다 */
export function adoptVersions(fromUser: string, toUser: string) {
  const src = readAll(fromUser);
  if (!Object.keys(src).length) return;
  const dst = readAll(toUser);
  for (const noteId in src) {
    dst[noteId] = [...(src[noteId] || []), ...(dst[noteId] || [])].slice(0, LOCAL_KEEP);
  }
  if (writeAll(toUser, dst)) {
    enqueueUploads(toUser, Object.values(src).flat());
    try {
      localStorage.removeItem(key(fromUser));
    } catch {
      /* ignore */
    }
  }
}

/** 기기 저장 공간이 찼을 때: 노트마다 최근 `keep` 개만 남긴다 */
export function shrinkVersions(userId: string, keep = 2) {
  const all = readAll(userId);
  let changed = false;
  for (const noteId in all) {
    if ((all[noteId] || []).length > keep) {
      all[noteId] = all[noteId].sort((a, b) => b.at - a.at).slice(0, keep);
      changed = true;
    }
  }
  if (!changed) return;
  if (!writeAll(userId, all)) {
    try {
      localStorage.removeItem(key(userId));
    } catch {
      /* ignore */
    }
  }
}

export function dropVersions(userId: string, noteId: string) {
  dropQueued(userId, noteId);
  const all = readAll(userId);
  if (!all[noteId]) return;
  delete all[noteId];
  writeAll(userId, all);
}

/* ───── 서버 보관 ───── */

/** 서버 목록 한 줄 (본문 없음). at 은 epoch millis (보낸 값 그대로) — 혹시 문자열이면 UTC 로 읽는다 */
export interface ServerVersionItem {
  id: string;
  note_id: string;
  reason: VersionReason;
  title?: string | null;
  chars?: number | null;
  at: number | string;
}

export interface ServerVersion extends ServerVersionItem {
  body?: string | null;
}

export interface ServerVersionBody {
  reason: VersionReason;
  title: string;
  body: string;
  chars: number;
  /** epoch millis */
  at: number;
}

const VP = (noteId: string) => `/sermon-notes/${encodeURIComponent(noteId)}/versions`;

export const sermonVersionAPI = {
  list: (noteId: string) => apiClient.get<{ items?: ServerVersionItem[] }>(VP(noteId)),
  get: (noteId: string, id: string) =>
    apiClient.get<ServerVersion>(`${VP(noteId)}/${encodeURIComponent(id)}`),
  put: (noteId: string, id: string, body: ServerVersionBody) =>
    apiClient.put<ServerVersionItem>(`${VP(noteId)}/${encodeURIComponent(id)}`, body),
};

/** 서버 시각 → epoch ms. 존 표시가 없으면 UTC 로 읽는다 */
export function parseServerAt(at: string | number | null | undefined): number {
  if (typeof at === 'number') return at;
  if (!at) return 0;
  const t = /([zZ]|[+-]\d\d:?\d\d)$/.test(at) ? Date.parse(at) : Date.parse(`${at}Z`);
  return Number.isFinite(t) ? t : 0;
}

/** 버전 기록 창 한 줄 — 서버에만 있는 버전은 body 가 없다(열 때 받아 온다) */
export interface VersionView extends Omit<NoteVersion, 'body'> {
  body?: string;
  /** 서버에만 있음 */
  remote?: boolean;
}

/** 기기 버전 + 서버 버전 합치기 (id 로 중복 제거, 기기 것 우선 — 본문이 있다), 최신순 */
export function mergeVersionLists(
  local: NoteVersion[],
  server: ServerVersionItem[],
  noteId: string,
): VersionView[] {
  const out: VersionView[] = [...local];
  const seen = new Set(local.map((v) => v.id));
  for (const s of server) {
    if (!s?.id || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({
      id: s.id,
      note_id: noteId,
      at: parseServerAt(s.at),
      reason: s.reason,
      title: s.title || '',
      chars: s.chars ?? 0,
      remote: true,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

interface UpItem {
  note_id: string;
  id: string;
}

const UP_DELAY = 1500;
const BACKOFF_MIN = 4000;
const BACKOFF_MAX = 60000;

function upKey(userId: string) {
  return `sermon-ver-up-v1:${userId}`;
}

function readQueue(userId: string): UpItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(upKey(userId)) || '[]') as UpItem[];
    return Array.isArray(v) ? v.filter((x) => x && x.note_id && x.id) : [];
  } catch {
    return [];
  }
}

function writeQueue(userId: string, q: UpItem[]) {
  try {
    if (q.length) localStorage.setItem(upKey(userId), JSON.stringify(q));
    else localStorage.removeItem(upKey(userId));
  } catch {
    /* 저장 공간 없음 — 이번 세션 동안만 (메모리 큐는 없음: 다음 저장 때 다시) */
  }
}

/** 올릴 수 있는 버전만 큐에 (익명·로컬 id 노트는 빼고) */
function enqueueUploads(userId: string, vs: Array<Pick<NoteVersion, 'id' | 'note_id'>>) {
  if (userId === ANON) return;
  const add = vs.filter((v) => v && v.id && v.note_id && !isLocalId(v.note_id));
  if (!add.length) return;
  const q = readQueue(userId);
  const has = new Set(q.map((x) => `${x.note_id}|${x.id}`));
  let changed = false;
  for (const v of add) {
    const k = `${v.note_id}|${v.id}`;
    if (has.has(k)) continue;
    has.add(k);
    q.push({ note_id: v.note_id, id: v.id });
    changed = true;
  }
  if (!changed) return;
  writeQueue(userId, q);
  uploaderFor(userId).schedule(UP_DELAY);
}

function dropQueued(userId: string, noteId: string) {
  const q = readQueue(userId);
  const next = q.filter((x) => x.note_id !== noteId);
  if (next.length !== q.length) writeQueue(userId, next);
}

function errCode(e: unknown): { code?: string; status?: number } {
  return (e && typeof e === 'object' ? e : {}) as { code?: string; status?: number };
}

/** 사용자 하나의 올림 담당 — 한 번에 하나씩 차례로 보낸다 */
class VersionUploader {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private again = false;
  backoff = BACKOFF_MIN;

  constructor(private userId: string) {}

  schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  async flush(): Promise<void> {
    if (this.userId === ANON) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    let failed = false;
    try {
      for (;;) {
        const q = readQueue(this.userId);
        const item = q[0];
        if (!item) break;
        const local = (readAll(this.userId)[item.note_id] || []).find((v) => v.id === item.id);
        if (!local) {
          // 기기에서 이미 밀려났다 (용량 정리 등) — 올릴 본문이 없다
          this.done(item);
          continue;
        }
        try {
          await sermonVersionAPI.put(item.note_id, item.id, {
            reason: local.reason,
            title: local.title || '',
            body: local.body || '',
            chars: local.chars || 0,
            at: local.at,
          });
          this.done(item);
        } catch (e) {
          const { code, status } = errCode(e);
          if (code === 'SNV001' || status === 404) {
            // 노트가 서버에 없다 (지워짐) — 그 노트 몫은 모두 버린다
            dropQueued(this.userId, item.note_id);
          } else if (code === 'SNV002' || status === 400 || status === 422) {
            this.done(item);
          } else {
            failed = true;
            break;
          }
        }
      }
    } finally {
      this.running = false;
    }
    if (failed) {
      this.schedule(this.backoff);
      this.backoff = Math.min(BACKOFF_MAX, this.backoff * 2);
      return;
    }
    this.backoff = BACKOFF_MIN;
    if (this.again) {
      this.again = false;
      await this.flush();
    }
  }

  private done(item: UpItem) {
    writeQueue(
      this.userId,
      readQueue(this.userId).filter((x) => !(x.note_id === item.note_id && x.id === item.id)),
    );
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

const uploaders = new Map<string, VersionUploader>();
let onlineHooked = false;

function uploaderFor(userId: string): VersionUploader {
  let u = uploaders.get(userId);
  if (!u) {
    u = new VersionUploader(userId);
    uploaders.set(userId, u);
  }
  if (!onlineHooked && typeof window !== 'undefined') {
    onlineHooked = true;
    window.addEventListener('online', () => {
      uploaders.forEach((x) => {
        x.backoff = BACKOFF_MIN;
        x.schedule(0);
      });
    });
  }
  return u;
}

/** 앱 시작 때: 지난번에 못 올린 버전이 남아 있으면 올린다 */
export function kickVersionUploads(userId: string) {
  if (userId === ANON || !readQueue(userId).length) return;
  uploaderFor(userId).schedule(UP_DELAY);
}

/** 큐를 바로 비운다 (테스트·화면을 떠날 때) */
export function flushVersionUploads(userId: string): Promise<void> {
  if (userId === ANON) return Promise.resolve();
  return uploaderFor(userId).flush();
}

/** 남은 올림 수 (테스트용) */
export function pendingVersionUploads(userId: string): number {
  return readQueue(userId).length;
}

/** 테스트용 — 타이머·상태 비우기 */
export function resetVersionUploaders() {
  uploaders.forEach((u) => u.dispose());
  uploaders.clear();
}

/**
 * 열린 노트 하나의 버전 저장 시점 추적.
 * open 시 base 를 잡아 두고, 처음 바뀔 때 base 를 'open' 으로 남긴 뒤 10분마다 / 닫을 때 남긴다.
 */
export class VersionTracker {
  private at = Date.now();
  private baseSaved = false;

  constructor(
    private userId: string,
    private noteId: string,
    private base: string,
    private titleOf: () => string,
  ) {}

  setNoteId(id: string) {
    this.noteId = id;
  }

  /** 저장할 때마다 호출. closing 이면 무조건 한 번 남긴다 */
  maybe(currentBody: string, closing: boolean) {
    if (currentBody === this.base) return;
    if (!this.baseSaved) {
      saveVersion(this.userId, this.noteId, this.titleOf(), this.base, 'open');
      this.baseSaved = true;
      this.at = Date.now();
    }
    if (closing || Date.now() - this.at > AUTO_INTERVAL_MS) {
      saveVersion(
        this.userId,
        this.noteId,
        this.titleOf(),
        currentBody,
        closing ? 'close' : 'auto',
      );
      this.at = Date.now();
      this.base = currentBody;
    }
  }
}
