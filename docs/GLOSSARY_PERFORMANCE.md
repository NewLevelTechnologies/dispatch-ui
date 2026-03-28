# Glossary System - Database Access & Frontend Refresh

**Quick Reference**: How the customizable entity naming system handles database access and real-time updates.

---

## Database Access Pattern

### Startup (One Time)

```kotlin
@PostConstruct
fun loadAllOverrides() {
    // ONE query: SELECT * FROM tenant_terminology_overrides
    // Loads ALL tenants into memory (ConcurrentHashMap)
    // Takes: 200-500ms for 1000 tenants
}
```

**Result**: All terminology overrides loaded into memory at startup.

### Runtime Reads (Zero Database Queries)

```kotlin
fun getDisplayName(entityCode: String): String {
    // ✅ ZERO database queries - reads from in-memory HashMap
    val override = overrides[tenantId]?.get(entityCode)
    return override?.singular ?: defaultName
    // Lookup time: <1ms
}
```

**Every API request that needs entity names**: 0 database queries.

### Runtime Writes (When Admin Changes Terminology)

```kotlin
@Transactional
fun updateTerminology(tenantId: UUID, updates: Map<...>) {
    // 1. Write to database (persistence)
    repository.save(override)  // ← ONE query per entity updated

    // 2. Update in-memory cache immediately (no restart needed)
    overrides[tenantId][entityCode] = translations

    // 3. Bump version for frontend ETag
    glossaryVersions[tenantId] = UUID.randomUUID()
}
```

**Summary**:
- Startup: 1 query (loads everything)
- Runtime reads: 0 queries (all from memory)
- Admin saves: 1 query per entity updated

---

## Frontend Refresh Mechanism

### Initial App Load

```typescript
// Runs once when user opens app
const loadGlossary = async () => {
  const cachedETag = localStorage.getItem('glossary-etag');

  const response = await fetch('/api/v1/tenant/terminology', {
    headers: { 'If-None-Match': cachedETag }
  });

  if (response.status === 304) {
    // ✅ Nothing changed - use cached data
    return;
  }

  // Download new glossary
  const data = await response.json();
  localStorage.setItem('glossary-etag', data.version);
  setGlossary(data.glossary);
};
```

**First load**: Downloads glossary (~1-5 KB)
**Subsequent loads**: 304 Not Modified if unchanged (instant, no download)

### When Admin Saves Changes

**Flow**:

```
1. Admin clicks "Save Changes"
   ↓
2. PUT /api/v1/tenant/terminology
   ↓
3. Backend:
   - Writes to database (20-50ms)
   - Updates memory cache (instant)
   - Bumps version: "v1" → "v2"
   ↓
4. Backend returns: 200 OK with new glossary + version
   ↓
5. Frontend:
   - Stores new ETag in localStorage
   - Updates React context with new glossary
   ↓
6. React automatically re-renders ALL components
   - Navigation: "Customers" → "Clients"
   - Page headings: "Customers" → "Clients"
   - Buttons: "Add Customer" → "Add Client"
   - Table headers update
   - (Every component using getName() updates)

✅ NO PAGE RELOAD NEEDED - Changes appear instantly
```

### How Other Users See Changes

```
User A (admin) saves terminology change
   ↓
User B refreshes page or loads app
   ↓
Frontend checks ETag: "v1" (cached) vs "v2" (backend)
   ↓
Mismatch detected → Downloads new glossary
   ↓
User B now sees "Clients" everywhere
```

---

## Real Example

**Before**:
- Navigation shows "Customers"
- Page heading shows "Customers"
- Button shows "Add Customer"

**Admin changes "Customer" → "Client"**:
1. Clicks Save (takes ~100ms)
2. Backend writes to DB + updates memory
3. Frontend receives new glossary
4. React re-renders everything

**After** (instantly, no page reload):
- Navigation shows "Clients"
- Page heading shows "Clients"
- Button shows "Add Client"

---

## Performance Numbers

### Backend Memory Usage

```
Per override: ~100 bytes
1,000 tenants × 5 overrides = 500 KB raw data
HashMap overhead (10x) = 5 MB total

Even 10,000 tenants = ~50 MB (negligible)
```

### Network Usage

**Initial load**:
- Empty tenant: 200 bytes
- 5 overrides: ~1 KB

**Subsequent loads**:
- 304 Not Modified: 0 bytes (header only)
- Changed: ~1 KB

**Settings save**:
- Request: ~500 bytes
- Response: ~1 KB

---

## Key Takeaways

**Database Access**:
- ✅ Startup: 1 query (loads all tenants)
- ✅ Runtime: 0 queries (all from memory)
- ✅ Updates: 1 query per entity changed

**Frontend Refresh**:
- ✅ ETag caching prevents unnecessary downloads
- ✅ React context updates all components automatically
- ✅ No page reload needed
- ✅ Changes appear instantly (~100ms)

**Reliability**:
- ✅ Backend down? Frontend uses i18n defaults
- ✅ API slow? Cached data works offline
- ✅ Version conflict? Fresh download resolves it

**Speed**:
- Backend lookup: <1ms (memory)
- Frontend refresh: ~100ms (HTTP + re-render)
- User experience: Instant

---

## Questions & Answers

**Q: Does every API request query the database for terminology?**
A: No. Zero database queries. All reads from in-memory cache.

**Q: What happens when admin saves changes?**
A: Backend writes to DB + updates memory. Frontend fetches new glossary and React re-renders. Takes ~100ms total.

**Q: Do other users see changes immediately?**
A: On their next page load/refresh (ETag mismatch triggers download).

**Q: What if two admins change terminology at the same time?**
A: Last write wins (standard REST semantics). Version bumps ensure next load gets latest.

**Q: What's the memory footprint?**
A: ~5 MB for 1,000 tenants. Negligible.

**Q: Does this work offline?**
A: Yes. Frontend falls back to i18n defaults if API unavailable.

**Q: Can we add real-time updates (WebSocket)?**
A: Not needed for this use case. ETag-based polling on page load is sufficient.
