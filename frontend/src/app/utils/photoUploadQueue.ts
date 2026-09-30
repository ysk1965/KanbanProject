/**
 * 사진첩 대량 업로드 큐
 *
 * 사용자는 최대 3000장을 한 번에 고르고, 내부에서는
 *  1) presign 100개씩 (필요할 때만) → 2) 브라우저가 S3로 파일당 병렬 PUT (원본 + 400px 썸네일)
 *  → 3) 올라간 것 50개씩 confirm 으로 DB 등록
 * 순서로 처리한다. 파일 단위로 상태를 추적하므로 실패한 파일만 다시 보낼 수 있고, 성공분은 재전송하지 않는다.
 * presign 이 mode="direct"(로컬 등 S3 미지원)를 돌려주면 기존 multipart 엔드포인트로 100MB/20장씩 보낸다.
 */
import type { OrgPhoto } from "../types";
import {
  splitFilesIntoChunks,
  type PhotoConfirmItem,
  type PhotoConfirmResponse,
  type PhotoPresignFile,
  type PhotoPresignResponse,
} from "./api";

export const PHOTO_UPLOAD_MAX_FILES = 3000;
export const PHOTO_MAX_FILE_SIZE = 30 * 1024 * 1024;
export const PHOTO_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const PRESIGN_BATCH = 100;
const CONFIRM_BATCH = 50;
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 3000, 9000];
/** presigned URL 만료는 15분 — 여유를 두고 13분 지난 URL은 재발급 */
const URL_MAX_AGE_MS = 13 * 60 * 1000;
const THUMB_MAX = 400;
const EMIT_INTERVAL_MS = 120;

/** 업로드 대상(앨범) 하나에 대한 서버 호출 묶음 */
export interface PhotoUploadTarget {
  /** 같은 대상끼리 presign/confirm 을 묶는 키 (앨범 id) */
  key: string;
  presign(files: PhotoPresignFile[]): Promise<PhotoPresignResponse>;
  confirm(items: PhotoConfirmItem[]): Promise<PhotoConfirmResponse>;
  /** presign 미지원 환경 폴백 — 기존 multipart 엔드포인트 */
  uploadDirect(files: File[]): Promise<OrgPhoto[]>;
}

export type PhotoUploadStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "confirming"
  | "confirmed"
  | "failed";

export interface PhotoUploadFailure {
  id: string;
  name: string;
  reason: string;
}

export interface PhotoUploadSnapshot {
  total: number;
  confirmed: number;
  failed: number;
  /** 아직 끝나지 않은 파일 수 */
  pending: number;
  /** 실패분을 제외한 전체 바이트 / 전송 완료 바이트 */
  bytesTotal: number;
  bytesDone: number;
  active: boolean;
  failures: PhotoUploadFailure[];
}

export type PhotoUploadConfirmedListener = (
  targetKey: string,
  photos: OrgPhoto[],
) => void;

interface TargetState {
  target: PhotoUploadTarget;
  direct: boolean;
  presigning: boolean;
  confirming: boolean;
  directBusy: boolean;
}

interface Item {
  id: string;
  file: File;
  contentType: string;
  ts: TargetState;
  status: PhotoUploadStatus;
  attempts: number;
  confirmAttempts: number;
  reason?: string;
  loaded: number;
  notBefore: number;
  s3Key?: string;
  uploadUrl?: string;
  thumbUrl?: string | null;
  presignedAt?: number;
  thumbDone: boolean;
  thumbBlob?: Blob | null;
  width: number | null;
  height: number | null;
  hasThumb: boolean;
}

class UploadHttpError extends Error {
  constructor(public status: number) {
    super(`PUT failed (${status})`);
  }
}

const EMPTY_SNAPSHOT: PhotoUploadSnapshot = {
  total: 0,
  confirmed: 0,
  failed: 0,
  pending: 0,
  bytesTotal: 0,
  bytesDone: 0,
  active: false,
  failures: [],
};

