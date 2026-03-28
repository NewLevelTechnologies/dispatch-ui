# Glossary System - Multi-Pod Cache Synchronization

**Date**: 2026-03-25
**Status**: Critical Issue - Requires Backend Architecture Change

---

## Problem Statement

**Coworker feedback**: "This only works in an environment where there is only one task per service. It'll work in dev as it currently stands, but will not work in QA or Prod when we have at least 2 tasks per service. Whatever task happens to save the new language value will be the only one to have the updated `overrides` hash."

**The Issue**:
```
┌─────────────┐              ┌─────────────┐
│   Pod A     │              │   Pod B     │
│             │              │             │
│ overrides:  │              │ overrides:  │
│ customer =  │              │ customer =  │
│ "Customer"  │              │ "Customer"  │
└──────┬──────┘              └──────┬──────┘
       │                            │
       │ Admin saves: customer = "Client"
       │                            │
┌──────▼──────┐              ┌─────────────┐
│   Pod A     │              │   Pod B     │
│             │              │             │
│ overrides:  │              │ overrides:  │
│ customer =  │              │ customer =  │
│ "Client" ✅ │              │ "Customer" ❌│ ← STALE DATA
└─────────────┘              └─────────────┘

Load balancer randomly routes requests:
- Request 1 → Pod A → sees "Client" ✅
- Request 2 → Pod B → sees "Customer" ❌ (WRONG!)
```

**Impact**: Users see inconsistent terminology depending on which pod handles their request.

---

## Solution Options

### Option 1: Redis Pub/Sub (Recommended)

**How it works**:
```kotlin
@Service
class TerminologyService(
    private val repository: TenantTerminologyOverrideRepository,
    private val redisTemplate: RedisTemplate<String, String>,
) {
    @PostConstruct
    fun setupPubSub() {
        // Subscribe to terminology updates
        redisTemplate.listenToChannel("terminology-updates") { message ->
            val event = parseEvent(message)
            reloadTenantOverrides(event.tenantId)
        }
    }

    @Transactional
    fun updateTerminology(tenantId: UUID, updates: Map<...>) {
        // 1. Save to database
        repository.save(override)

        // 2. Update THIS pod's cache
        overrides[tenantId][entityCode] = translations

        // 3. Publish event to ALL pods
        redisTemplate.publish("terminology-updates",
            """{"tenantId": "$tenantId", "version": "$newVersion"}"""
        )
    }

    private fun reloadTenantOverrides(tenantId: UUID) {
        // Load this tenant's overrides from DB
        val tenantOverrides = repository.findAllByTenantId(tenantId)
        overrides[tenantId] = tenantOverrides.toMap()
    }
}
```

**Pros**:
- ✅ All pods stay in sync (sub-second propagation)
- ✅ Still zero DB queries for reads
- ✅ Standard pattern for distributed caching
- ✅ Already using Redis for session storage

**Cons**:
- Requires Redis (already in infrastructure)
- Slightly more complex

**Recommendation**: This is the standard solution for multi-pod cache synchronization.

---

### Option 2: Shared Redis Cache

**How it works**:
```kotlin
@Service
class TerminologyService(
    private val repository: TenantTerminologyOverrideRepository,
    private val redisTemplate: RedisTemplate<String, Map<String, Translation>>,
) {
    fun getDisplayName(entityCode: String): String {
        val tenantId = TenantContext.getTenantId()

        // Read from Redis, not in-memory
        val cached = redisTemplate.opsForValue()
            .get("terminology:$tenantId:$entityCode")

        if (cached != null) return cached.singular

        // Cache miss - load from DB and cache in Redis
        val override = repository.findByTenantIdAndEntityCode(tenantId, entityCode)
        if (override != null) {
            redisTemplate.opsForValue().set(
                "terminology:$tenantId:$entityCode",
                override.translations,
                Duration.ofHours(24)
            )
            return override.translations.singular
        }

        return getDefaultName(entityCode)
    }
}
```

