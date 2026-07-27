export function createTtlCache({ enabled = true, ttlMs, maxEntries, clock = Date.now }) {
  const entries = new Map()

  function now() {
    return clock()
  }

  function clone(value) {
    return structuredClone(value)
  }

  function removeExpired(currentTime = now()) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= currentTime) {
        entries.delete(key)
      }
    }
  }

  function get(key) {
    if (!enabled) {
      return undefined
    }

    const entry = entries.get(key)
    if (!entry) {
      return undefined
    }

    if (entry.expiresAt <= now()) {
      entries.delete(key)
      return undefined
    }

    entries.delete(key)
    entries.set(key, entry)

    return clone(entry.value)
  }

  function set(key, value) {
    if (!enabled) {
      return
    }

    const currentTime = now()
    removeExpired(currentTime)

    if (entries.has(key)) {
      entries.delete(key)
    }

    entries.set(key, {
      value: clone(value),
      expiresAt: currentTime + ttlMs
    })

    while (entries.size > maxEntries) {
      const leastRecentKey = entries.keys().next().value
      entries.delete(leastRecentKey)
    }
  }

  function deleteEntry(key) {
    entries.delete(key)
  }

  function clear() {
    entries.clear()
  }

  return {
    get,
    set,
    delete: deleteEntry,
    clear,
    get size() {
      if (!enabled) {
        return 0
      }

      removeExpired()
      return entries.size
    }
  }
}
