# Audit Log API Improvements

## Executive Summary
Current audit log endpoint returns all entries for a user, which doesn't scale. Need pagination + improved response structure for CSR-optimized UI.

---

## 1. Pagination (CRITICAL)

### Current Problem
- `GET /api/v1/audit/user/{userId}` returns ALL entries
- Active user with 1000+ entries = slow query, large response
- CSRs only look at recent 10-20 entries 99% of the time
- Doesn't scale as data grows

### Recommended Approach: Cursor-Based Pagination

**Why cursor-based?** Better for time-ordered data, more efficient than offset-based for large datasets.

#### Endpoint
```
GET /api/v1/audit/user/{userId}?limit=50&before={timestamp}
```

#### Parameters
- `limit` (optional, default: 50, max: 100) - Number of entries to return
- `before` (optional) - ISO 8601 timestamp - Return entries before this timestamp
  - If omitted, return most recent entries

#### Response Structure
```json
{
  "entries": [
    {
      "id": "7854becb-dfe4-4a94-b5b2-8985a9eec199",
      "action": "CREATE",
      "entityType": "USER_ROLE",
      "entityId": "72e0639c-1ebe-44ba-a5c6-3ce84fc2cdc6",
      "entityName": "Admin Role Assignment",
      "summary": "Assigned Admin role to user",
      "changes": {
        "role": "Field Technician → Admin",
        "status": "→ Active"
      },
      "timestamp": "2026-04-16T18:55:27.338449Z",
      "userName": "Tenant Two",
      "userEmail": "tenant2@test.com",
      "userRole": "Admin"
    }
  ],
  "pagination": {
    "limit": 50,
    "hasMore": true,
    "nextCursor": "2026-04-05T23:53:21.545169Z"
  }
}
```

#### Frontend Flow
1. Initial load: `GET /audit/user/{userId}` → returns 50 most recent
2. User clicks "Load More": `GET /audit/user/{userId}?before={nextCursor}` → append next 50
3. Repeat until `hasMore: false`

---

## 2. Improved Entry Structure (HIGH PRIORITY)

### Current Response Problems
❌ No `entityType` - can't tell if it's Customer, Work Order, Role, etc.  
❌ No `entityId` - can't link to the specific record  
❌ No entity display name - CSRs see raw IDs instead of "Customer: John Doe"  
❌ `newValues`/`oldValues` are full nested objects - hard to show what changed  
❌ Frontend has to parse complex objects to generate change summaries  

### Proposed Entry Structure

```typescript
{
  "id": "7854becb-dfe4-4a94-b5b2-8985a9eec199",
  "action": "CREATE" | "UPDATE" | "DELETE",
  "entityType": "USER" | "CUSTOMER" | "WORK_ORDER" | "ROLE" | "USER_ROLE" | "SERVICE_LOCATION" | "EQUIPMENT" | "INVOICE" | "QUOTE" | "PAYMENT" | "DISPATCH",
  "entityId": "72e0639c-1ebe-44ba-a5c6-3ce84fc2cdc6",
  "entityName": "Admin Role Assignment",  // Human-readable display name
  "summary": "Assigned Admin role to user",  // One-line description
  "changes": {
    "role": "Field Technician → Admin",
    "status": "→ Active",
    "email": "old@example.com → new@example.com"
  },
  "timestamp": "2026-04-16T18:55:27.338449Z",
  "userName": "Tenant Two",
  "userEmail": "tenant2@test.com",
  "userRole": "Admin"
}
```

### Field Descriptions

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique audit entry ID | `"7854becb-dfe4-4a94-b5b2-8985a9eec199"` |
| `action` | enum | Action performed | `"CREATE"`, `"UPDATE"`, `"DELETE"` |
| `entityType` | enum | Type of entity affected | `"USER"`, `"CUSTOMER"`, `"WORK_ORDER"` |
| `entityId` | string | ID of the affected entity | `"72e0639c-1ebe-44ba-a5c6-3ce84fc2cdc6"` |
| `entityName` | string | Human-readable entity name | `"John Doe"`, `"WO-12345"` |
| `summary` | string | One-line description of action | `"Updated customer email address"` |
| `changes` | object | Changed fields as "old → new" | `{"email": "old@x.com → new@x.com"}` |
| `timestamp` | ISO 8601 | When action occurred | `"2026-04-16T18:55:27.338449Z"` |
| `userName` | string | User who performed action | `"Tenant Two"` |
| `userEmail` | string | Email of user who performed action | `"tenant2@test.com"` |
| `userRole` | string \| null | Role of user at time of action | `"Admin"` |