let idSeq = 0;
const nextId = () => `f${Date.now().toString(36)}_${(idSeq++).toString(36)}`;

function defaultConcurrency(): number {
  try {
    if (window.matchMedia?.("(pointer: coarse)").matches) return 3;
  } catch {
    /* noop */
  }
  return 6;
}

/** 서버 오류 → 재시도 여부 + 사유 코드 */
function classify(err: unknown): { retryable: boolean; reason: string } {
  if (err instanceof TypeError) return { retryable: true, reason: "NETWORK" };
  const e = err as {
    status?: number;
    code?: string;
    error?: { code?: string };
  } | null;
  const code = e?.error?.code ?? e?.code;
  const status = e?.status;
  if (typeof status === "number") {
    if (status >= 500 || status === 429 || status === 408) {
      return { retryable: true, reason: code || "SERVER_ERROR" };
    }
    return { retryable: false, reason: code || `HTTP_${status}` };
  }
  if (code) return { retryable: false, reason: code };
  return { retryable: true, reason: "NETWORK" };
}

function xhrPut(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new UploadHttpError(xhr.status));
    xhr.onerror = () => reject(new UploadHttpError(0));
    xhr.onabort = () => reject(new UploadHttpError(0));
    xhr.ontimeout = () => reject(new UploadHttpError(0));
    xhr.send(body);
  });
}

/** 브라우저에서 400px JPEG 썸네일 + 원본 가로/세로 추출. 실패하면 blob=null (서버가 비동기 생성) */
async function makeThumbnail(
  file: File,
): Promise<{ blob: Blob | null; width: number | null; height: number | null }> {
  if (typeof createImageBitmap !== "function") {
    return { blob: null, width: null, height: null };
  }
  let bmp: ImageBitmap | undefined;
  try {
    bmp = await createImageBitmap(file);
    const { width, height } = bmp;
    const scale = Math.min(1, THUMB_MAX / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    let blob: Blob | null = null;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bmp, 0, 0, w, h);
        blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
      }
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bmp, 0, 0, w, h);
        blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, "image/jpeg", 0.8),
        );
      }
    }
    return { blob, width, height };
  } catch {
    return { blob: null, width: null, height: null };
  } finally {
    bmp?.close();
  }
}

/** 클라이언트 선검증 — 통과 못 하면 사유 코드, 통과하면 null */
export function validatePhotoFile(file: File): string | null {
  if (!PHOTO_ACCEPTED_TYPES.includes(file.type)) return "UNSUPPORTED_TYPE";
  if (file.size > PHOTO_MAX_FILE_SIZE) return "FILE_TOO_LARGE";
  return null;
}

export class PhotoUploadQueue {
  private items: Item[] = [];
  private targets = new Map<string, TargetState>();
  private active = 0;
  private readonly concurrency: number;
  private listeners = new Set<() => void>();
  private confirmedListeners = new Set<PhotoUploadConfirmedListener>();
  private snapshot: PhotoUploadSnapshot = EMPTY_SNAPSHOT;
  private kickScheduled = false;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeAt = Infinity;
  private unloadGuard = false;

  constructor(opts?: { concurrency?: number }) {
    this.concurrency = opts?.concurrency ?? defaultConcurrency();
  }

  // ─── public API ───

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PhotoUploadSnapshot => this.snapshot;

  onConfirmed(listener: PhotoUploadConfirmedListener): () => void {
    this.confirmedListeners.add(listener);
    return () => this.confirmedListeners.delete(listener);
  }

  /** 파일을 큐에 추가하고 바로 전송을 시작한다 */
  enqueue(files: File[], target: PhotoUploadTarget): void {
    let ts = this.targets.get(target.key);
    if (!ts) {
      ts = {
        target,
        direct: false,
        presigning: false,
        confirming: false,
        directBusy: false,
      };
      this.targets.set(target.key, ts);
    } else {
      ts.target = target;
    }
    for (const file of files) {
      const invalid = validatePhotoFile(file);
      this.items.push({
        id: nextId(),
        file,
        contentType: file.type,
        ts,
        status: invalid ? "failed" : "queued",
        reason: invalid ?? undefined,
        attempts: 0,
        confirmAttempts: 0,
        loaded: 0,
        notBefore: 0,
        thumbDone: false,
        width: null,
        height: null,
        hasThumb: false,
      });
    }
    this.kick();
    this.emitNow();
  }

