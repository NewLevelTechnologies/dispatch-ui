import apiClient from './client';
import type { Page } from './workOrderApi';

// ─────────────────────────────────────────────────────────────────────────
// Files — photos + documents anchored to locations, work orders, equipment.
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

// Derived server-side from contentType: images → PHOTO, PDFs → DOCUMENT.
export type FileKind = 'PHOTO' | 'DOCUMENT';

/** Aggregate counts for the Files type filter (All / Photos / Documents).
 *  Always anchor-wide — independent of the list's `kind` filter. */
export interface FileCounts {
  all: number;
  photos: number;
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

/** work-order-service FileDto — a file born on a job and/or anchored to
 *  equipment. At least one anchor is present; both may be. */
export interface WorkOrderFile {
  id: string;
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
  caption: string | null;
  // Provenance: the job the file was uploaded on.
  workOrderId: string | null;
  workOrderNumber: string | null;
  workItemId: string | null;
  // Subject: the asset the file depicts/documents.
  equipmentId: string | null;
  equipmentName: string | null;
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