**Pros**:
- ✅ All pods see same data (immediately consistent)
- ✅ No pub/sub complexity

**Cons**:
- ❌ Adds latency: ~1-5ms per lookup (vs <1ms in-memory)
- ❌ Redis becomes single point of failure
- ❌ More Redis load (every API request)

**Recommendation**: Not ideal for this use case. Adds latency for every request.

---

### Option 3: Database-Backed Cache with TTL

**How it works**:
```kotlin
@Service
class TerminologyService(
    private val repository: TenantTerminologyOverrideRepository,
) {
    private val overrides: ConcurrentHashMap<UUID, CachedOverrides> = ConcurrentHashMap()

    data class CachedOverrides(
        val data: Map<String, Translation>,
        val loadedAt: Instant
    )

    fun getDisplayName(entityCode: String): String {
        val tenantId = TenantContext.getTenantId()
        val cached = overrides[tenantId]

        // Refresh if older than 1 minute
        if (cached == null || cached.loadedAt.isBefore(Instant.now().minus(1, ChronoUnit.MINUTES))) {
            refreshTenantCache(tenantId)
        }

        return overrides[tenantId]?.data?.get(entityCode)?.singular ?: getDefaultName(entityCode)
    }

    private fun refreshTenantCache(tenantId: UUID) {
        val tenantOverrides = repository.findAllByTenantId(tenantId)
        overrides[tenantId] = CachedOverrides(
            data = tenantOverrides.toMap(),
            loadedAt = Instant.now()
        )
    }
}
```

**Pros**:
- ✅ Simple implementation
- ✅ Eventually consistent (within 1 minute)

**Cons**:
- ❌ Stale data for up to 1 minute
- ❌ DB queries every minute per tenant (not truly zero-query)

**Recommendation**: Not suitable. Users would see inconsistent terminology for up to 1 minute.

---

### Option 4: Event-Driven (Kafka/SNS)

**How it works**:
Same as Redis pub/sub but using existing message bus (Kafka, SNS, etc.)

**Pros**:
- ✅ Same benefits as Redis pub/sub
- ✅ May integrate better with existing event-driven architecture

**Cons**:
- More infrastructure complexity
- Overkill for this use case

**Recommendation**: Use if already using Kafka/SNS for other cache invalidation. Otherwise Redis is simpler.

---

## Recommended Architecture

**Use Redis Pub/Sub** (Option 1):

```
┌─────────────────────────────────────────────────────────┐
│                     Admin Updates                        │
└────────────────────────┬────────────────────────────────┘
                         ↓
                 ┌───────────────┐
                 │   Pod A       │
                 │  (receives    │
                 │   request)    │
                 └───────┬───────┘
                         │
                    1. Save to DB
                         │
                    2. Update local cache
                         │
                    3. Publish to Redis
                         │
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Redis Channel │ │               │ │               │
│"terminology-  │ │               │ │               │
│  updates"     │ │               │ │               │
└───────┬───────┘ └───────────────┘ └───────────────┘
        │
        └──────────┬─────────────┬──────────────┐
                   ↓             ↓              ↓
            ┌──────────┐  ┌──────────┐  ┌──────────┐
            │  Pod A   │  │  Pod B   │  │  Pod C   │
            │ (reload) │  │ (reload) │  │ (reload) │
            └──────────┘  └──────────┘  └──────────┘

All pods receive event and reload their cache from DB
Propagation time: < 1 second
All subsequent requests see updated terminology
```

**Backend changes needed**:

