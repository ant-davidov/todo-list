const buckets = new Map();
const maxBuckets = 10_000;
let nextCleanupAt = 0;

// Best-effort, process-local limits suitable for a small demo deployment.
export function consumeRateLimit(key, limit, windowMs, now = Date.now()) {
  if (now >= nextCleanupAt) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    nextCleanupAt = now + 60_000;
  }

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && buckets.size >= maxBuckets) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}
