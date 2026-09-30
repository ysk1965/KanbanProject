import { useEffect, useRef, useSyncExternalStore } from "react";
import { orgPhotoService } from "../utils/services";
import {
  PhotoUploadQueue,
  type PhotoUploadConfirmedListener,
  type PhotoUploadSnapshot,
  type PhotoUploadTarget,
} from "../utils/photoUploadQueue";

/** 큐 상태 구독 (useSyncExternalStore) */
export function usePhotoUploadQueue(queue: PhotoUploadQueue): PhotoUploadSnapshot {
  return useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
}

/** confirm 된 사진 묶음이 도착할 때마다 호출 (콜백은 최신 참조 유지) */
export function usePhotoUploadConfirmed(
  queue: PhotoUploadQueue,
  listener: PhotoUploadConfirmedListener,
): void {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(
    () => queue.onConfirmed((key, photos) => ref.current(key, photos)),
    [queue],
  );
}

// 관리자 업로드는 모달을 닫거나 탭을 옮겨도 계속되도록 조직별 모듈 스코프 큐를 쓴다.
const orgQueues = new Map<string, PhotoUploadQueue>();

export function getOrgPhotoUploadQueue(orgId: string): PhotoUploadQueue {
  let q = orgQueues.get(orgId);
  if (!q) {
    q = new PhotoUploadQueue();
    orgQueues.set(orgId, q);
  }
  return q;
}

export function orgPhotoUploadTarget(orgId: string, tabId: string): PhotoUploadTarget {
  return {
    key: tabId,
    presign: (files) => orgPhotoService.presignPhotoUpload(orgId, tabId, files),
    confirm: (items) => orgPhotoService.confirmPhotoUpload(orgId, tabId, items),
    uploadDirect: (files) => orgPhotoService.uploadPhotos(orgId, tabId, files),
  };
}
