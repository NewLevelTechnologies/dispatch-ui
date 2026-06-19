# Equipment detail page — backend asks

Asks surfaced while building the equipment detail page tabs (service history, media)
and the unified media lightbox. Targets `dispatch-api` (work-order-service, where
equipment + work orders + equipment files live).

These are independent — ship in any order. Each names the UI surface it unblocks so
the backend isn't shipping into emptiness. The model/CRUD/images foundations are
already covered by `EQUIPMENT_BACKEND_ASK.md` and `EQUIPMENT_IMAGES_BACKEND_ASK.md`;
this doc is only the gaps the detail-page work hit.

---

## Ask 1 — Caption update for equipment files (videos)

**Status: RESOLVED.** Backend confirmed `PATCH /equipment/{id}/files/{fileId}` already
exists (single media-agnostic caption column — videos patch identically to photos), so
no backend change was needed. FE wired `equipmentFilesApi.patch` and made video captions
editable in the media lightbox (branch `fix/equipment-video-caption-edit`).

### Why

The equipment Media tab + the new unified media lightbox let a user edit a photo's
caption inline (`PATCH /equipment/{id}/images/{imageId}`). Videos render in the same
lightbox but their caption is **read-only** — there's no equipment-files patch
endpoint, so a CSR can't label a clip ("Outdoor condenser, bad fan motor"). Photos
and videos sit side by side in one gallery; the asymmetry is visible and odd.

The file entity already has a `caption` column and the **location** files route
already exposes a patch for it (`PATCH /service-locations/{id}/files/{fileId}` with
`{ caption, category }`, consumed by `locationFilesApi.patch`). Equipment videos are
the same `/files` aggregate — they just lack the patch on the equipment route.

### Ask

```
PATCH /equipment/{id}/files/{fileId}
Body: { caption?: string | null }     // explicit null clears the caption
Response: WorkOrderFile               // the updated file
```

- Mirror the existing location file patch (same entity, same `caption` column).
- `category` not needed for equipment files unless it's trivially free to include.
- Authorization: same as equipment edit (`EDIT_EQUIPMENT`).

### Acceptance

- [x] `PATCH /equipment/{id}/files/{fileId}` updates `caption`, returns the file. *(already existed)*
- [x] UI wires `equipmentFilesApi.patch` and makes the video caption editable in the lightbox.

---

## Ask 2 — ~~Logged labor hours on the work-order summary~~ (withdrawn — no backend needed)

**Resolved on the UI side. No backend work.**

The Service History tab + overview peek briefly carried an **Hours** column that
rendered `—` for every row — there's no labor-time field anywhere on the work-order
summary (no `laborHours` / `loggedHours` / `timeEntry` concept in the API).

Rather than ask the backend for a time-tracking model, the column was **removed**:
logged labor is a financial/payroll concern, not something a CSR needs while reading
a unit's service history. It was **replaced with a Type column** (the work-order
type, shown with its accent color) — which the summary already carries
(`workOrderTypeId`, resolved via the existing `GET /work-order/types`) and which
actually characterizes each visit (PM vs repair vs install). No backend change.

---

## Ask 3 — ~~Equipment-scoped activity feed~~ (withdrawn — not needed)

**Dropped.** We decided an Activity tab on the equipment detail page isn't needed, so
there's no ask for an equipment-scoped activity/audit read endpoint. (The image/WO-link
events specced in the other docs still stand for their own surfaces; this was only the
equipment-detail read endpoint, which we're not pursuing.)

---

## Resolved — dispatch type pill (scheduling-service)

The dispatch type pill (location dispatch rows + the dispatch board) rendered grey and
unlabeled. Root cause: the row's `workOrderTypeName` is published `null` today (a latent
gap). Backend now returns **`workOrderTypeId`** on `/dispatch/board/search` and
`/locations/{id}/dispatches/paginated`, so the FE resolves the pill's color + label from
the WO-type catalog (`GET /work-orders/config/types`) by that id — same as every other
WO list. Wired on branch `fix/dispatch-type-pill-color`. No further backend work.

---

## Not an ask — already provided

- **`WorkOrderSummary.summary`** (the AI/derived "Work" blurb the Service History tab
  and lists lead with) is **already sent** by the backend; only the TypeScript field
  declaration is pending on the FE side (lands with `feat/wo-summary-in-list`). No
  backend work needed.
