import initSqlJs from 'sql.js'
import type { ImportedEntry } from './csv-import'
import type { LearningLevel } from './types'

// Reads a Lute (lute3) SQLite database directly. Schema:
//   words:     WoID, WoLgID, WoText, WoTextLC, WoStatus, WoTranslation, WoTokenCount
//   languages: LgID, LgName
// WoStatus: 1–5 = learning stages, 98 = ignored, 99 = well known, 0 = unknown.
// WoTokenCount > 1 marks multi-word terms (skipped — znam tracks single lemmas).

export interface LuteImport {
  entries: ImportedEntry[]
  languages: string[] // distinct LgName values found
  skippedPhrases: number
}

function mapStatus(status: number): { status: 'learning' | 'known' | 'ignored'; level?: LearningLevel } | null {
  if (status >= 1 && status <= 5) return { status: 'learning', level: status as LearningLevel }
  if (status === 99) return { status: 'known' }
  if (status === 98) return { status: 'ignored' }
  return null // 0 = unknown → nothing to import
}

let sqlJsPromise: Promise<any> | null = null

function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: () => browser.runtime.getURL('/sql-wasm.wasm' as any),
    })
  }
  return sqlJsPromise
}

export async function parseLuteDb(buffer: ArrayBuffer): Promise<LuteImport> {
  const SQL = await loadSqlJs()
  const db = new SQL.Database(new Uint8Array(buffer))
  try {
    // Join language names when the tables exist; fall back gracefully.
    let sql =
      'SELECT w.WoText AS text, w.WoStatus AS status, w.WoTranslation AS translation, ' +
      'w.WoTokenCount AS tokens, l.LgName AS lang ' +
      'FROM words w LEFT JOIN languages l ON w.WoLgID = l.LgID'
    let res: any[]
    try {
      res = db.exec(sql)
    } catch {
      // Older/variant schema without a languages table
      sql = 'SELECT WoText AS text, WoStatus AS status, WoTranslation AS translation, WoTokenCount AS tokens, NULL AS lang FROM words'
      res = db.exec(sql)
    }
    if (res.length === 0) return { entries: [], languages: [], skippedPhrases: 0 }

    const cols: string[] = res[0].columns
    const idx = (name: string) => cols.indexOf(name)
    const iText = idx('text')
    const iStatus = idx('status')
    const iTrans = idx('translation')
    const iTokens = idx('tokens')
    const iLang = idx('lang')

    const entries: ImportedEntry[] = []
    const languages = new Set<string>()
    let skippedPhrases = 0

    for (const row of res[0].values as any[][]) {
      const text = String(row[iText] ?? '').trim()
      if (!text) continue
      const mapped = mapStatus(Number(row[iStatus] ?? 0))
      if (!mapped) continue
      const lang = iLang >= 0 ? (row[iLang] ? String(row[iLang]) : undefined) : undefined
      if (lang) languages.add(lang)
      // Multi-word terms: prefer WoTokenCount, fall back to whitespace check
      const tokens = iTokens >= 0 ? Number(row[iTokens] ?? 1) : (/\s/.test(text) ? 2 : 1)
      if (tokens > 1 || /\s/.test(text)) {
        skippedPhrases++
        continue
      }
      entries.push({
        lemmaOrForm: text,
        translation: iTrans >= 0 && row[iTrans] ? String(row[iTrans]).replace(/\s+/g, ' ').trim() : undefined,
        language: lang,
        status: mapped.status,
        level: mapped.level,
      })
    }
    return { entries, languages: [...languages], skippedPhrases }
  } finally {
    db.close()
  }
}
