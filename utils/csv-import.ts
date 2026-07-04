import type { WordRecord } from './types'

export interface ImportedEntry {
  lemmaOrForm: string
  translation?: string
  context?: string
  language?: string
}

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '') // strip UTF-8 BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)
  return rows
}

/**
 * Parse the vocabulary CSV exported by manga-translator / language-reactor-clone:
 * `word,translation,context,language,timestamp,reviewCount` (header optional).
 */
export function parseVocabCsv(text: string): ImportedEntry[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  let start = 0
  if (/^word$/i.test(rows[0][0]?.trim() || '')) start = 1
  const out: ImportedEntry[] = []
  for (let i = start; i < rows.length; i++) {
    const [word, translation, context, language] = rows[i]
    if (!word?.trim()) continue
    out.push({
      lemmaOrForm: word.trim(),
      translation: translation?.trim() || undefined,
      context: context?.trim() || undefined,
      language: language?.trim() || undefined,
    })
  }
  return out
}

function csvQuote(s: string): string {
  return `"${(s || '').replace(/"/g, '""')}"`
}

export function wordsToCsv(words: WordRecord[]): string {
  const header = 'lemma,status,translation,context,language,createdAt,source'
  const rows = words.map(w =>
    [
      csvQuote(w.lemma),
      w.status,
      csvQuote(w.translation || ''),
      csvQuote(w.context || ''),
      w.lang,
      new Date(w.createdAt).toISOString(),
      w.source,
    ].join(','),
  )
  // UTF-8 BOM so Excel opens it correctly
  return '﻿' + [header, ...rows].join('\n')
}

/** Anki-importable text: semicolon-separated, learning words only make sense. */
export function wordsToAnki(words: WordRecord[]): string {
  const lines = ['#separator:Semicolon', '#html:false', '#columns:Word;Translation;Context']
  for (const w of words) {
    const clean = (s: string) => (s || '').replace(/;/g, ',').replace(/\n/g, ' ')
    lines.push(`${clean(w.lemma)};${clean(w.translation || '')};${clean(w.context || '')}`)
  }
  return lines.join('\n')
}
