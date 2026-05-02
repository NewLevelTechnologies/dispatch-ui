# Equipment model — backend ask

Backend ask to unblock Phase 4's equipment typeahead in `WorkItemFormDialog` and lay a coherent foundation for the equipment model the UI will grow into. Targets `dispatch-api`.

The doc is one design with two phases. **Phase 1** is what the backend should ship now — it unblocks the typeahead, gives the UI a real model to build against, and lands the cross-cutting schema choices (taxonomy shape, attribute storage, hierarchy) at a point where they're cheap to land. **Phase 2** is a follow-up ask that ships alongside the equipment-edit UI — those pieces exist as table-stakes design but should not be built until the UI for them is queued.

---

## 1. Why now

- Phase 4 of `WORK_ORDER_DETAIL_DESIGN.md` shipped without the equipment typeahead because `WorkItem` has no FK to `Equipment`. We're ready to wire it.
- More importantly, we're using this moment to design the equipment model rather than copy-paste the legacy schema. Two legacy apps use 1:1 work-item-to-equipment with type/category taxonomies; the newer one adds parent/child "system + units". Those patterns hold up and inform Phase 1's structural choices.

---

## 1.5 Service ownership

Equipment lives in `work-order-service`, in the same database schema (`work_order_schema`) as `work_orders` and `work_items`. The pre-existing `equipment-service` directory will be renamed to `inventory-service` — preserving the infrastructure skeleton (ECR, ECS, CI/CD) for future inventory workflows (Warehouse, PartsInventory) when those have UI driving them.

---

## 2. Design principles

- **Differentiate "single-valued display attributes" from "things that drive aggregate reports / inventory / replacement workflows".** First get plain columns or JSONB; second earn their own table. Why filters get a sub-entity (Phase 2) and tonnage doesn't.
- **Avoid hardcoding HVAC-isms onto every tenant's schema.** A pure-restaurant or pure-plumbing tenant should not see Tonnage and Refrigerant columns. JSONB attributes (now) → per-type custom field schemas (later) is the path.
- **Keep work-item ↔ equipment cardinality at N:1.** Each work item targets at most one equipment; multi-equipment jobs are expressed by adding multiple work items. Both legacy apps do this; modern systems agree.
- **Two levels of equipment hierarchy is the sweet spot.** "System + units." Schema supports N levels via `parentId`; UI renders 2 by default. Deeper trees are overkill for service trades.
- **Land structural choices in Phase 1; defer machinery whose UI doesn't exist yet.** Taxonomy shape (types vs types+categories) and hierarchy (`parent_id`) have asymmetric migration cost — late changes are tenant-data migrations, not column adds. Filter machinery and warranty fields don't have that asymmetry; defer them.

---

## 3. Phase 1 — ships now

### 3.1 Equipment table

```sql
CREATE TABLE equipment (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  
  -- Basic identification
  name                  TEXT NOT NULL,
  description           TEXT NULL,
  make                  TEXT NULL,
  model                 TEXT NULL,
  serial_number         TEXT NULL,
  asset_tag             TEXT NULL,
  
  -- Taxonomy & hierarchy
  parent_id             UUID NULL REFERENCES equipment(id),
  equipment_type_id     UUID NULL REFERENCES equipment_types(id),
  equipment_category_id UUID NULL REFERENCES equipment_categories(id),
  
  -- Location
  service_location_id   UUID NOT NULL,  -- references ServiceLocationCache (event-driven cache from customer-service)
  location_on_site      TEXT NULL,
  
  -- Lifecycle
  install_date          DATE NULL,
  last_serviced_at      TIMESTAMP NULL,
  status                TEXT NOT NULL DEFAULT 'ACTIVE',
  
  -- Media & attributes
  profile_image_url     TEXT NULL,
  attributes            JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Audit
  created_at            TIMESTAMP NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_tenant_id ON equipment(tenant_id);
CREATE INDEX idx_equipment_service_location_id ON equipment(service_location_id);
CREATE INDEX idx_equipment_parent_id ON equipment(parent_id);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_tenant_isolation ON equipment
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

Notes:
- `service_location_id` is required — equipment must exist at a service location. References `service_location_cache.id` (work-order-service already caches service locations via events from customer-service, same pattern as customers).
- `status` is `ACTIVE` or `RETIRED` (string, not enum, to allow tenant-specific statuses later if needed).
- GIN index on `attributes` deferred until JSONB queries appear.
- Multi-tenant FK constraints enforced via application logic (equipment references within same tenant).
- Hierarchy support via `parent_id` — no tree-traversal endpoints until UI demands them.

### 3.2 New column on `work_items`

```sql
ALTER TABLE work_items
  ADD COLUMN equipment_id UUID NULL REFERENCES equipment(id);