  /** 실패한 파일만 처음부터 다시 보낸다 (성공분은 건드리지 않음) */
  retryFailed(): void {
    for (const it of this.items) {
      if (it.status !== "failed") continue;
      if (validatePhotoFile(it.file)) continue; // 형식/용량 문제는 다시 보내도 실패
      it.status = "queued";
      it.reason = undefined;
      it.attempts = 0;
      it.confirmAttempts = 0;
      it.loaded = 0;
      it.notBefore = 0;
      it.s3Key = undefined;
      it.uploadUrl = undefined;
      it.thumbUrl = undefined;
      it.presignedAt = undefined;
    }
    this.kick();
    this.emitNow();
  }

  /** 끝난 항목(성공·실패)을 비운다. 진행 중인 항목은 유지 */
  clearFinished(): void {
    this.items = this.items.filter(
      (i) => i.status !== "confirmed" && i.status !== "failed",
    );
    for (const [key, ts] of this.targets) {
      if (!this.items.some((i) => i.ts === ts)) this.targets.delete(key);
    }
    this.emitNow();
  }

  // ─── scheduling ───

  private kick(): void {
    if (this.kickScheduled) return;
    this.kickScheduled = true;
    queueMicrotask(() => {
      this.kickScheduled = false;
      this.pump();
    });
  }

  private pump(): void {
    const now = Date.now();
    let wake = Infinity;
    const noteWake = (t: number) => {
      if (t > now && t < wake) wake = t;
    };

    for (const ts of this.targets.values()) {
      const mine = this.items.filter((i) => i.ts === ts);

      if (ts.direct) {
        if (!ts.directBusy) {
          const ready = mine.filter(
            (i) => i.status === "queued" && i.notBefore <= now,
          );
          if (ready.length > 0) {
            const chunk = splitFilesIntoChunks(ready.map((i) => i.file))[0];
            void this.runDirect(ts, ready.slice(0, chunk.length));
          }
        }
        mine.forEach((i) => i.status === "queued" && noteWake(i.notBefore));
        continue;
      }

      // presign — 서명된 대기분이 넉넉하면 미룬다 (URL 만료 방지)
      if (!ts.presigning) {
        const signedWaiting = mine.filter(
          (i) => i.status === "queued" && i.uploadUrl,
        ).length;
        if (signedWaiting < this.concurrency * 2) {
          const needSign = mine.filter(
            (i) => i.status === "queued" && !i.uploadUrl && i.notBefore <= now,
          );
          if (needSign.length > 0) {
            void this.presign(ts, needSign.slice(0, PRESIGN_BATCH));
          }
        }
      }

      // confirm — 50개가 모였거나 이 대상의 전송이 모두 끝났을 때
      if (!ts.confirming) {
        const uploaded = mine.filter((i) => i.status === "uploaded");
        const readyToConfirm = uploaded.filter((i) => i.notBefore <= now);
        const drained = !mine.some(
          (i) => i.status === "queued" || i.status === "uploading",
        );
        if (
          readyToConfirm.length >= CONFIRM_BATCH ||
          (drained && readyToConfirm.length > 0)
        ) {
          void this.confirm(ts, readyToConfirm.slice(0, CONFIRM_BATCH));
        }
        uploaded.forEach((i) => noteWake(i.notBefore));
      }
      mine.forEach((i) => i.status === "queued" && noteWake(i.notBefore));
    }

    // S3 PUT 워커 채우기
    while (this.active < this.concurrency) {
      const next = this.items.find(
        (i) =>
          i.status === "queued" &&
          i.uploadUrl &&
          !i.ts.direct &&
          i.notBefore <= now,
      );
      if (!next) break;
      if (next.presignedAt && now - next.presignedAt > URL_MAX_AGE_MS) {
        next.uploadUrl = undefined;
        next.thumbUrl = undefined;
        next.s3Key = undefined;
        this.kick();
        continue;
      }
      void this.runUpload(next);
    }

    this.scheduleWake(wake);
    this.updateUnloadGuard();
    this.scheduleEmit();
  }

