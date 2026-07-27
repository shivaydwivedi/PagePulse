export function createFixedWindowRateLimiter({
  enabled = true,
  windowMs,
  maxRequests,
  maxClients,
  clock = Date.now
}) {
  const clients = new Map()

  function resetSeconds(resetAt, now) {
    return Math.max(0, Math.ceil((resetAt - now) / 1000))
  }

  function removeExpired(now) {
    for (const [clientKey, entry] of clients) {
      if (entry.resetAt <= now) {
        clients.delete(clientKey)
      }
    }
  }

  function remember(clientKey, entry) {
    if (clients.has(clientKey)) {
      clients.delete(clientKey)
    }

    clients.set(clientKey, entry)
  }

  function evictIfNeeded() {
    while (clients.size > maxClients) {
      const oldestKey = clients.keys().next().value
      clients.delete(oldestKey)
    }
  }

  function consume(clientKey) {
    if (!enabled) {
      return {
        allowed: true,
        limit: maxRequests,
        remaining: maxRequests,
        resetAt: 0,
        retryAfterSeconds: 0
      }
    }

    const now = clock()
    removeExpired(now)

    const existingEntry = clients.get(clientKey)
    const entry = existingEntry && existingEntry.resetAt > now
      ? existingEntry
      : { count: 0, resetAt: now + windowMs }

    const allowed = entry.count < maxRequests

    if (allowed) {
      entry.count += 1
    } else {
      entry.count = maxRequests
    }

    remember(clientKey, entry)
    evictIfNeeded()

    const secondsUntilReset = resetSeconds(entry.resetAt, now)

    return {
      allowed,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
      resetAt: entry.resetAt,
      retryAfterSeconds: allowed ? 0 : Math.max(1, secondsUntilReset)
    }
  }

  return {
    enabled,
    consume,
    get size() {
      if (!enabled) {
        return 0
      }

      removeExpired(clock())
      return clients.size
    }
  }
}
