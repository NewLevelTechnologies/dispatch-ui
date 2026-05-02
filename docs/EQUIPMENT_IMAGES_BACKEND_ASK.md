# Equipment images — backend ask

Backend ask for multi-image support on `Equipment`, with one image designated as the profile (cover) image. Targets `dispatch-api`.

`Equipment.profile_image_url` exists today as a single string column with no upload mechanism behind it. This ask replaces that single field with a proper images sub-resource so techs can attach multiple photos per piece of equipment (nameplate, compressor, before/after, etc.) and pick one to be the cover.

---

## 1. Why now

- Equipment Detail Page UI is being built and needs an image gallery + a profile image surface (list views, picker thumbnails).
- Field techs on mobile commonly take 3–10 photos per service — capping at one image is the wrong shape.
- The single `profile_image_url` column is unused (no UI writes to it). Cheaper to replace it now than to migrate later.

---

## 2. Design principles

- **Multiple images is the default cardinality; profile is a designation, not a separate field.** One images table, one row flagged as profile per equipment. Avoids divergence between `profile_image_url` and a hypothetical `images[]`.
- **Presigned-URL upload, not multipart through the API.** Field techs upload 3–10 MB phone photos over LTE; routing every byte through the API server is wasteful and slow. Logo uploads use multipart because they're tiny and rare; equipment images aren't.
- **Backend owns thumbnailing.** Return both `url` (original) and `thumbnailUrl` (resized) so list views and pickers don't hammer full-res phone photos. UI shouldn't be in the resize business.
- **Hard delete, no history.** A wrongly-uploaded image gets deleted, gone from S3. No "trash bin" workflow until a real need surfaces.

---

## 3. Schema

### 3.1 Drop `equipment.profile_image_url`

The column is unused. Remove it. The new `equipment_images.is_profile` flag replaces it.

If any production rows have non-null `profile_image_url` values (unlikely — no UI writes to it), seed an `equipment_images` row with `is_profile = true` for each before dropping the column.

### 3.2 New table