  private scheduleWake(at: number): void {
    if (at === Infinity || at >= this.wakeAt) return;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeAt = at;
    this.wakeTimer = setTimeout(
      () => {
        this.wakeTimer = null;
        this.wakeAt = Infinity;
        this.kick();
      },
      Math.max(0, at - Date.now()),
    );
  }

  private retryLater(it: Item, reason: string, retryable: boolean): void {
    it.attempts += 1;
    if (retryable && it.attempts <= MAX_RETRIES) {
      it.status = "queued";
      it.notBefore = Date.now() + BACKOFF_MS[it.attempts - 1];
    } else {
      it.status = "failed";
      it.reason = reason;
    }
    it.loaded = 0;
  }

  // ─── steps ───

  private async presign(ts: TargetState, batch: Item[]): Promise<void> {
    ts.presigning = true;
    try {
      const res = await ts.target.presign(
        batch.map((i) => ({
          client_id: i.id,
          filename: i.file.name,
          content_type: i.contentType,
          size: i.file.size,
        })),
      );
      if (res.mode === "direct") {
        ts.direct = true;
        return;
      }
      const signed = new Map(res.items.map((x) => [x.client_id, x]));
      const rejected = new Map(
        (res.rejected ?? []).map((x) => [x.client_id, x.reason]),
      );
      const at = Date.now();
      for (const it of batch) {
        const s = signed.get(it.id);
        if (s) {
          it.s3Key = s.s3_key;
          it.uploadUrl = s.upload_url;
          it.thumbUrl = s.thumbnail_upload_url;
          it.presignedAt = at;
        } else {
          it.status = "failed";
          it.reason = rejected.get(it.id) ?? "PRESIGN_FAILED";
        }
      }
    } catch (err) {
      const { retryable, reason } = classify(err);
      batch.forEach((it) => this.retryLater(it, reason, retryable));
    } finally {
      ts.presigning = false;
      this.kick();
    }
  }

  private async runUpload(it: Item): Promise<void> {
    it.status = "uploading";
    it.loaded = 0;
    this.active += 1;
    try {
      if (!it.thumbDone) {
        const thumb = await makeThumbnail(it.file);
        it.thumbBlob = thumb.blob;
        it.width = thumb.width;
        it.height = thumb.height;
        it.thumbDone = true;
      }
      await xhrPut(it.uploadUrl!, it.file, it.contentType, (loaded) => {
        it.loaded = loaded;
        this.scheduleEmit();
      });
      it.hasThumb = false;
      if (it.thumbUrl && it.thumbBlob) {
        try {
          await xhrPut(it.thumbUrl, it.thumbBlob, "image/jpeg");
          it.hasThumb = true;
        } catch {
          // 썸네일 실패는 치명적이지 않다 — 서버가 원본에서 생성
        }
      }
      it.thumbBlob = undefined;
      it.status = "uploaded";
      it.loaded = it.file.size;
      it.notBefore = 0;
    } catch (err) {
      const status = err instanceof UploadHttpError ? err.status : 0;
      if (status === 403) {
        // presigned URL 만료/서명 불일치 → 재발급 후 재시도
        it.uploadUrl = undefined;
        it.thumbUrl = undefined;
        it.s3Key = undefined;
      }
      const retryable = status === 0 || status === 403 || status >= 500;
      this.retryLater(it, status ? `S3_${status}` : "NETWORK", retryable);
    } finally {
      this.active -= 1;
      this.kick();
    }
  }

