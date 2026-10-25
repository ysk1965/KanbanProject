import { plainText, uid } from './sermonTypes';

/**
 * 본문 버전 기록 — 기획서 §9.
 * 노트를 열고 처음 고칠 때 그 직전 상태, 이후 10분마다, 닫을 때. 본문만 되돌리고 내 생각은 그대로.
 *
 * 현재는 기기 저장소(localStorage)에만 노트당 최근 12개를 둔다.
 * 서버 보관(노트당 20개)은 personal_feature_docs 에 버전 행을 둘 자리가 없어 후속 과제로 남긴다.
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
  return v;
}

/** 노트 id 가 바뀌면(로컬 → 서버) 버전도 따라간다 */
export function remapVersions(userId: string, fromId: string, toId: string) {
  const all = readAll(userId);
  if (!all[fromId]) return;
  all[toId] = [
    ...(all[fromId] || []).map((v) => ({ ...v, note_id: toId })),
    ...(all[toId] || []),
  ].slice(0, LOCAL_KEEP);
  delete all[fromId];
  writeAll(userId, all);
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
  const all = readAll(userId);
  if (!all[noteId]) return;
  delete all[noteId];
  writeAll(userId, all);
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
