import apiClient from './client';
import type { Page } from './workOrderApi';

// ─────────────────────────────────────────────────────────────────────────
// Files — photos, videos, and documents anchored to locations, work orders,
// equipment. (Videos are work-order-domain only — see FileKind below.)
//
// Two backends share one wire convention:
//  · customer-service  → /service-locations/{id}/files (direct site uploads,
//    incl. the location profile picture)
//  · work-order-service → /files?serviceLocationId= (the location AGGREGATE:
//    every job-born / equipment-anchored file at the site)
//
// Upload everywhere is the 3-step direct-to-S3 flow (request presigned URL →
// PUT bytes → confirm); unconfirmed uploads are GC'd server-side (~30 min).
// `url` / `thumbnailUrl` are presigned reads (~60 min TTL) — never cache them
// across navigations; refetch the list instead.
// ─────────────────────────────────────────────────────────────────────────

export const FILE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const FILE_CAPTION_MAX_CHARS = 200;
export const FILE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type FileContentType = (typeof FILE_CONTENT_TYPES)[number];

// Office + text/CSV document types both file stores accept on top of
// images/PDF. All classify server-side as kind DOCUMENT and come back as
// downloads (Content-Disposition: attachment) — never inline previews. Send
// the exact MIME as the upload-url contentType (the S3 PUT must match it).
export const OFFICE_DOC_CONTENT_TYPES = [
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;
export type OfficeDocContentType = (typeof OFFICE_DOC_CONTENT_TYPES)[number];

// Video uploads (work-order-domain routes only). iPhone .mov → video/quicktime,
// Android → video/mp4. The PUT's Content-Type must match the declared type
// exactly or S3 rejects the presigned upload with 403.
export const VIDEO_CONTENT_TYPES = ['video/mp4', 'video/quicktime'] as const;
export type VideoContentType = (typeof VIDEO_CONTENT_TYPES)[number];
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100 MB (vs 25 MB for photos/PDFs)

// Derived server-side from contentType: images → PHOTO, videos → VIDEO,
// PDFs → DOCUMENT. Videos are work-order-domain only (born on a job / against
// equipment); direct site uploads stay photos + PDFs.
export type FileKind = 'PHOTO' | 'VIDEO' | 'DOCUMENT';

// Transcode lifecycle. Photos/PDFs are always READY; a video sits at PROCESSING
// (~30–60s, no poster yet) after confirm, then flips to READY — poll the list
// while any tile is PROCESSING. FAILED videos are hidden from lists server-side.
export type FileStatus = 'READY' | 'PROCESSING' | 'FAILED';

/** Aggregate counts for the Files type filter (All / Photos / Videos / Documents).
 *  Always anchor-wide — independent of the list's `kind` filter. */
export interface FileCounts {
  all: number;
  photos: number;
  videos: number;
  documents: number;
}

/** Standard Spring page envelope plus the top-level `counts` aggregate. */
export interface PagedFiles<T> extends Page<T> {
  counts: FileCounts;
}

export interface ListFilesParams {
  kind?: FileKind;
  /** 1-indexed (unlike most Spring endpoints here). Default 1. */
  page?: number;
  /** Default 50, max 100. */
  limit?: number;
}

/** Direct upload categories (location/customer files only; validated server-side). */
export const LOCATION_FILE_CATEGORIES = [
  'ACCESS',
  'SITE_MAP',
  'COI',
  'WARRANTY',
  'PERMIT',
  'CONTRACT',
  'TAX_EXEMPT',
  'CREDIT_APP',
  'OTHER',
] as const;
export type LocationFileCategory = (typeof LOCATION_FILE_CATEGORIES)[number];

/** Human labels for the category chip / upload-dialog select. Lives beside the
 *  enum (not in a component file) so both the tab and the dialog can share it
 *  without tripping react-refresh's only-export-components rule. */
export const LOCATION_FILE_CATEGORY_LABELS: Record<LocationFileCategory, string> = {
  ACCESS: 'Access',
  SITE_MAP: 'Site map',
  COI: 'COI',
  WARRANTY: 'Warranty',
  PERMIT: 'Permit',
  CONTRACT: 'Contract',
  TAX_EXEMPT: 'Tax exempt',
  CREDIT_APP: 'Credit app',
  OTHER: 'Other',
};

/** customer-service CustomerFileDto — a direct site/customer upload. */
export interface LocationFile {
  id: string;
  customerId: string;
  // Null = customer-level document; non-null = location file.
  serviceLocationId: string | null;
  kind: FileKind;
  fileName: string;
  url: string;
  thumbnailUrl: string | null;
  contentType: string;
  sizeBytes: number;
  widthPx: number | null;
  heightPx: number | null;
  thumbnailWidthPx: number | null;
  thumbnailHeightPx: number | null;
  // Location profile picture flag (location-scoped image files only).
  isProfile: boolean;
  category: LocationFileCategory | null;
  caption: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

// Before/After capture tag on work-order visit media. Work-order uploads only
// (equipment/agreement/location routes ignore it). Values are case-sensitive.
export type WorkOrderFileCaptureTag = 'BEFORE' | 'AFTER';

/** work-order-service FileDto — a file born on a job and/or anchored to
 *  equipment. At least one anchor is present; both may be. */
export interface WorkOrderFile {
  id: string;
  kind: FileKind;
  // PROCESSING videos appear in lists (poster pending); FAILED are hidden.
  status: FileStatus;
  fileName: string;
  // READY video = playable H.264 MP4 (every browser); else the original file.
  url: string;
  // VIDEO: server-generated poster frame — null while PROCESSING.
  thumbnailUrl: string | null;
  // VIDEO only — runtime in seconds for the m:ss duration badge; null otherwise.
  durationSeconds: number | null;
  contentType: string;
  sizeBytes: number;
  widthPx: number | null;
  heightPx: number | null;
  thumbnailWidthPx: number | null;
  thumbnailHeightPx: number | null;
  caption: string | null;
  // Provenance: the job the file was uploaded on.
  workOrderId: string | null;
  workOrderNumber: string | null;
  workItemId: string | null;
  // Capture event: the dispatch (visit / "trip") the file was captured on.
  // Null for non-trip captures. Soft key — tolerate an id matching no current
  // dispatch (group it under "Other", don't crash). Drives per-trip media
  // counts client-side (no stored count). Optional on the FE type so existing
  // location/equipment/agreement file mocks don't need backfilling; treat
  // undefined the same as null.
  dispatchId?: string | null;
  // Before/After label for visit photos/video. Null when untagged or not a
  // photo/video. Optional on the FE type (additive — existing files and
  // non-WO files come back without it); treat undefined the same as null.
  captureTag?: WorkOrderFileCaptureTag | null;
  // Subject: the asset the file depicts/documents.
  equipmentId: string | null;
  equipmentName: string | null;
  // Anchor for agreement-attached files (contracts, COIs). Null on job/equipment
  // files; agreement files are listed only by agreementId (see agreementFilesApi).
  agreementId: string | null;
  // Equipment profile image flag (equipment-anchored images only).
  isProfile: boolean;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface RequestFileUploadUrlResponse {
  fileId: string;
  uploadUrl: string;
  s3Key: string;
}

export interface RequestLocationFileUploadUrlRequest {
  contentType: string;
  sizeBytes: number;
  fileName: string;
  caption?: string | null;
  category?: LocationFileCategory | null;
}

// PATCH semantics: omitted key = unchanged (axios drops `undefined` on
// serialize); explicit null clears caption/category.
export interface PatchLocationFileRequest {
  caption?: string | null;
  category?: LocationFileCategory | null;
  isProfile?: boolean;
}

// Equipment file patch — caption only. The equipment files route exposes
// PATCH /equipment/{id}/files/{fileId} with a single media-agnostic caption
// column (videos patch identically to photos). Explicit null clears it.
export interface PatchEquipmentFileRequest {
  caption?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// work-order-service — the location aggregate read
// ─────────────────────────────────────────────────────────────────────────

export const filesApi = {
  /** Every job-born / equipment-anchored file at a location, newest first. */
  listForServiceLocation: async (
    serviceLocationId: string,
    params: ListFilesParams = {}
  ): Promise<PagedFiles<WorkOrderFile>> => {
    const response = await apiClient.get<PagedFiles<WorkOrderFile>>('/files', {
      params: { serviceLocationId, ...params },
    });
    return response.data;
  },
};

// Shared direct-to-S3 PUT (fetch, not apiClient — no JWT on the presigned URL).
// The Content-Type must match the upload-url request exactly (403 otherwise).
async function putToS3(uploadUrl: string, contentType: string, file: File | Blob): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!res.ok) throw new Error(`S3 upload failed with ${res.status}`);
}

export interface RequestEquipmentFileUploadUrlRequest {
  contentType: string;
  sizeBytes: number;
  fileName: string;
  caption?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// work-order-service — files anchored directly to an equipment record. Same
// 3-step presigned flow; videos confirm as PROCESSING then transcode. (This is
// the NEW /equipment/{id}/files route — distinct from equipmentApi's older
// /equipment/{id}/images, which is photos-only and has no video/processing.)
// ─────────────────────────────────────────────────────────────────────────
export const equipmentFilesApi = {
  list: async (
    equipmentId: string,
    params: ListFilesParams = {}
  ): Promise<PagedFiles<WorkOrderFile>> => {
    const response = await apiClient.get<PagedFiles<WorkOrderFile>>(
      `/equipment/${equipmentId}/files`,
      { params }
    );
    return response.data;
  },

  requestUploadUrl: async (
    equipmentId: string,
    request: RequestEquipmentFileUploadUrlRequest
  ): Promise<RequestFileUploadUrlResponse> => {
    const response = await apiClient.post<RequestFileUploadUrlResponse>(
      `/equipment/${equipmentId}/files/upload-url`,
      request
    );
    return response.data;
  },

  confirm: async (equipmentId: string, fileId: string): Promise<WorkOrderFile> => {
    const response = await apiClient.post<WorkOrderFile>(
      `/equipment/${equipmentId}/files/${fileId}/confirm`
    );
    return response.data;
  },

  /** Orchestrates the 3-step upload (request → PUT → confirm). */
  upload: async (
    equipmentId: string,
    file: File,
    options: {
      caption?: string | null;
      onProgress?: (stage: 'requesting' | 'uploading' | 'confirming') => void;
    } = {}
  ): Promise<WorkOrderFile> => {
    options.onProgress?.('requesting');
    const { fileId, uploadUrl } = await equipmentFilesApi.requestUploadUrl(equipmentId, {
      contentType: file.type,
      sizeBytes: file.size,
      fileName: file.name,
      caption: options.caption ?? null,
    });
    options.onProgress?.('uploading');
    await putToS3(uploadUrl, file.type, file);
    options.onProgress?.('confirming');
    return equipmentFilesApi.confirm(equipmentId, fileId);
  },

  delete: async (equipmentId: string, fileId: string): Promise<void> => {
    await apiClient.delete(`/equipment/${equipmentId}/files/${fileId}`);
  },

  /** Update a file's caption (max 200 chars). Same route + column for photos and
   *  videos; explicit null clears it. */
  patch: async (
    equipmentId: string,
    fileId: string,
    request: PatchEquipmentFileRequest
  ): Promise<WorkOrderFile> => {
    const response = await apiClient.patch<WorkOrderFile>(
      `/equipment/${equipmentId}/files/${fileId}`,
      request
    );
    return response.data;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// work-order-service — files born on a work order (the WO Files tab read).
// Same 3-step presigned flow as equipment files, at /work-orders/{id}/files.
// Upload + patch additionally carry `dispatchId` (the capture-visit / "trip"
// anchor) so per-trip media counts derive client-side from the graph.
// ─────────────────────────────────────────────────────────────────────────
export interface RequestWorkOrderFileUploadUrlRequest {
  contentType: string;
  sizeBytes: number;
  fileName: string;
  caption?: string | null;
  // Tag the upload to the visit it was captured on. Optional.
  dispatchId?: string | null;
  // Before/After tag for the captured photo/video. Optional.
  captureTag?: WorkOrderFileCaptureTag | null;
}

// PATCH semantics: omitted key = unchanged; explicit null clears.
// `dispatchId` and `captureTag` are tri-state (omit / null / set) to retag a
// file's visit or Before/After label.
export interface PatchWorkOrderFileRequest {
  caption?: string | null;
  dispatchId?: string | null;
  captureTag?: WorkOrderFileCaptureTag | null;
}

export const workOrderFilesApi = {
  list: async (
    workOrderId: string,
    params: ListFilesParams = {}
  ): Promise<PagedFiles<WorkOrderFile>> => {
    const response = await apiClient.get<PagedFiles<WorkOrderFile>>(
      `/work-orders/${workOrderId}/files`,
      { params }
    );
    return response.data;
  },

  requestUploadUrl: async (
    workOrderId: string,
    request: RequestWorkOrderFileUploadUrlRequest
  ): Promise<RequestFileUploadUrlResponse> => {
    const response = await apiClient.post<RequestFileUploadUrlResponse>(
      `/work-orders/${workOrderId}/files/upload-url`,
      request
    );
    return response.data;
  },

  confirm: async (workOrderId: string, fileId: string): Promise<WorkOrderFile> => {
    const response = await apiClient.post<WorkOrderFile>(
      `/work-orders/${workOrderId}/files/${fileId}/confirm`
    );
    return response.data;
  },

  /** Orchestrates the 3-step upload (request → PUT → confirm). */
  upload: async (
    workOrderId: string,
    file: File,
    options: {
      caption?: string | null;
      dispatchId?: string | null;
      captureTag?: WorkOrderFileCaptureTag | null;
      onProgress?: (stage: 'requesting' | 'uploading' | 'confirming') => void;
    } = {}
  ): Promise<WorkOrderFile> => {
    options.onProgress?.('requesting');
    const { fileId, uploadUrl } = await workOrderFilesApi.requestUploadUrl(workOrderId, {
      contentType: file.type,
      sizeBytes: file.size,
      fileName: file.name,
      caption: options.caption ?? null,
      dispatchId: options.dispatchId ?? null,
      captureTag: options.captureTag ?? null,
    });
    options.onProgress?.('uploading');
    await putToS3(uploadUrl, file.type, file);
    options.onProgress?.('confirming');
    return workOrderFilesApi.confirm(workOrderId, fileId);
  },

  delete: async (workOrderId: string, fileId: string): Promise<void> => {
    await apiClient.delete(`/work-orders/${workOrderId}/files/${fileId}`);
  },

  patch: async (
    workOrderId: string,
    fileId: string,
    request: PatchWorkOrderFileRequest
  ): Promise<WorkOrderFile> => {
    const response = await apiClient.patch<WorkOrderFile>(
      `/work-orders/${workOrderId}/files/${fileId}`,
      request
    );
    return response.data;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// work-order-service — files attached directly to an agreement record
// (contracts, COIs, photos/videos). Same 3-step presigned flow as equipment
// files, at /work-orders/agreements/{id}/files. Listed only by agreementId —
// an agreement spans many locations, so these intentionally don't appear in
// the location Files aggregate.
// ─────────────────────────────────────────────────────────────────────────
export const agreementFilesApi = {
  list: async (
    agreementId: string,
    params: ListFilesParams = {}
  ): Promise<PagedFiles<WorkOrderFile>> => {
    const response = await apiClient.get<PagedFiles<WorkOrderFile>>(
      `/work-orders/agreements/${agreementId}/files`,
      { params }
    );
    return response.data;
  },

  requestUploadUrl: async (
    agreementId: string,
    request: RequestEquipmentFileUploadUrlRequest
  ): Promise<RequestFileUploadUrlResponse> => {
    const response = await apiClient.post<RequestFileUploadUrlResponse>(
      `/work-orders/agreements/${agreementId}/files/upload-url`,
      request
    );
    return response.data;
  },

  confirm: async (agreementId: string, fileId: string): Promise<WorkOrderFile> => {
    const response = await apiClient.post<WorkOrderFile>(
      `/work-orders/agreements/${agreementId}/files/${fileId}/confirm`
    );
    return response.data;
  },

  /** Orchestrates the 3-step upload (request → PUT → confirm). */
  upload: async (
    agreementId: string,
    file: File,
    options: {
      caption?: string | null;
      onProgress?: (stage: 'requesting' | 'uploading' | 'confirming') => void;
    } = {}
  ): Promise<WorkOrderFile> => {
    options.onProgress?.('requesting');
    const { fileId, uploadUrl } = await agreementFilesApi.requestUploadUrl(agreementId, {
      contentType: file.type,
      sizeBytes: file.size,
      fileName: file.name,
      caption: options.caption ?? null,
    });
    options.onProgress?.('uploading');
    await putToS3(uploadUrl, file.type, file);
    options.onProgress?.('confirming');
    return agreementFilesApi.confirm(agreementId, fileId);
  },

  delete: async (agreementId: string, fileId: string): Promise<void> => {
    await apiClient.delete(`/work-orders/agreements/${agreementId}/files/${fileId}`);
  },

  /** Update a file's caption (max 200 chars); explicit null clears it. */
  patch: async (
    agreementId: string,
    fileId: string,
    request: PatchEquipmentFileRequest
  ): Promise<WorkOrderFile> => {
    const response = await apiClient.patch<WorkOrderFile>(
      `/work-orders/agreements/${agreementId}/files/${fileId}`,
      request
    );
    return response.data;
  },
};

// ─────────────────────────────────────────────────────────────────────────
// customer-service — direct site uploads on the location anchor
// ─────────────────────────────────────────────────────────────────────────

export const locationFilesApi = {
  list: async (
    locationId: string,
    params: ListFilesParams = {}
  ): Promise<PagedFiles<LocationFile>> => {
    const response = await apiClient.get<PagedFiles<LocationFile>>(
      `/service-locations/${locationId}/files`,
      { params }
    );
    return response.data;
  },

  requestUploadUrl: async (
    locationId: string,
    request: RequestLocationFileUploadUrlRequest
  ): Promise<RequestFileUploadUrlResponse> => {
    const response = await apiClient.post<RequestFileUploadUrlResponse>(
      `/service-locations/${locationId}/files/upload-url`,
      request
    );
    return response.data;
  },

  // Direct-to-S3 PUT using fetch (NOT the apiClient — we don't want our auth
  // interceptor adding the JWT to the S3 request). Same Content-Type as the
  // upload-url request; the presigned URL is only valid ~5 min.
  uploadToS3: async (uploadUrl: string, contentType: string, file: File | Blob): Promise<void> => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!res.ok) {
      throw new Error(`S3 upload failed with ${res.status}`);
    }
  },

  confirm: async (locationId: string, fileId: string): Promise<LocationFile> => {
    const response = await apiClient.post<LocationFile>(
      `/service-locations/${locationId}/files/${fileId}/confirm`
    );
    return response.data;
  },

  /** Orchestrates the 3-step upload. `onProgress` fires between steps so
   *  callers can render per-file status text. */
  upload: async (
    locationId: string,
    file: File,
    options: {
      caption?: string | null;
      category?: LocationFileCategory | null;
      onProgress?: (stage: 'requesting' | 'uploading' | 'confirming') => void;
    } = {}
  ): Promise<LocationFile> => {
    options.onProgress?.('requesting');
    const { fileId, uploadUrl } = await locationFilesApi.requestUploadUrl(locationId, {
      contentType: file.type,
      sizeBytes: file.size,
      fileName: file.name,
      caption: options.caption ?? null,
      category: options.category ?? null,
    });
    options.onProgress?.('uploading');
    await locationFilesApi.uploadToS3(uploadUrl, file.type, file);
    options.onProgress?.('confirming');
    return locationFilesApi.confirm(locationId, fileId);
  },

  patch: async (
    locationId: string,
    fileId: string,
    request: PatchLocationFileRequest
  ): Promise<LocationFile> => {
    const response = await apiClient.patch<LocationFile>(
      `/service-locations/${locationId}/files/${fileId}`,
      request
    );
    return response.data;
  },

  delete: async (locationId: string, fileId: string): Promise<void> => {
    await apiClient.delete(`/service-locations/${locationId}/files/${fileId}`);
  },
};

export default filesApi;
