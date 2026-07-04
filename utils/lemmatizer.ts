import { getLemmaRows } from './db'

// Session LRU over the IDB lemma dictionary. Misses are cached as null so
// unknown forms don't hit IDB on every page.
const CACHE_MAX = 50000
const caches = new Map<string, Map<string, string | null>>()

function cacheFor(lang: string): Map<string, string | null> {
  let c = caches.get(lang)
  if (!c) {
    c = new Map()
    caches.set(lang, c)
  }
  return c
}

function cachePut(cache: Map<string, string | null>, form: string, lemma: string | null) {
  cache.set(form, lemma)
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
}

/**
 * Resolve lowercased surface forms to dictionary lemmas.
 * Result maps form → lemma, or → null when the form is not in the dictionary
 * (callers fall back to the surface form itself).
 */
export async function lemmatizeBatch(lang: string, forms: string[]): Promise<Map<string, string | null>> {
  const cache = cacheFor(lang)
  const out = new Map<string, string | null>()
  const missing: string[] = []
  for (const form of forms) {
    if (cache.has(form)) out.set(form, cache.get(form)!)
    else missing.push(form)
  }
  if (missing.length > 0) {
    const rows = await getLemmaRows(lang, missing)
    for (const form of missing) {
      const lemma = rows.get(form) ?? null
      out.set(form, lemma)
      cachePut(cache, form, lemma)
    }
  }
  return out
}

/** Drop the session cache after (re)importing a dictionary. */
export function invalidateLemmaCache(lang: string): void {
  caches.delete(lang)
}
