import type { TranslationResult } from './types'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'

const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
]

const translationCache = new Map<string, TranslationResult>()

function parseGoogleResponse(data: any): string {
  try {
    if (Array.isArray(data) && Array.isArray(data[0]) && data[0].length > 0) {
      return data[0].map((part: any) => part[0]).join('').trim()
    }
  } catch {}
  return ''
}

function fetchWithTimeout(url: string, ms: number, headers?: Record<string, string>): Promise<Response> {
  return Promise.race([
    fetch(url, { headers }),
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

async function tryGoogleDirect(text: string, from: string, to: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
  const resp = await fetchWithTimeout(url, 4000, {
    'User-Agent': UA,
    'Referer': 'https://translate.google.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from googleapis`)
  const data = await resp.json()
  const t = parseGoogleResponse(data)
  if (!t) throw new Error('empty')
  return t
}

function tryXhr(text: string, from: string, to: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
    xhr.open('GET', url, true)
    xhr.setRequestHeader('User-Agent', UA)
    xhr.setRequestHeader('Referer', 'https://translate.google.com/')
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*')
    xhr.timeout = 4000
    xhr.onload = () => {
      if (xhr.status !== 200) { reject(new Error(`XHR ${xhr.status}`)); return }
      try {
        const data = JSON.parse(xhr.responseText)
        const t = parseGoogleResponse(data)
        if (!t) { reject(new Error('empty')); return }
        resolve(t)
      } catch (e) { reject(e) }
    }
    xhr.onerror = () => reject(new Error('XHR error'))
    xhr.ontimeout = () => reject(new Error('XHR timeout'))
    xhr.send()
  })
}

async function tryGoogleMobile(text: string, from: string, to: string): Promise<string> {
  const url = `https://translate.google.com/m?sl=${from}&tl=${to}&q=${encodeURIComponent(text)}`
  const resp = await fetchWithTimeout(url, 4000, {
    'User-Agent': UA,
    'Referer': 'https://translate.google.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from mobile`)
  const html = await resp.text()
  const m = html.match(/<div[^>]*class="result-container"[^>]*>([\s\S]*?)<\/div>/i)
  if (!m) throw new Error('no result-container')
  return m[1].replace(/<[^>]*>/g, '').trim()
}

async function tryViaProxy(text: string, from: string, to: string): Promise<string> {
  const directUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
  const errors: string[] = []
  for (const proxy of CORS_PROXIES) {
    try {
      const url = proxy(directUrl)
      const resp = await fetchWithTimeout(url, 5000, {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
      })
      if (!resp.ok) { errors.push(`proxy ${resp.status}`); continue }
      const data = await resp.json()
      const t = parseGoogleResponse(data)
      if (!t) { errors.push('proxy empty'); continue }
      return t
    } catch (e: any) { errors.push(e.message || String(e)) }
  }
  throw new Error(`All proxies: ${errors.join('; ')}`)
}

export async function translate(text: string, from: string, to: string): Promise<TranslationResult> {
  if (from === to) return { text, alternatives: [] }
  const cacheKey = `${text}:${from}:${to}`
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)!

  const attempts: { name: string; fn: () => Promise<string> }[] = [
    { name: 'googleapis-fetch', fn: () => tryGoogleDirect(text, from, to) },
    { name: 'googleapis-xhr', fn: () => tryXhr(text, from, to) },
    { name: 'mobile-scrape', fn: () => tryGoogleMobile(text, from, to) },
    { name: 'proxy', fn: () => tryViaProxy(text, from, to) },
  ]

  let resultText = ''
  const errors: string[] = []
  for (const { name, fn } of attempts) {
    try {
      resultText = await fn()
      break
    } catch (e: any) {
      errors.push(`${name}: ${e.message || String(e)}`)
    }
  }

  const result: TranslationResult = { text: resultText, alternatives: [] }
  if (resultText) {
    // Only cache successes — a failed lookup should be retryable
    translationCache.set(cacheKey, result)
    if (translationCache.size > 5000) {
      const firstKey = translationCache.keys().next().value
      if (firstKey) translationCache.delete(firstKey)
    }
  } else {
    console.error(`[MT] All translate methods failed for "${text}" (${from}→${to}):`, errors.join(' | '))
  }
  return result
}

// ── Batch translation ───────────────────────────────────────

// Sentinel survives Google Translate untouched because it contains no letters.
const SENTINEL = '\n<<<###>>>\n'
const SENTINEL_SPLIT = /\s*<{2,3}\s*#{2,4}\s*>{2,3}\s*/

const MIN_REQUEST_INTERVAL_MS = 350
let lastRequestAt = 0

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

/**
 * Translate many texts in one request where possible.
 * Returns results in input order; failed segments are ''.
 */
export async function translateBatch(texts: string[], from: string, to: string): Promise<string[]> {
  if (texts.length === 0) return []
  if (from === to) return [...texts]

  const results: string[] = new Array(texts.length).fill('')
  const missing: number[] = []
  for (let i = 0; i < texts.length; i++) {
    const cached = translationCache.get(`${texts[i]}:${from}:${to}`)
    if (cached) results[i] = cached.text
    else missing.push(i)
  }
  if (missing.length === 0) return results

  // Chunk to stay well under URL length limits (~2k chars of text per request)
  const chunks: number[][] = []
  let current: number[] = []
  let currentLen = 0
  for (const idx of missing) {
    const len = texts[idx].length + SENTINEL.length
    if (currentLen + len > 2000 && current.length > 0) {
      chunks.push(current)
      current = []
      currentLen = 0
    }
    current.push(idx)
    currentLen += len
  }
  if (current.length > 0) chunks.push(current)

  for (const chunk of chunks) {
    await throttle()
    const joined = chunk.map(i => texts[i]).join(SENTINEL)
    const { text: translated } = await translate(joined, from, to)
    const parts = translated ? translated.split(SENTINEL_SPLIT).map(s => s.trim()) : []

    if (parts.length === chunk.length) {
      chunk.forEach((idx, j) => {
        results[idx] = parts[j]
        translationCache.set(`${texts[idx]}:${from}:${to}`, { text: parts[j], alternatives: [] })
      })
    } else {
      // Sentinel got mangled — fall back to per-text requests
      for (const idx of chunk) {
        await throttle()
        const r = await translate(texts[idx], from, to)
        results[idx] = r.text
      }
    }
  }
  return results
}
