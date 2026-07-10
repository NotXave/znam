import type { TranslationResult } from './types'

// DeepL's free web JSON-RPC endpoint (the one the deepl.com translator uses,
// DeepLX-style). Unofficial: aggressive per-IP rate limiting (429 after a few
// quick requests), so this source is cache-heavy, throttled, and fails soft —
// callers always have Google/Reverso in parallel.

const ENDPOINT = 'https://www2.deepl.com/jsonrpc'
// Testing shows ~1.2s spacing is comfortably under the free endpoint's limit;
// a single 429 (from a click burst) recovers within seconds, so the cooldown
// is short and we retry once rather than going dark for a minute.
const MIN_INTERVAL_MS = 1200
const COOLDOWN_MS = 6000
const RETRY_WAIT_MS = 1500

const cache = new Map<string, TranslationResult>()
let lastRequestAt = 0
let cooldownUntil = 0
/** Serialize requests so bursts get throttled instead of all firing at once. */
let queue: Promise<unknown> = Promise.resolve()

function deeplLang(code: string): string {
  if (!code || code === 'auto') return 'auto'
  return code.split('-')[0].toUpperCase()
}

function buildBody(texts: string[], from: string, to: string, alternatives: number): string {
  const id = Math.floor(Math.random() * 99999 + 8300000) * 1000
  const joined = texts.join('')
  let iCount = (joined.match(/i/g) || []).length
  let ts = Date.now()
  if (iCount !== 0) {
    iCount += 1
    ts = ts - (ts % iCount) + iCount
  }
  const body = {
    jsonrpc: '2.0',
    method: 'LMT_handle_texts',
    id,
    params: {
      texts: texts.map(text => ({ text, requestAlternatives: alternatives })),
      splitting: 'newlines',
      lang: {
        source_lang_user_selected: deeplLang(from),
        target_lang: deeplLang(to),
      },
      timestamp: ts,
      commonJobParams: { wasSpoken: false, transcribe_as: '' },
    },
  }
  let json = JSON.stringify(body)
  // DeepL fingerprints its own clients by this exact serialization quirk
  if ((id + 5) % 29 === 0 || (id + 3) % 13 === 0) {
    json = json.replace('"method":"', '"method" : "')
  } else {
    json = json.replace('"method":"', '"method": "')
  }
  return json
}

async function rawRequest(texts: string[], from: string, to: string, alternatives: number): Promise<Response> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Origin': 'https://www.deepl.com',
      'Referer': 'https://www.deepl.com/',
    },
    body: buildBody(texts, from, to, alternatives),
  })
}

/** One throttled, retry-once request; resolves to the result texts or null. */
async function requestTexts(texts: string[], from: string, to: string, alternatives: number): Promise<any[] | null> {
  if (Date.now() < cooldownUntil) return null
  try {
    let resp = await rawRequest(texts, from, to, alternatives)
    if (resp.status === 429) {
      // One backoff retry — a lone 429 from a burst usually clears fast
      await new Promise(r => setTimeout(r, RETRY_WAIT_MS))
      resp = await rawRequest(texts, from, to, alternatives)
    }
    if (resp.status === 429) {
      cooldownUntil = Date.now() + COOLDOWN_MS
      return null
    }
    if (!resp.ok) return null
    const data = await resp.json()
    const out = data?.result?.texts
    return Array.isArray(out) && out.length === texts.length ? out : null
  } catch {
    return null
  }
}

function cachePut(key: string, result: TranslationResult) {
  cache.set(key, result)
  if (cache.size > 2000) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
}

/** Best-effort DeepL translation; returns empty text on any failure. */
export async function translateDeepL(text: string, from: string, to: string): Promise<TranslationResult> {
  const empty: TranslationResult = { text: '', alternatives: [] }
  if (!text.trim() || from === to) return empty
  const cacheKey = `${text}:${from}:${to}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  if (Date.now() < cooldownUntil) return empty

  // Chain onto the queue so concurrent lookups are throttled, not fired at once
  const run = queue.then(async (): Promise<TranslationResult> => {
    const texts = await requestTexts([text], from, to, 3)
    const t = texts?.[0]
    if (!t?.text) return empty
    const result: TranslationResult = {
      text: t.text,
      alternatives: (t.alternatives || []).map((a: any) => a.text).filter(Boolean),
    }
    cachePut(cacheKey, result)
    return result
  })
  // Keep the queue chain alive regardless of this call's outcome
  queue = run.catch(() => {})
  return run
}

/**
 * Full-page mode: many bubble texts per request (the endpoint takes an
 * array natively). Best-effort — failed texts come back as '' and the
 * caller fills them via Google.
 */
export async function translateBatchDeepL(texts: string[], from: string, to: string): Promise<string[]> {
  const results: string[] = new Array(texts.length).fill('')
  if (from === to) return [...texts]

  const missing: number[] = []
  for (let i = 0; i < texts.length; i++) {
    if (!texts[i].trim()) continue
    const cached = cache.get(`${texts[i]}:${from}:${to}`)
    if (cached) results[i] = cached.text
    else missing.push(i)
  }
  if (missing.length === 0) return results

  // Modest chunks keep individual requests inconspicuous
  const chunks: number[][] = []
  for (let i = 0; i < missing.length; i += 20) chunks.push(missing.slice(i, i + 20))

  const run = queue.then(async () => {
    for (const chunk of chunks) {
      const out = await requestTexts(chunk.map(i => texts[i]), from, to, 0)
      if (!out) continue
      chunk.forEach((idx, j) => {
        const t = (out[j]?.text || '').trim()
        if (!t) return
        results[idx] = t
        cachePut(`${texts[idx]}:${from}:${to}`, { text: t, alternatives: [] })
      })
    }
    return results
  })
  queue = run.catch(() => {})
  return run
}
