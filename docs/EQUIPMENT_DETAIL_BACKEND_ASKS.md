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

**Status: small. The capability already exists on the sibling route.**

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

- [ ] `PATCH /equipment/{id}/files/{fileId}` updates `caption`, returns the file.
- [ ] UI wires `equipmentFilesApi.patch` and makes the video caption editable in the
      lightbox (currently read-only).

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

## Ask 3 — Equipment-scoped activity feed (read endpoint)

**Status: events are partly specced already; the read endpoint is the gap.**

### Why

Every other detail page (Location, Customer, Work Order) has an Activity tab. The
equipment detail page deliberately ships **without** one — there's a placeholder
comment (`an Activity tab is pending an equipment-scoped activity API`) because there
is no way to read the activity stream for a single piece of equipment.

The *events* largely exist or are already asked for: `EQUIPMENT_IMAGE_ADDED` /
`_DELETED` / `EQUIPMENT_PROFILE_IMAGE_CHANGED` are specced in
`EQUIPMENT_IMAGES_BACKEND_ASK.md` §9, and work-item `equipmentId` change/create
events are in `EQUIPMENT_BACKEND_ASK.md` §3.8. What's missing is a **read endpoint
scoped to an equipment id** that aggregates them.

### Ask

```
GET /equipment/{id}/activity?page=0&size=25
Response: Page<ActivityEvent>     // newest first
```

Should surface, for that equipment:
- Work orders / work items that linked or unlinked this equipment.
- Field edits on the equipment (make/model/serial/status/location-on-site/etc.).
- Media changes (image added/deleted, profile changed; video added/deleted).
- Filter add/edit/delete (once the Phase-2 filters sub-resource ships).

Reuse the existing `ActivityEvent` shape the other activity feeds already return so
the UI can reuse its activity-row rendering. If there's already a generic audit
endpoint that can be filtered by entity type + id (e.g. `/audit/Equipment/{id}`),
pointing the UI at that is just as good — the constraint is an equipment-scoped,
paged, newest-first read.

### Acceptance

- [ ] Equipment-scoped, paged activity read endpoint returning `ActivityEvent[]`.
- [ ] Covers WO-link, field-edit, media, and (later) filter events.
- [ ] UI adds the Activity tab to the equipment detail page.

---

## Not an ask — already provided

- **`WorkOrderSummary.summary`** (the AI/derived "Work" blurb the Service History tab
  and lists lead with) is **already sent** by the backend; only the TypeScript field
  declaration is pending on the FE side (lands with `feat/wo-summary-in-list`). No
  backend work needed.
