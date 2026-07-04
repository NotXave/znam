import type { ReversoResult } from './types'

const LANGUAGE_MAP: Record<string, string> = {
  'zh-CN': 'chi',
  'zh-TW': 'chi',
  'ja': 'jpn',
  'ko': 'kor',
  'ar': 'ara',
  'he': 'heb',
}

function mapLang(code: string): string {
  return LANGUAGE_MAP[code] || code
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'

async function fetchWithHeaders(url: string, options: RequestInit, ms = 5000): Promise<Response | null> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(id)
  }
}

export async function lookupReverso(word: string, from: string, to: string): Promise<ReversoResult> {
  // Try bst-query-service API
  try {
    const resp = await fetchWithHeaders('https://context.reverso.net/bst-query-service', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://context.reverso.net',
        'Referer': 'https://context.reverso.net/',
        'User-Agent': UA,
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        source_text: word,
        source_lang: mapLang(from),
        target_lang: mapLang(to),
      }),
    })

    if (resp && resp.ok) {
      const data = await resp.json()
      const translations = extractTranslations(data)
      const examples = extractExamples(data)
      if (translations.length > 0) return { translations, examples }
    }
  } catch {}

  // Fallback: scrape public translation page
  try {
    const langNames: Record<string, string> = {
      en: 'english', de: 'german', fr: 'french', es: 'spanish', it: 'italian',
      pt: 'portuguese', nl: 'dutch', ru: 'russian', pl: 'polish',
    }
    const url = `https://context.reverso.net/translation/${langNames[from] || from}-${langNames[to] || to}/${encodeURIComponent(word)}`
    const resp = await fetchWithHeaders(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://context.reverso.net/',
      },
    })

    if (resp && resp.ok) {
      const html = await resp.text()
      const translations: string[] = []
      const seen = new Set<string>()
      const re = /<span[^>]*class="[^"]*display-term[^"]*"[^>]*>([^<]+)<\/span>/gi
      let m
      while ((m = re.exec(html)) !== null) {
        const t = m[1].trim()
        if (t && !seen.has(t)) { seen.add(t); translations.push(t) }
      }
      if (translations.length > 0) return { translations, examples: [] }
    }
  } catch {}

  return { translations: [], examples: [] }
}

function extractTranslations(data: any): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  const add = (t: string) => {
    const clean = t?.replace(/\s+/g, ' ').trim()
    if (clean && !seen.has(clean)) {
      seen.add(clean)
      result.push(clean)
    }
  }

  if (data?.responseData) {
    if (Array.isArray(data.responseData)) {
      data.responseData.forEach((d: any) => add(d.translation || d.target || d.source))
    }
  }

  if (data?.translations) {
    if (Array.isArray(data.translations)) {
      data.translations.forEach((t: any) => add(typeof t === 'string' ? t : t.translation || t.target || ''))
    }
  }

  return result.slice(0, 10)
}

function extractExamples(data: any): { source: string; target: string }[] {
  const result: { source: string; target: string }[] = []

  const addExample = (src: string, tgt: string) => {
    const s = src?.replace(/\s+/g, ' ').trim()
    const t = tgt?.replace(/\s+/g, ' ').trim()
    if (s && t) result.push({ source: s, target: t })
  }

  if (data?.context) {
    if (Array.isArray(data.context)) {
      data.context.forEach((item: any) => {
        if (Array.isArray(item) && item.length >= 2) {
          addExample(item[0], item[1])
        }
      })
    }
  }

  if (data?.examples) {
    if (Array.isArray(data.examples)) {
      data.examples.forEach((ex: any) => {
        addExample(ex.source || ex[0], ex.target || ex[1])
      })
    }
  }

  return result.slice(0, 5)
}