```sql
CREATE TABLE equipment_images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,

  -- Storage
  s3_key          TEXT NOT NULL,           -- e.g. tenants/{tenantId}/equipment/{equipmentId}/{uuid}.jpg
  thumbnail_s3_key TEXT NULL,              -- backend-generated thumbnail; null until processed
  content_type    TEXT NOT NULL,           -- image/jpeg, image/png, image/heic, image/webp
  size_bytes      BIGINT NOT NULL,

  -- Display
  is_profile      BOOLEAN NOT NULL DEFAULT false,
  sort_order      INT NOT NULL DEFAULT 0,
  caption         TEXT NULL,               -- optional, e.g. "Nameplate", "Compressor"

  -- Audit
  uploaded_by     UUID NULL,               -- user id; null if uploaded by system / migration
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_images_equipment ON equipment_images(equipment_id);
CREATE UNIQUE INDEX idx_equipment_images_one_profile_per_equipment
  ON equipment_images(equipment_id) WHERE is_profile = true;

ALTER TABLE equipment_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_images_tenant_isolation ON equipment_images
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

Notes:
- The partial unique index enforces "at most one profile image per equipment" — DB-level invariant, no application logic gymnastics needed.
- `s3_key` not the URL: keeps the bucket/region detail server-side; backend signs URLs at read time. Lets us migrate buckets / change CDN without touching rows.
- `ON DELETE CASCADE` from equipment — deleting equipment also deletes its images (and the S3 cleanup job runs on the cascade).

---

## 4. Upload flow

Two-step presigned-URL pattern. Recommended over multipart-through-API for the field-tech mobile case.

### 4.1 Request upload URL

```
POST /equipment/{id}/images/upload-url
Body: { contentType: "image/jpeg", sizeBytes: 2_400_000, caption?: "Nameplate" }
Response: {
  imageId: "uuid",
  uploadUrl: "https://...s3.amazonaws.com/...?X-Amz-Signature=...",  // presigned PUT, 5-min TTL
  s3Key: "tenants/.../equipment/.../uuid.jpg"
}
```

Backend creates the `equipment_images` row (status implicitly "pending"), generates the S3 key, returns a presigned PUT URL valid for ~5 minutes. The row exists but `thumbnail_s3_key` is null and the underlying S3 object hasn't been written yet.

### 4.2 UI uploads to S3 directly

The browser PUTs the file bytes to the presigned URL. No backend bandwidth used.

### 4.3 Confirm upload

```
POST /equipment/{id}/images/{imageId}/confirm
Response: EquipmentImage  // with thumbnailUrl populated (sync) or null (async)
```

Backend verifies the S3 object exists (HEAD request) and triggers thumbnail generation. Sync vs async is backend's call:
- **Sync** (block on confirm until thumbnail is ready) — simpler UI, slower confirm response.
- **Async** (return immediately, thumbnail populates later) — faster UX, UI needs to poll or refetch. If async, return `thumbnailUrl: null` initially and have the existing `EquipmentResponse` refetch pick it up.

Either is fine; UI can handle both. Just pick one and document.

### 4.4 Cleanup of orphans

Rows where `confirm` was never called within ~30 minutes should be cleaned up by a scheduled job. Otherwise abandoned uploads accumulate.

---

## 5. CRUD endpoints

```
GET    /equipment/{id}/images                   → EquipmentImage[]
POST   /equipment/{id}/images/upload-url        → upload URL flow above
POST   /equipment/{id}/images/{imageId}/confirm → finalize upload
PATCH  /equipment/{id}/images/{imageId}         → update caption, sort_order, is_profile
DELETE /equipment/{id}/images/{imageId}         → hard-delete row + S3 object
POST   /equipment/{id}/images/reorder           → bulk reorder (orderedIds: string[])
```

### 5.1 Setting profile image

`PATCH /equipment/{id}/images/{imageId}` with `{ isProfile: true }` should atomically:
1. Set the target image's `is_profile = true`
2. Set all other images for that equipment to `is_profile = false`

Wrapped in a transaction so the partial unique index never trips.

---

## 6. DTOs

**`EquipmentImage`** — returned from list/CRUD endpoints:

```jsonc
{
  "id": "...",
  "url": "https://cdn.../equipment/.../uuid.jpg?signed=...",  // signed read URL, ~1hr TTL
  "thumbnailUrl": "https://cdn.../equipment/.../uuid_thumb.jpg?signed=...|null",
  "contentType": "image/jpeg",
  "sizeBytes": 2400000,
  "isProfile": true,
  "sortOrder": 0,
  "caption": "Nameplate|null",
  "uploadedBy": "user-uuid|null",
  "uploadedByName": "Jane Smith|null",
  "createdAt": "2026-05-02T..."
}
```

**`EquipmentResponse`** — embed images:

```jsonc
{
  ...
  "images": [EquipmentImage, ...],     // sorted: profile first, then by sortOrder
  "profileImageUrl": "...|null",       // convenience: top-level pointer to the profile image's URL (read-only, derived)
}
```

The top-level `profileImageUrl` is a derived convenience for list endpoints / pickers that don't want to walk the array. It's NOT a column anymore — backend computes it from `images[].find(img => img.isProfile)?.url ?? null`.

**`EquipmentSummary`** (the list projection) — add `profileImageUrl?: string | null` for thumbnail display in the equipment list. Same derived value, batch-loaded with the rest of the summary.

---

## 7. Image processing

- **Accept:** `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`. HEIC is the iPhone default and field techs upload from phones.
- **Convert:** transcode HEIC → JPEG on the backend so browsers can render it. Original-quality JPEG saved alongside.
- **Thumbnail:** ~400px on the long edge, JPEG, ~80% quality. Stored at `{s3_key}_thumb.jpg` or in a separate `thumbnails/` prefix.
- **Max size:** reject uploads over ~25 MB at presigned-URL request time. (Phone HEICs are typically 3–8 MB; phone JPEGs 2–5 MB; 25 MB is generous headroom.)

---

## 8. Authorization

- Read images: any user with `VIEW_EQUIPMENT`.
- Upload / edit / delete: any user with `EDIT_EQUIPMENT`. Field techs need this — don't gate uploads behind admin-only capability.
- Cross-tenant isolation enforced at the row-level policy.

`uploaded_by` is captured for accountability/audit, not for "you can only delete your own uploads" gating. Office staff need to delete bad uploads from techs.

---

## 9. Activity events

When images change, emit a `WORK_ITEM_UPDATED`-style event on the parent equipment so it shows up in the activity feed. Suggested fields:

- `EQUIPMENT_IMAGE_ADDED` — `{ imageId, caption?, isProfile }`
- `EQUIPMENT_IMAGE_DELETED` — `{ imageId, caption? }`
- `EQUIPMENT_PROFILE_IMAGE_CHANGED` — `{ fromImageId?, toImageId }`

Captions are nicer than UUIDs in the activity feed; fall back to "image" if the caption is null.

---

## 10. Migration

```
1. Create equipment_images table per §3.2
2. Backfill: for any equipment row with a non-null profile_image_url:
   - INSERT INTO equipment_images (... is_profile=true ...)
   - The s3_key requires a parse of the existing URL — punt if backfill is non-trivial; the column is unused in production
3. Drop equipment.profile_image_url column
```

Rollback plan: if step 3 ships and breaks something, restore the column (data is null anyway) and have the UI fall back to the `images[]` array. Low-risk migration.

---

## 11. Out of scope / deferred

- **In-app editing (crop, rotate, annotate).** Phones already do this before upload.
- **EXIF metadata (GPS, timestamp, camera).** Strip on upload for privacy. Add back later only if a workflow needs it.
- **Image search / OCR (read serial numbers off nameplates).** Cool, separate effort.
- **Per-image versioning.** Re-upload to replace; no version history kept.
- **Bulk upload UI.** Single-file at a time is fine for now; the UI can sequence multiple files behind the scenes.
- **Sharing / public URLs.** All read URLs are signed and short-TTL'd; no anonymous access.

---

## 12. Phase 1 checklist

- [ ] `equipment_images` table per §3.2 with partial unique index for profile flag
- [ ] Drop `equipment.profile_image_url` column (after any backfill in §10)
- [ ] Presigned upload-URL endpoint per §4.1
- [ ] Confirm endpoint per §4.3 (sync or async; document choice)
- [ ] List / patch / delete / reorder endpoints per §5
- [ ] HEIC → JPEG transcode + thumbnail generation per §7
- [ ] `EquipmentImage` DTO + embed in `EquipmentResponse.images`
- [ ] `EquipmentResponse.profileImageUrl` derived convenience field
- [ ] `EquipmentSummary.profileImageUrl` for list views
- [ ] Activity events per §9
- [ ] Cleanup job for orphaned pending uploads per §4.4

UI work follows; tracked on the `dispatch-ui` side.