```kotlin
// Add dependency
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
}

// Configuration
@Configuration
class RedisConfig {
    @Bean
    fun redisMessageListenerContainer(
        connectionFactory: RedisConnectionFactory,
        terminologyUpdateListener: MessageListener
    ): RedisMessageListenerContainer {
        val container = RedisMessageListenerContainer()
        container.setConnectionFactory(connectionFactory)
        container.addMessageListener(
            terminologyUpdateListener,
            ChannelTopic("terminology-updates")
        )
        return container
    }
}

// Service
@Service
class TerminologyService(
    private val repository: TenantTerminologyOverrideRepository,
    private val redisTemplate: RedisTemplate<String, String>,
) {
    @PostConstruct
    fun loadAllOverrides() {
        // Existing startup loading logic
    }

    @MessageListener
    fun onTerminologyUpdate(message: Message) {
        val event = objectMapper.readValue(message.body, TerminologyUpdateEvent::class.java)
        logger.info("Received terminology update for tenant ${event.tenantId}")

        // Reload this tenant's overrides
        reloadTenantOverrides(event.tenantId)
    }

    @Transactional
    fun updateTerminology(tenantId: UUID, updates: Map<...>) {
        // 1. Save to database
        repository.save(override)

        // 2. Update local cache
        overrides[tenantId][entityCode] = translations

        // 3. Bump version
        val newVersion = generateVersion()
        glossaryVersions[tenantId] = newVersion

        // 4. Publish event to all pods
        val event = TerminologyUpdateEvent(tenantId, newVersion)
        redisTemplate.convertAndSend("terminology-updates", objectMapper.writeValueAsString(event))

        logger.info("Published terminology update for tenant $tenantId")
    }

    private fun reloadTenantOverrides(tenantId: UUID) {
        val tenantOverrides = repository.findAllByTenantId(tenantId)

        overrides[tenantId] = ConcurrentHashMap(
            tenantOverrides.associate { it.entityCode to it.translations }
        )

        glossaryVersions[tenantId] = generateVersion()
    }
}

data class TerminologyUpdateEvent(
    val tenantId: UUID,
    val version: String
)
```

**Testing multi-pod sync**:
```bash
# Start 2 pods locally
./gradlew :user-service:bootRun --args='--server.port=8087'
./gradlew :user-service:bootRun --args='--server.port=8088'

# Update terminology via Pod 1
curl -X PUT http://localhost:8087/api/v1/tenant/terminology \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"customer": {"en": {"singular": "Client", "plural": "Clients"}}}'

# Verify Pod 2 sees the change (within 1 second)
curl http://localhost:8088/api/v1/tenant/terminology \
  -H "Authorization: Bearer $TOKEN"

# Should return: {"glossary": {"customer": {"singular": "Client", ...}}}
```

---

## CloudFront Caching Considerations

**Coworker feedback**: "I'm not sure how that ETag call is structured when it tries to get the latest version of the overrides, but we need to make sure that it can take advantage of caching from CloudFront and/or be cognizant that the service is behind it in case we'll need to invalidate CF's cache for that tenant/locale"

### Current ETag Flow

```
Frontend → CloudFront → API Gateway → user-service
            ↓
    Cache terminogoly response
    (1 hour TTL)
```

**Problem**: When admin updates terminology:
1. Backend updates DB + memory + publishes to Redis
2. Other pods update their cache
3. CloudFront still has stale cached response for 1 hour
4. Users see old terminology until cache expires

### Solution: CloudFront Cache Invalidation

**Option A: Invalidate CloudFront on Update**

```kotlin
@Service
class TerminologyService(
    private val cloudFrontClient: CloudFrontClient,
    @Value("\${cloudfront.distribution-id}") private val distributionId: String,
) {
    @Transactional
    fun updateTerminology(tenantId: UUID, updates: Map<...>) {
        // 1. Save to DB + update cache + publish to Redis
        // ... existing logic ...

        // 2. Invalidate CloudFront cache for this tenant
        cloudFrontClient.createInvalidation(
            CreateInvalidationRequest.builder()
                .distributionId(distributionId)
                .invalidationBatch(
                    InvalidationBatch.builder()
                        .paths(
                            Paths.builder()
                                .items("/api/v1/tenant/terminology*")
                                .quantity(1)
                                .build()
                        )
                        .callerReference(UUID.randomUUID().toString())
                        .build()
                )
                .build()
        )
    }
}
```

