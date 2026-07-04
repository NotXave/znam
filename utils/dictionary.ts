import type { DictEntry } from './types'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'

async function fetchWiktionary(url: string, ms = 6000): Promise<Response | null> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    return resp
  } catch {
    return null
  } finally {
    clearTimeout(id)
  }
}

async function fetchWiktionaryViaProxy(word: string, lang: string): Promise<DictEntry[]> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://${lang}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`)}`
  const resp = await fetchWiktionary(proxyUrl, 8000)
  if (!resp?.ok) return []
  const data = await resp.json()
  return parseRestResponse(data, lang)
}

export async function lookupWiktionary(word: string, lang: string): Promise<DictEntry[]> {
  const langCode = lang || 'en'

  // Primary: REST API
  const restUrl = `https://${langCode}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`
  const restResp = await fetchWiktionary(restUrl)
  if (restResp?.ok) {
    try {
      const data = await restResp.json()
      const entries = parseRestResponse(data, langCode)
      if (entries.length > 0) return entries
    } catch {}
  }

  // English REST API fallback
  if (langCode !== 'en') {
    const enUrl = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`
    const enResp = await fetchWiktionary(enUrl)
    if (enResp?.ok) {
      try {
        const data = await enResp.json()
        const entries = parseRestResponse(data, 'en')
        if (entries.length > 0) return entries
      } catch {}
    }
  }

  // CORS proxy fallback
  const proxyEntries = await fetchWiktionaryViaProxy(word, langCode)
  if (proxyEntries.length > 0) return proxyEntries
  if (langCode !== 'en') {
    const enProxy = await fetchWiktionaryViaProxy(word, 'en')
    if (enProxy.length > 0) return enProxy
  }

  // Last resort: old prop=extracts API
  try {
    const url = `https://en.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&prop=extracts&explaintext&format=json&origin=*`
    const resp = await fetchWiktionary(url)
    if (resp?.ok) {
      const data = await resp.json()
      return parseExtractResponse(data)
    }
  } catch {}

  return []
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function parseRestResponse(data: any, lang: string): DictEntry[] {
  const section = data?.[lang]
  if (!Array.isArray(section)) return []

  return section.map((entry: any) => {
    const pos = entry.partOfSpeech || 'unknown'
    const defs = (entry.definitions || []).map((d: any, i: number) => {
      const text = stripHtml(d.definition || '')
      if (!text) return ''
      return `${i + 1}. ${text}`
    }).filter(Boolean)
    const examples = (entry.definitions || []).flatMap((d: any) =>
      (d.examples || []).map((ex: any) => (typeof ex === 'string' ? ex : ex.text || ''))
    ).filter((e: string) => e.length > 0).slice(0, 3)

    return {
      word: '',
      partOfSpeech: pos,
      definitions: defs,
      examples,
    } as DictEntry
  }).filter((e: DictEntry) => e.definitions.length > 0)
}

// ── Legacy extract parser (fallback) ────────────────────────

const POS_KEYWORDS = new Set([
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
  'conjunction', 'interjection', 'article', 'determiner', 'numeral',
  'participle', 'gerund', 'infinitive', 'particle', 'prefix', 'suffix',
  'proper noun', 'phrase', 'idiom', 'abbreviation', 'acronym',
  'rzeczownik', 'czasownik', 'przymiotnik', 'przysłówek', 'zaimek',
  'przyimek', 'spójnik', 'wykrzyknik', 'liczebnik', 'partykuła',
])

function isPOSHeader(text: string): boolean {
  const lower = text.toLowerCase()
  return POS_KEYWORDS.has(lower) || POS_KEYWORDS.has(lower.replace(/^non-/, ''))
}

function parseExtractResponse(data: any): DictEntry[] {
  const pages = data?.query?.pages
  if (!pages) return []
  return Object.values(pages)
    .filter((p: any) => p.extract)
    .flatMap((page: any) => extractDefinitions((page as any).extract as string))
}

function extractDefinitions(text: string): DictEntry[] {
  const entries: DictEntry[] = []
  const lines = text.split('\n')
  let currentPos = ''
  let currentDefs: string[] = []
  let currentExamples: string[] = []
  let defCounter = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('=== ') && trimmed.endsWith(' ===')) {
      const header = trimmed.slice(4, -4).trim()
      if (isPOSHeader(header)) {
        if (currentPos && currentDefs.length > 0) {
          entries.push({ word: '', partOfSpeech: currentPos, definitions: [...currentDefs], examples: [...currentExamples] })
        }
        currentPos = header
        currentDefs = []
        currentExamples = []
        defCounter = 0
      }
      continue
    }
    if (currentPos && (trimmed.startsWith('# ') || /^#\d+ /.test(trimmed))) {
      const def = trimmed.replace(/^#\d* /, '').replace(/\.$/, '').trim()
      if (def) { defCounter++; currentDefs.push(`  ${defCounter}. ${def}`) }
      continue
    }
    if (currentPos && (trimmed.startsWith('#* ') || trimmed.startsWith('#*:'))) {
      const ex = trimmed.replace(/^#\*:? /, '').trim()
      if (ex && currentExamples.length < 3) currentExamples.push(ex)
      continue
    }
    if (currentPos && trimmed.startsWith('#:') && currentDefs.length > 0 && !currentDefs[currentDefs.length - 1].includes(':')) {
      const sub = trimmed.replace(/^#:\s*/, '').trim()
      if (sub) currentDefs[currentDefs.length - 1] += ` — ${sub}`
    }
  }
  if (currentPos && currentDefs.length > 0) {
    entries.push({ word: '', partOfSpeech: currentPos, definitions: [...currentDefs], examples: [...currentExamples] })
  }
  return entries
}