### Changes Object Format
- **CREATE**: `{"field": "→ value"}` (only new values)
- **UPDATE**: `{"field": "oldValue → newValue"}` (only changed fields)
- **DELETE**: `{"field": "value →"}` (only deleted values)

### Example Entries

#### User Role Assignment (CREATE)
```json
{
  "action": "CREATE",
  "entityType": "USER_ROLE",
  "entityId": "72e0639c-1ebe-44ba-a5c6-3ce84fc2cdc6",
  "entityName": "Admin Role",
  "summary": "Assigned Admin role",
  "changes": {
    "role": "→ Admin"
  }
}
```

#### Customer Email Update
```json
{
  "action": "UPDATE",
  "entityType": "CUSTOMER",
  "entityId": "c3611306-f0a0-4417-8a6f-1b51844e725e",
  "entityName": "John Doe Plumbing",
  "summary": "Updated customer contact information",
  "changes": {
    "email": "old@example.com → new@example.com",
    "phone": "555-1234 → 555-5678"
  }
}
```

#### Work Order Status Change
```json
{
  "action": "UPDATE",
  "entityType": "WORK_ORDER",
  "entityId": "a8cdaae9-df92-4236-8eea-f1ccb0e2d0cb",
  "entityName": "WO-12345",
  "summary": "Changed work order status",
  "changes": {
    "status": "SCHEDULED → IN_PROGRESS"
  }
}
```

---

## 3. Benefits

### For Frontend
✅ Simpler code - no complex object parsing  
✅ Consistent display - backend controls formatting  
✅ Better performance - smaller payloads with pagination  
✅ Can link to entities - `entityId` enables navigation  

### For CSRs
✅ Faster page loads - only fetch what's needed  
✅ Readable changes - see "old → new" at a glance  
✅ Context - see entity names instead of IDs  
✅ Infinite scroll - load more as needed  

### For Backend
✅ Smaller queries - limit to 50-100 entries  
✅ Better indexing - cursor-based pagination efficient  
✅ Consistent audit format - same structure everywhere  
✅ Easier to add new entity types  

---

## 4. Migration Path

### Phase 1: Add pagination (minimal changes)
- Add `limit` and `before` query parameters
- Wrap response in `{ entries: [...], pagination: {...} }`
- Keep existing entry structure
- **Frontend compatible** - can handle both formats

### Phase 2: Improve entry structure (breaking change)
- Add `entityType`, `entityId`, `entityName`, `summary`
- Format `changes` as "old → new" strings
- Remove or deprecate `newValues`/`oldValues` raw objects
- **Coordinate with frontend deployment**

### Recommended: Do both phases together
- Single breaking change better than two
- Frontend can deploy simultaneously
- Clean cut-over

---

## 5. Implementation Notes

### Entity Type Mapping
```
USER              → User records
USER_ROLE         → Role assignments
CUSTOMER          → Customer records
SERVICE_LOCATION  → Service locations
WORK_ORDER        → Work orders
EQUIPMENT         → Equipment records
INVOICE           → Invoices
QUOTE             → Quotes
PAYMENT           → Payments
DISPATCH          → Dispatch records
ROLE              → Role definitions
NOTIFICATION      → Notification preferences
```

### Changes Formatting Logic
```java
// Pseudocode
for (String field : changedFields) {
    Object oldValue = oldValues.get(field);
    Object newValue = newValues.get(field);
    
    if (oldValue == null) {
        changes.put(field, "→ " + newValue);  // CREATE
    } else if (newValue == null) {
        changes.put(field, oldValue + " →");  // DELETE
    } else {
        changes.put(field, oldValue + " → " + newValue);  // UPDATE
    }
}
```

### Summary Generation
Should be human-readable, context-aware:
- `"Created customer record"`
- `"Updated work order status"`
- `"Assigned Admin role"`
- `"Deleted service location"`

---

## 6. Questions for Backend Team

1. **Timeline**: When can pagination be implemented?
2. **Default limit**: 50 or 100 entries per page?
3. **Breaking change coordination**: When can we deploy together?
4. **Existing data**: Will this apply to historical audit entries or only new ones?
5. **Performance**: Can we add database indexes for timestamp-based queries?

---

## Contact
Frontend Team: Paul Wilcox  
Backend Team: (your team)  
Priority: High - Current approach doesn't scale
