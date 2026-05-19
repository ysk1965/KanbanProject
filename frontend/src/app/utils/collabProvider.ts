import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';

const MSG_SYNC_FULL = 0;
const MSG_SYNC_UPDATE = 1;
const MSG_AWARENESS = 2;
const MSG_SNAPSHOT_UPDATED = 3;

export type CollabStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Custom Yjs WebSocket provider for real-time note collaboration.
 *
 * Uses a simple binary protocol:
 *   [0, ...state]     Full Y.Doc state (persistence / initial sync)
 *   [1, ...update]    Incremental Y.Doc update
 *   [2, ...awareness] Awareness update (cursors, presence)
 *
 * Connects to: /ws-collab/{noteId}?token={jwt}
 */
export class CollabProvider {
  private ws: WebSocket | null = null;
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  private noteId: string;
  private wsUrl: string;
  private statusListeners = new Set<(status: CollabStatus) => void>();
  private snapshotListeners = new Set<() => void>();
  private syncedListeners = new Set<() => void>();
  private hasSynced = false;
  private status: CollabStatus = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldConnect = true;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private fullStatePersistTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private readOnly = false;

  private static readonly RECONNECT_BASE_DELAY = 1000;
  private static readonly RECONNECT_MAX_DELAY = 30_000;
  private static readonly RECONNECT_JITTER_MAX = 1000;
  private static readonly AUTO_SAVE_INTERVAL = 30_000;
  // MSG_SYNC_UPDATE is relay-only on the server; storedState is only refreshed
  // by MSG_SYNC_FULL. Without this debounce the server's persisted draft only
  // advances every 30s, so a hard disconnect between heartbeats can lose the
  // latest edits.
  private static readonly FULL_STATE_DEBOUNCE = 1500;

  constructor(noteId: string, doc: Y.Doc, user: { name: string; color: string }) {
    this.noteId = noteId;
    this.doc = doc;
    this.awareness = new awarenessProtocol.Awareness(doc);
    this.awareness.setLocalStateField('user', user);

    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
    const wsBase = baseUrl
      .replace('/api/v1', '')
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');
    const token = localStorage.getItem('access_token');
    this.wsUrl = `${wsBase}/ws-collab/${noteId}?token=${token}`;

    this.doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.shouldConnect = true;
    this.updateStatus('connecting');

    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.updateStatus('connected');
      if (!this.readOnly) {
        this.startAutoSave();
      }
      // Broadcast local awareness so others know we joined
      const update = awarenessProtocol.encodeAwarenessUpdate(
        this.awareness,
        [this.doc.clientID],
      );
      this.send(MSG_AWARENESS, update);
    };

    this.ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer);
      // A bare MSG_SYNC_FULL (1 byte, no payload) is the server's "initial sync
      // done, no stored state yet" signal — still valid, fire onSynced below.
      if (data.length < 1) return;

      const msgType = data[0];
      const payload = data.slice(1);

      switch (msgType) {
        case MSG_SYNC_FULL:
        case MSG_SYNC_UPDATE:
          if (payload.length > 0) {
            Y.applyUpdate(this.doc, payload, 'remote');
          }
          if (msgType === MSG_SYNC_FULL && !this.hasSynced) {
            this.hasSynced = true;
            this.syncedListeners.forEach((l) => l());
          }
          break;
        case MSG_AWARENESS:
          awarenessProtocol.applyAwarenessUpdate(this.awareness, payload, this);
          break;
        case MSG_SNAPSHOT_UPDATED:
          // Server signaled that someone hit "Save" — View clients refetch.
          this.snapshotListeners.forEach((l) => l());
          break;
      }
    };

    this.ws.onclose = () => {
      this.updateStatus('disconnected');
      this.stopAutoSave();
      if (this.shouldConnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will also fire
    };
  }

  disconnect(): void {
    this.shouldConnect = false;
    this.stopAutoSave();
    this.stopFullStatePersist();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Persist full state before leaving (skip in readOnly to avoid clobbering server state)
    if (!this.readOnly) {
      this.sendFullState();
    }
    // Remove awareness so others know we left
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'disconnect');

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateStatus('disconnected');
  }

  destroy(): void {
    this.disconnect();
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.awareness.destroy();
    this.statusListeners.clear();
    this.snapshotListeners.clear();
    this.syncedListeners.clear();
  }

  onStatusChange(listener: (status: CollabStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  onSnapshotUpdated(listener: () => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  /**
   * Fires once the initial server sync is complete. If sync already happened
   * before the listener was added, fires immediately on the next microtask so
   * late subscribers don't miss it. Used to safely decide whether to hydrate
   * the Y.Doc from the published snapshot (only when sync confirms Yjs is
   * truly empty, not when our timer guesses too early).
   */
  onSynced(listener: () => void): () => void {
    if (this.hasSynced) {
      Promise.resolve().then(listener);
    } else {
      this.syncedListeners.add(listener);
    }
    return () => this.syncedListeners.delete(listener);
  }

  /** Send full Y.Doc state for server-side persistence */
  sendFullState(): void {
    if (this.readOnly) return;
    const state = Y.encodeStateAsUpdate(this.doc);
    this.send(MSG_SYNC_FULL, state);
  }

  /**
   * Toggle read-only mode. In read-only mode the client still receives remote
   * updates and awareness, but does not auto-save, does not send local doc
   * updates, and does not flush full state on disconnect.
   */
  setReadOnly(readOnly: boolean): void {
    if (this.readOnly === readOnly) return;
    this.readOnly = readOnly;
    if (readOnly) {
      this.stopAutoSave();
      this.stopFullStatePersist();
    } else if (this.status === 'connected') {
      this.startAutoSave();
    }
  }

  private send(type: number, payload: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = new Uint8Array(1 + payload.length);
    msg[0] = type;
    msg.set(payload, 1);
    this.ws.send(msg);
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === 'remote') return;
    if (this.readOnly) return;
    this.send(MSG_SYNC_UPDATE, update);
    this.scheduleFullStatePersist();
  };

  private handleAwarenessUpdate = ({ added, updated, removed }: {
    added: number[];
    updated: number[];
    removed: number[];
  }): void => {
    const changedClients = [...added, ...updated, ...removed];
    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
    this.send(MSG_AWARENESS, update);
  };

  private getReconnectDelay(): number {
    const exponential = Math.min(
      CollabProvider.RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempt),
      CollabProvider.RECONNECT_MAX_DELAY,
    );
    const jitter = Math.random() * CollabProvider.RECONNECT_JITTER_MAX;
    return exponential + jitter;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.getReconnectDelay();
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startAutoSave(): void {
    this.stopAutoSave();
    this.autoSaveTimer = setInterval(() => {
      this.sendFullState();
    }, CollabProvider.AUTO_SAVE_INTERVAL);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private scheduleFullStatePersist(): void {
    if (this.fullStatePersistTimer) clearTimeout(this.fullStatePersistTimer);
    this.fullStatePersistTimer = setTimeout(() => {
      this.fullStatePersistTimer = null;
      this.sendFullState();
    }, CollabProvider.FULL_STATE_DEBOUNCE);
  }

  private stopFullStatePersist(): void {
    if (this.fullStatePersistTimer) {
      clearTimeout(this.fullStatePersistTimer);
      this.fullStatePersistTimer = null;
    }
  }

  private updateStatus(status: CollabStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusListeners.forEach((l) => l(status));
    }
  }
}