**Pros**:
- ✅ Immediate consistency (invalidation takes ~1-5 seconds)
- ✅ CloudFront cache still works for unchanged data

**Cons**:
- Adds complexity
- CloudFront invalidations cost money (first 1000/month free)

**Option B: Tenant-Specific Cache Keys**

Use tenant ID in URL to cache per tenant:

```
/api/v1/tenant/terminology?tenant={tenantId}
```

CloudFront caches separately for each tenant. Invalidate specific tenant's cache.

**Option C: Short CloudFront TTL for Terminology Endpoint**

Set CloudFront TTL to 5 minutes for `/api/v1/tenant/terminology`:

```yaml
# CloudFront behavior
/api/v1/tenant/terminology:
  min-ttl: 0
  default-ttl: 300  # 5 minutes
  max-ttl: 300
```

**Pros**:
- ✅ Simple
- ✅ No invalidation needed

**Cons**:
- Stale data for up to 5 minutes
- More backend requests

**Recommendation**: Use **Option A** (CloudFront invalidation) for immediate consistency, or **Option C** (5-minute TTL) for simplicity.

---

## Frontend Considerations

**Coworker comment**: "The GlossaryResponse format it's sending back to the UI isn't normal i18n structure, but maybe it's something react acknowledges?"

**Clarification**: The glossary is NOT standard i18n. It's a **separate system** that works alongside i18n:

```typescript
// i18n (language localization)
// en_us.json
{
  "entities": {
    "customer": "Customer",
    "customers": "Customers"
  }
}

// Glossary (business terminology)
// API response: /api/v1/tenant/terminology
{
  "glossary": {
    "customer": {
      "singular": "Client",
      "plural": "Clients"
    }
  },
  "version": "abc123",
  "language": "en"
}

// Frontend merges them:
const getName = (entityCode, plural) => {
  // 1. Check glossary (tenant override)
  const override = glossary[entityCode];
  if (override) return plural ? override.plural : override.singular;

  // 2. Fall back to i18n (language default)
  return t(`entities.${entityCode}${plural ? 's' : ''}`);
};
```

**Two separate systems**:
- **i18n**: English vs Spanish (language localization)
- **Glossary**: Customer vs Client (business terminology preference)

They work together but are independent. The glossary is NOT trying to replace i18n.

---

## Summary of Required Changes

**Backend (dispatch-api)**:
- [ ] Add Redis pub/sub for multi-pod cache synchronization
- [ ] Publish event when terminology updated
- [ ] Subscribe to events and reload tenant cache
- [ ] Optional: Add CloudFront invalidation on update
- [ ] Optional: Configure CloudFront TTL for terminology endpoint

**Frontend (dispatch-ui)**:
- [ ] No changes needed (already designed for this)
- [ ] GlossaryContext handles ETag caching correctly
- [ ] Works with CloudFront caching

**Infrastructure**:
- [ ] Ensure Redis available in QA/Prod (likely already exists)
- [ ] Configure CloudFront caching behavior for terminology endpoint
- [ ] Optional: Set up CloudFront invalidation IAM permissions

**Testing**:
- [ ] Test multi-pod sync (start 2 pods, update on one, verify other sees it)
- [ ] Test CloudFront caching (check for stale responses)
- [ ] Load test (ensure Redis can handle pub/sub load)

---

## Recommendation

**For MVP**:
1. Implement Redis pub/sub (standard solution, already in infra)
2. Set CloudFront TTL to 5 minutes for terminology endpoint (simple)
3. Document that changes take up to 5 minutes to propagate to all users

**For Production**:
1. Add CloudFront invalidation on terminology update
2. Reduces propagation time to ~5 seconds
3. Better user experience

This addresses all concerns:
- ✅ Multi-pod synchronization via Redis pub/sub
- ✅ CloudFront caching with invalidation
- ✅ Clarified glossary is separate from i18n
- ✅ Maintains zero-query reads (still in-memory)
- ✅ Sub-second propagation between pods