  private async confirm(ts: TargetState, batch: Item[]): Promise<void> {
    ts.confirming = true;
    batch.forEach((i) => (i.status = "confirming"));
    try {
      const res = await ts.target.confirm(
        batch.map((i) => ({
          s3_key: i.s3Key!,
          filename: i.file.name,
          content_type: i.contentType,
          width: i.width,
          height: i.height,
          has_thumbnail: i.hasThumb,
        })),
      );
      const ok = new Map(res.succeeded.map((x) => [x.s3_key, x.photo]));
      const bad = new Map(res.failed.map((x) => [x.s3_key, x.reason]));
      const photos: OrgPhoto[] = [];
      for (const it of batch) {
        const photo = ok.get(it.s3Key!);
        if (photo) {
          it.status = "confirmed";
          photos.push(photo);
        } else {
          it.status = "failed";
          it.reason = bad.get(it.s3Key!) ?? "CONFIRM_FAILED";
        }
      }
      if (photos.length > 0) this.emitConfirmed(ts.target.key, photos);
    } catch (err) {
      const { retryable, reason } = classify(err);
      for (const it of batch) {
        it.confirmAttempts += 1;
        if (retryable && it.confirmAttempts <= MAX_RETRIES) {
          it.status = "uploaded";
          it.notBefore = Date.now() + BACKOFF_MS[it.confirmAttempts - 1];
        } else {
          it.status = "failed";
          it.reason = reason;
        }
      }
    } finally {
      ts.confirming = false;
      this.kick();
    }
  }

  private async runDirect(ts: TargetState, batch: Item[]): Promise<void> {
    ts.directBusy = true;
    batch.forEach((i) => (i.status = "uploading"));
    try {
      const photos = await ts.target.uploadDirect(batch.map((i) => i.file));
      batch.forEach((i) => {
        i.status = "confirmed";
        i.loaded = i.file.size;
      });
      this.emitConfirmed(ts.target.key, photos);
    } catch (err) {
      const { retryable, reason } = classify(err);
      batch.forEach((it) => this.retryLater(it, reason, retryable));
    } finally {
      ts.directBusy = false;
      this.kick();
    }
  }

  // ─── notifications ───

  private emitConfirmed(key: string, photos: OrgPhoto[]): void {
    this.confirmedListeners.forEach((l) => {
      try {
        l(key, photos);
      } catch (e) {
        console.warn("photo upload confirmed listener failed", e);
      }
    });
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emitNow();
    }, EMIT_INTERVAL_MS);
  }

  private emitNow(): void {
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
    let confirmed = 0;
    let failed = 0;
    let bytesTotal = 0;
    let bytesDone = 0;
    const failures: PhotoUploadFailure[] = [];
    for (const it of this.items) {
      if (it.status === "failed") {
        failed += 1;
        failures.push({ id: it.id, name: it.file.name, reason: it.reason ?? "" });
        continue;
      }
      bytesTotal += it.file.size;
      if (it.status === "confirmed") confirmed += 1;
      bytesDone +=
        it.status === "queued"
          ? 0
          : it.status === "uploading"
            ? it.loaded
            : it.file.size;
    }
    const total = this.items.length;
    const pending = total - confirmed - failed;
    this.snapshot = {
      total,
      confirmed,
      failed,
      pending,
      bytesTotal,
      bytesDone,
      active: pending > 0,
      failures,
    };
    this.updateUnloadGuard();
    this.listeners.forEach((l) => l());
  }

  // 업로드 중 새로고침/탭 닫기 경고
  private handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = "";
  };

  private updateUnloadGuard(): void {
    const active = this.items.some(
      (i) => i.status !== "confirmed" && i.status !== "failed",
    );
    if (active === this.unloadGuard) return;
    this.unloadGuard = active;
    if (active) window.addEventListener("beforeunload", this.handleBeforeUnload);
    else window.removeEventListener("beforeunload", this.handleBeforeUnload);
  }
}
