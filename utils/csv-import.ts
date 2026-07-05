import type { LearningLevel, WordRecord, WordStatus } from './types'

export interface ImportedEntry {
  lemmaOrForm: string
  translation?: string
  context?: string
  language?: string
  /** Per-entry status (Lute exports carry one); overrides the import default. */
  status?: WordStatus
  /** Lute learning stage 1–5, kept as-is. */
  level?: LearningLevel
}

export interface ParsedVocabFile {
  format: 'znam' | 'lute' | 'anki' | 'generic'
  entries: ImportedEntry[]
  /** Multi-word terms that were skipped (znam tracks single lemmas). */
  skippedPhrases: number
}

/** RFC-4180-style parser with a configurable delimiter (quotes, escaped quotes, CRLF). */
export function parseDelimited(text: string, delim: string): string[][] {
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
    } else if (c === delim) {
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

export function parseCsv(text: string): string[][] {
  return parseDelimited(text, ',')
}

function stripHtml(s: string): string {
  return s
    .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '$1') // Anki cloze → inner text
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos|auml|ouml|uuml|Auml|Ouml|Uuml|szlig);/g, (_, name) => (
      { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
        auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' } as Record<string, string>
    )[name])
    .replace(/\s+/g, ' ')
    .trim()
}

function isSingleWord(s: string): boolean {
  return !!s && !/\s/.test(s) && s.length < 40
}

/** Lute status column → znam status. Lute: 1–5 learning levels, W/99 well known, I/98 ignored. */
function luteStatus(s: string | undefined): { status: WordStatus; level?: LearningLevel } | undefined {
  const v = (s || '').trim().toLowerCase()
  if (v === 'w' || v === '99') return { status: 'known' }
  if (v === 'i' || v === '98') return { status: 'ignored' }
  if (/^[1-5]$/.test(v)) return { status: 'learning', level: Number(v) as LearningLevel }
  return undefined
}

/** Lute "Export terms" CSV: header row with term/translation/language/status columns. */
function parseLuteCsv(rows: string[][]): ParsedVocabFile {
  const header = rows[0].map(h => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const iTerm = col('term')
  const iTrans = col('translation')
  const iLang = col('language')
  const iStatus = col('status')

  const entries: ImportedEntry[] = []
  let skippedPhrases = 0
  for (let i = 1; i < rows.length; i++) {
    const term = stripHtml(rows[i][iTerm] || '')
    if (!term) continue
    if (!isSingleWord(term)) {
      skippedPhrases++
      continue
    }
    const mapped = iStatus >= 0 ? luteStatus(rows[i][iStatus]) : undefined
    entries.push({
      lemmaOrForm: term,
      translation: iTrans >= 0 ? stripHtml(rows[i][iTrans] || '') || undefined : undefined,
      language: iLang >= 0 ? rows[i][iLang]?.trim() || undefined : undefined,
      status: mapped?.status,
      level: mapped?.level,
    })
  }
  return { format: 'lute', entries, skippedPhrases }
}

/** Anki "Notes in Plain Text" export: #-headers, then delimited fields (word, translation, …). */
function parseAnkiExport(text: string): ParsedVocabFile {
  let delim = '\t'
  // Metadata columns announced in the header (1-based): guid/notetype/deck/tags
  const skipCols = new Set<number>()
  const bodyLines: string[] = []
  for (const line of text.replace(/^﻿/, '').split('\n')) {
    if (line.startsWith('#')) {
      const sep = line.match(/^#separator:(.+)/i)
      if (sep) {
        const v = sep[1].trim().toLowerCase()
        delim = v === 'tab' ? '\t' : v === 'semicolon' ? ';' : v === 'comma' ? ',' : v === 'pipe' ? '|' : v.length === 1 ? v : '\t'
      }
      const col = line.match(/^#(?:guid|notetype|deck|tags) column:(\d+)/i)
      if (col) skipCols.add(Number(col[1]) - 1)
      continue
    }
    bodyLines.push(line)
  }
  const rows = parseDelimited(bodyLines.join('\n'), delim)
  const entries: ImportedEntry[] = []
  let skippedPhrases = 0
  for (const row of rows) {
    const fields = row.filter((_, i) => !skipCols.has(i)).map(stripHtml)
    const word = fields[0]
    if (!word) continue
    if (!isSingleWord(word)) {
      skippedPhrases++
      continue
    }
    entries.push({ lemmaOrForm: word, translation: fields.slice(1).find(Boolean) })
  }
  return { format: 'anki', entries, skippedPhrases }
}

/**
 * Auto-detect and parse a vocabulary file:
 * - Anki plain-text export (#separator headers or tab-separated)
 * - Lute term export (CSV with a `term` header column)
 * - manga-translator / language-reactor-clone CSV (word,translation,context,language,…)
 * - generic CSV/TSV (first column = word, second = translation)
 */
export function parseVocabFile(text: string): ParsedVocabFile {
  if (/^﻿?#separator:/im.test(text.slice(0, 200))) return parseAnkiExport(text)

  const firstLine = text.replace(/^﻿/, '').split('\n', 1)[0] || ''
  if (firstLine.includes('\t') && !firstLine.includes(',')) return parseAnkiExport(text)

  const rows = parseCsv(text)
  if (rows.length === 0) return { format: 'generic', entries: [], skippedPhrases: 0 }
  const header = rows[0].map(h => h.trim().toLowerCase())
  if (header.includes('term')) return parseLuteCsv(rows)

  const entries = parseVocabCsv(text)
  const single = entries.filter(e => isSingleWord(e.lemmaOrForm))
  return {
    format: header[0] === 'word' ? 'znam' : 'generic',
    entries: single,
    skippedPhrases: entries.length - single.length,
  }
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
