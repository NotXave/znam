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

function buildBody(text: string, from: string, to: string): string {
  const id = Math.floor(Math.random() * 99999 + 8300000) * 1000
  let iCount = (text.match(/i/g) || []).length
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
      texts: [{ text, requestAlternatives: 3 }],
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

async function rawRequest(text: string, from: string, to: string): Promise<Response> {
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
    body: buildBody(text, from, to),
  })
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
    if (Date.now() < cooldownUntil) return empty
    try {
      let resp = await rawRequest(text, from, to)
      if (resp.status === 429) {
        // One backoff retry — a lone 429 from a burst usually clears fast
        await new Promise(r => setTimeout(r, RETRY_WAIT_MS))
        resp = await rawRequest(text, from, to)
      }
      if (resp.status === 429) {
        cooldownUntil = Date.now() + COOLDOWN_MS
        return empty
      }
      if (!resp.ok) return empty
      const data = await resp.json()
      const t = data?.result?.texts?.[0]
      if (!t?.text) return empty
      const result: TranslationResult = {
        text: t.text,
        alternatives: (t.alternatives || []).map((a: any) => a.text).filter(Boolean),
      }
      cache.set(cacheKey, result)
      if (cache.size > 2000) {
        const first = cache.keys().next().value
        if (first) cache.delete(first)
      }
      return result
    } catch {
      return empty
    }
  })
  // Keep the queue chain alive regardless of this call's outcome
  queue = run.catch(() => {})
  return run
}