```

Nullable — labor-only work items have no equipment. Index on `equipment_id`. Tenant-scope check: equipment's `tenant_id` matches the work item's.

### 3.3 New tables: equipment taxonomies

```sql
CREATE TABLE equipment_types (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMP NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE equipment_categories (
  id                 UUID PRIMARY KEY,
  tenant_id          UUID NOT NULL,
  equipment_type_id  UUID NOT NULL REFERENCES equipment_types(id),
  name               TEXT NOT NULL,
  sort_order         INT NOT NULL DEFAULT 0,
  archived_at        TIMESTAMP NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT now(),
  updated_at         TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, equipment_type_id, name)
);
```

Mirrors `work_order_types` / `divisions` (tenant-scoped, archivable, sort-ordered). Categories belong to a Type — a pure-HVAC tenant has one Type with many Categories; a multi-trade tenant has many Types.

CRUD endpoints for both, mirroring existing taxonomy admin endpoints. Settings-UI work to expose them is a UI-side follow-up, not part of this ask.

**Why both tables in Phase 1 and not `equipment_types` only:** the migration asymmetry is what flips it. Tenants given only a flat type field will create rows like "HVAC - Furnace", "HVAC - Condenser", "HVAC - Air Handler" — flattening the hierarchy into the type name as a workaround. When categories land later, splitting flattened type names into proper type+category rows is a per-tenant data-cleanup project, not an `ALTER TABLE`. The cost of shipping `equipment_categories` now is one mirror table; the cost of deferring it is paid in tenant data shape.

### 3.4 DTOs

**`EquipmentResponse`** — full record for the equipment detail page:

```jsonc
{
  "id": "...",
  "name": "...",
  "description": "...",
  "make": "...",
  "model": "...",
  "serialNumber": "...",
  "assetTag": "...",                     // QR / barcode

  "parentId": "...|null",
  "equipmentTypeId": "...|null",
  "equipmentTypeName": "HVAC|null",      // resolved server-side
  "equipmentCategoryId": "...|null",
  "equipmentCategoryName": "Furnace|null",

  "serviceLocationId": "...",
  "locationOnSite": "Basement|null",

  "installDate": "2024-03-15|null",
  "lastServicedAt": "...|null",
  "status": "ACTIVE|RETIRED",
  "profileImageUrl": "...|null",

  "attributes": { ... }                  // trade-specific values: tonnage, refrigerant, breakerSize, voltage, etc.
}
```

**`EquipmentSummary`** — projection for picker results and nested `WorkItemResponse.equipment`:

```jsonc
{
  "id": "...",
  "name": "2-ton Upstairs system",
  "equipmentTypeName": "HVAC|null",
  "equipmentCategoryName": "Furnace|null",
  "make": "...|null",
  "model": "...|null",
  "serialNumber": "...|null",
  "locationOnSite": "Basement|null"
}
```

**`WorkItemResponse`** — add `equipment: EquipmentSummary | null`.

**`CreateWorkItemRequest` / `UpdateWorkItemRequest`** — add `equipmentId: UUID | null`. Explicit `null` on update clears the link.

**`CreateEquipmentRequest`** — required: `name`, `serviceLocationId`. Everything else optional. See §3.7.

### 3.5 Search endpoint for the picker

```
GET /equipment?serviceLocationId={id}&search={text}&status=ACTIVE&limit=20
```

- `serviceLocationId` — required-ish; the work-item dialog always has it. Support `customerId` as an alternate scope if equipment can exist customer-wide rather than location-scoped.
- `search` — case-insensitive substring on `name`, `serial_number`, `model`, `asset_tag`. Trigram index nice-to-have; not required initially.
- `status` filter, default `ACTIVE`. Retired equipment shouldn't show up in the picker.
- Returns `EquipmentSummary[]`.

If a similar endpoint already exists with a different shape, point the UI at it and we'll mirror that.

### 3.6 `last_serviced_at` maintenance mechanism

`last_serviced_at` is a denormalization, not just storage — the backend has to keep it current or it ships always-null. **Spec the mechanism:**

Recommended approach: when a `WorkItem` transitions into a status whose `progressCategory = 'COMPLETED'`, update `equipment.last_serviced_at = MAX(equipment.last_serviced_at, transition_timestamp)` for the linked equipment, if any. This rides the existing status-transition event/handler infrastructure (the same one that emits `WORK_ITEM_STATUS_CHANGED` activity events). Because equipment lives in the same database as `work_items` (§1.5), this is a same-transaction update — no eventual consistency to reason about.

Edge cases worth specifying:
- Work item completed without `equipment_id` (labor-only) → no update.
- Work item moves *out* of a completed status (rare but possible) → don't decrement; `last_serviced_at` is "most recent service" not "currently being serviced." Re-completing later with a more recent timestamp updates again via the MAX clause.
- Work item completed in the past (backdated) — the MAX clause keeps `last_serviced_at` at the most recent completion regardless of which event fired last. Good.

Backend may pick a different mechanism (computed-on-read query against `work_items`, scheduled denormalizer, etc.). The constraint is just that `lastServicedAt` reads accurate without UI knowing about the mechanism.

### 3.7 Quick-create path

UX flow: work-item dialog has an equipment combobox. User types a name; no match found. Dropdown shows "+ Create new equipment '{typed name}'" footer. Click → small dialog stacked over the work-item dialog, pre-filled with typed name + the WO's service location. Save → returns new equipment, picker auto-selects it.

Backend implication: `POST /equipment` must accept a request with **only** `name` + `serviceLocationId` (and optionally `equipmentTypeId`). Everything else (make, model, serial, install date, attributes) optional. Field techs will abandon a flow that demands manufacturer + model + install date upfront — that friction is the entire reason the inline-create exists.

If `CreateEquipmentRequest` currently requires fields beyond name + service location, please relax the validation. Alternative: separate `POST /equipment/quick` with a smaller required set; same end result, whichever fits backend conventions better.

### 3.8 Activity events

When `equipmentId` changes on a work item, emit `WORK_ITEM_UPDATED` with:
- `field`: `"equipmentId"`
- `fromValue` / `toValue`: **resolved equipment name** (not UUID). Same fix as the pending `workOrderTypeId` / `divisionId` payload work — equipment FKs need the same treatment.

When a work item is created with equipment attached, include the equipment name in the `WORK_ITEM_CREATED` event payload so the UI's activity-row context line can display equipment name instead of work-item description per `WORK_ORDER_DETAIL_DESIGN.md` §7.5.

Resolution mechanism: a SQL join against the `equipment` table at event-emit time (same database, same transaction as the work-item write — see §1.5).

### 3.9 Migration

No production equipment data exists to migrate. Create tables fresh in `work_order_schema`:
- `equipment` table per §3.1
- `equipment_types` and `equipment_categories` per §3.3
- Add `equipment_id` column to `work_items` per §3.2

Rename `equipment-service` → `inventory-service`:
- Rename directory and update package names (`com.newleveltech.dispatch.equipment` → `inventory`)
- Rename schema: `equipment_schema` → `inventory_schema`
- Keep `Warehouse` and `PartsInventory` entities (delete `Equipment`, `EquipmentManufacturer`)
- Update CI/CD (`deploy-dev.yml`, `pr-checks.yml`, `settings.gradle.kts`)
- Keep as skeleton (no controllers) until inventory workflows are queued

---

## 4. Phase 2 — ships alongside equipment edit UI

Not blocked on the typeahead. Don't build until the UI that uses these surfaces is queued, so the backend isn't shipping into emptiness.

### 4.1 `equipment_filters` table + sub-resource CRUD

```sql
CREATE TABLE equipment_filters (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  equipment_id  UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  length_in     NUMERIC(6,2) NOT NULL,
  width_in      NUMERIC(6,2) NOT NULL,
  thickness_in  NUMERIC(6,2) NOT NULL,
  quantity      INT NOT NULL DEFAULT 1,
  label         TEXT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_equipment_filters_size ON equipment_filters (length_in, width_in, thickness_in);
CREATE INDEX idx_equipment_filters_equipment ON equipment_filters (equipment_id);
```

```
GET    /equipment/{id}/filters
POST   /equipment/{id}/filters
PATCH  /equipment/{id}/filters/{fid}
DELETE /equipment/{id}/filters/{fid}
```

`EquipmentResponse.filters: EquipmentFilter[]` added to the response.

**Why a real table and not a JSONB array on `equipment`:** the filter pull-list report (legacy app, beloved by techs) becomes `GROUP BY (length, width, thickness) WHERE work_item.scheduledDate = today` — trivial against a table, ugly against JSONB. Future per-filter replacement events and inventory tie-ins need row identity. Indexable on `(length, width, thickness)` for "find all equipment using this filter size."

**Why filters and not generic `equipment_consumables`:** filters dominate the high-value use case, have a structured dimension format no other consumable shares, and a generic table forces conventions ("how do you store a belt's dimensions?") we'd guess at without real demand. Build `equipment_filters` first; promote to `equipment_consumables` if a second consumable category earns it.

**Cross-trade applicability:** restaurants (grease/water filters), ice machines (scale filters), commercial refrigeration (water/air filters) all use the same structured size pattern. Non-filter trades leave the per-equipment list empty.

### 4.2 `tenant_filter_sizes` + admin

```sql
CREATE TABLE tenant_filter_sizes (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  length_in     NUMERIC(6,2) NOT NULL,
  width_in      NUMERIC(6,2) NOT NULL,
  thickness_in  NUMERIC(6,2) NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  archived_at   TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, length_in, width_in, thickness_in)
);
```

Drives the "Quick Add Common Sizes" chips in the equipment edit dialog. Tenant-configurable.

### 4.3 Warranty fields

`equipment.warranty_expires_at DATE`, `equipment.warranty_details TEXT`. Add when a warranty workflow lands (warning before service, "is this under warranty?" surface in the work-item dialog, etc.). Until then, a row in JSONB `attributes` keyed `warrantyExpiresAt` is the escape hatch for tenants who need it.

### 4.4 Tree-traversal endpoints

`GET /equipment/{id}/descendants`, ancestor walk, cycle prevention beyond same-tenant — add when the UI renders multi-level trees (system detail page with units listed below).

---

## 5. Out of scope / deferred indefinitely

Not in this design. Layered on later if real workflow pressure emerges.

- **Per-type custom field schemas** (admin-defined fields per equipment type with validation). JSONB `attributes` is the temporary measure. Promote to typed schemas when a non-HVAC tenant says "I need to track field X on Refrigeration equipment" and the workflow demands queryability.
- **Generic consumable parts** (belts, refrigerant charges, capacitors as inventory items). Filters earn a table; other consumables wait for demand.
- **Filter-replacement event tracking.** Schema can support it later via an event table.
- **Inventory tie-in / reorder thresholds.** Separate effort on top of the filter / consumable tables once they exist.
- **QR/barcode scanning.** `assetTag` column exists; mobile scanning UI is its own project.
- **Recommended-next-service / preventive-maintenance scheduling.** Lives with recurring orders, not equipment.
- **Many-to-many work-item ↔ equipment.** Cardinality stays N:1. Re-evaluate only if a real workflow demands it.
- **Filter pull-list report endpoint.** UI work to display the report happens after `equipment_filters` ships. Aggregator endpoint can wait until the UI pulls for it.

---

## 6. Phase 1 checklist

- [ ] Rename `equipment-service` → `inventory-service` per §3.9
- [ ] Create `equipment` table fresh in `work_order_schema` (§3.1)
- [ ] Add `equipment_id` to `work_items` (§3.2)
- [ ] Create `equipment_types` + `equipment_categories` tables, with CRUD endpoints (§3.3)
- [ ] `EquipmentResponse` + `EquipmentSummary` projection (§3.4)
- [ ] `WorkItemResponse` includes `equipment: EquipmentSummary | null` (§3.4)
- [ ] `CreateWorkItemRequest` / `UpdateWorkItemRequest` add `equipmentId` (§3.4)
- [ ] Equipment CRUD controller in `work-order-service` (`GET /equipment/{id}`, `POST /equipment`, `PATCH /equipment/{id}`, etc.)
- [ ] Search endpoint `GET /equipment?serviceLocationId&search&status` returning `EquipmentSummary[]` (§3.5)
- [ ] Spec and implement `last_serviced_at` maintenance mechanism (§3.6)
- [ ] `CreateEquipmentRequest` requires only `name` + `serviceLocationId` (§3.7)
- [ ] Activity-event payloads: `WORK_ITEM_UPDATED` for `equipmentId` changes, `WORK_ITEM_CREATED` includes equipment name (§3.8)

UI work follows; tracked on the `dispatch-ui` side.
