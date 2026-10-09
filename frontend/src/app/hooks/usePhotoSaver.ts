import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  anchorDownload,
  fetchAsFile,
  markManyAsDownloaded,
  needsTapToSave,
  shareFiles,
} from '../utils/nativeDownload';
import { resolveFileUrl } from '../utils/api';

export interface PhotoSaveItem {
  id: string;
  url: string;
  filename: string;
  /** Bytes — used to size chunks; unknown sizes are treated as camera originals */
  size?: number | null;
}

export type PhotoSavePhase = 'idle' | 'preparing' | 'ready' | 'sharing' | 'done' | 'cancelled';

export interface PhotoSaveState {
  phase: PhotoSavePhase;
  /** 0-based index of the current chunk */
  chunkIndex: number;
  chunkCount: number;
  /** Photos in the current chunk / fetched so far */
  chunkSize: number;
  prepared: number;
  savedCount: number;
  failedCount: number;
  total: number;
}

interface Chunk {
  items: PhotoSaveItem[];
  files?: File[];
}

// One chunk is held in memory at a time. iOS Safari kills tabs well before 1GB,
// so cap by bytes as well as count (camera originals are 20–30MB each).
const MAX_CHUNK_BYTES = 150 * 1024 * 1024;
const MAX_CHUNK_COUNT = 10;
const UNKNOWN_SIZE = 25 * 1024 * 1024;

function buildChunks(items: PhotoSaveItem[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: PhotoSaveItem[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = item.size || UNKNOWN_SIZE;
    if (current.length > 0 && (current.length >= MAX_CHUNK_COUNT || bytes + size > MAX_CHUNK_BYTES)) {
      chunks.push({ items: current });
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) chunks.push({ items: current });
  return chunks;
}

const IDLE: PhotoSaveState = {
  phase: 'idle',
  chunkIndex: 0,
  chunkCount: 0,
  chunkSize: 0,
  prepared: 0,
  savedCount: 0,
  failedCount: 0,
  total: 0,
};

/**
 * Two-step photo saving for iOS web: fetch a chunk of photos (step 1), then open the
 * share sheet from the user's "Save to Photos" tap (step 2), so the sheet is never
 * blocked for being too long after the original tap. Chunks keep memory bounded.
 *
 * `start` returns false on platforms that don't need this — use the regular download path.
 */
export function usePhotoSaver(onSaved?: (ids: string[]) => void) {
  const [state, setState] = useState<PhotoSaveState>(IDLE);
  const chunksRef = useRef<Chunk[]>([]);
  const indexRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const finish = useCallback((phase: 'done' | 'cancelled') => {
    abortRef.current?.abort();
    abortRef.current = null;
    chunksRef.current = [];
    setState((s) => ({ ...s, phase }));
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setState(IDLE), phase === 'done' ? 2500 : 1500);
  }, []);

  const prepareChunk = useCallback(
    async (index: number) => {
      const chunk = chunksRef.current[index];
      if (!chunk) {
        finish('done');
        return;
      }
      indexRef.current = index;

      // Already fetched (e.g. a chunk split after a failed multi-file share)
      if (chunk.files) {
        setState((s) => ({
          ...s,
          phase: 'ready',
          chunkIndex: index,
          chunkCount: chunksRef.current.length,
          chunkSize: chunk.items.length,
          prepared: chunk.items.length,
        }));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setState((s) => ({
        ...s,
        phase: 'preparing',
        chunkIndex: index,
        chunkCount: chunksRef.current.length,
        chunkSize: chunk.items.length,
        prepared: 0,
      }));

      const items: PhotoSaveItem[] = [];
      const files: File[] = [];
      let failed = 0;
      for (const item of chunk.items) {
        if (controller.signal.aborted) return;
        try {
          files.push(await fetchAsFile(resolveFileUrl(item.url), item.filename, controller.signal));
          items.push(item);
        } catch {
          if (controller.signal.aborted) return;
          failed++;
        }
        setState((s) => ({ ...s, prepared: s.prepared + 1 }));
      }
      if (controller.signal.aborted) return;
      abortRef.current = null;

      setState((s) => ({ ...s, failedCount: s.failedCount + failed }));
      if (files.length === 0) {
        void prepareChunk(index + 1);
        return;
      }
      chunk.items = items;
      chunk.files = files;
      setState((s) => ({ ...s, phase: 'ready', chunkSize: items.length, prepared: items.length }));
    },
    [finish],
  );

  const start = useCallback(
    (items: PhotoSaveItem[]): boolean => {
      if (!needsTapToSave() || items.length === 0) return false;
      abortRef.current?.abort();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      chunksRef.current = buildChunks(items);
      setState({ ...IDLE, phase: 'preparing', chunkCount: chunksRef.current.length, total: items.length });
      void prepareChunk(0);
      return true;
    },
    [prepareChunk],
  );

  /** Step 2 — call directly from the button's onClick (share sheet needs the tap). */
  const saveNow = useCallback(() => {
    const index = indexRef.current;
    const chunk = chunksRef.current[index];
    if (!chunk?.files) return;
    const files = chunk.files;
    setState((s) => ({ ...s, phase: 'sharing' }));

    shareFiles(files).then((outcome) => {
      if (chunksRef.current[index] !== chunk) return; // cancelled meanwhile

      if (outcome === 'cancelled') {
        // Sheet dismissed — keep the chunk so the user can tap again
        setState((s) => ({ ...s, phase: 'ready' }));
        return;
      }

      if (outcome === 'failed' && files.length > 1) {
        // Some browsers reject multi-file shares — retry one photo per tap, no re-fetch
        const singles: Chunk[] = chunk.items.map((item, i) => ({ items: [item], files: [files[i]] }));
        chunksRef.current.splice(index, 1, ...singles);
        void prepareChunk(index);
        return;
      }

      if (outcome === 'failed') {
        // Last resort: regular download (iOS puts it in the Files app)
        anchorDownload(files[0], files[0].name);
      }

      const ids = chunk.items.map((item) => item.id);
      markManyAsDownloaded(ids);
      onSavedRef.current?.(ids);
      chunk.files = undefined; // release memory
      setState((s) => ({ ...s, savedCount: s.savedCount + ids.length }));
      void prepareChunk(index + 1);
    });
  }, [prepareChunk]);

  const cancel = useCallback(() => finish('cancelled'), [finish]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  return useMemo(() => ({ state, start, saveNow, cancel }), [state, start, saveNow, cancel]);
}
