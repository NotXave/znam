// ── Word knowledge ──────────────────────────────────────────

export type WordStatus = 'learning' | 'known' | 'ignored'

/** Lute-style learning stages: 1 = just met (red) … 5 = almost known (green). */
export type LearningLevel = 1 | 2 | 3 | 4 | 5

export interface WordRecord {
  lang: string
  lemma: string // IDB key [lang, lemma]
  status: WordStatus
  level?: LearningLevel // only meaningful while status === 'learning'
  translation?: string
  context?: string
  source: 'click' | 'page-read' | 'calibration' | 'import' | 'manual'
  createdAt: number
  updatedAt: number
}

/** Resolved classification of a surface token. 'name' = proper-noun heuristic. */
export interface TokenInfo {
  lemma: string
  status: WordStatus | 'unknown' | 'name'
  level?: LearningLevel
}

export interface ScoreResult {
  /** knownTokens / countableTokens, 0..1. */
  score: number
  countableTokens: number
  knownTokens: number
  learningTokens: number
  unknownTokens: number
  /** Capped sample of unknown lemmas for display. */
  uniqueUnknown: string[]
}

// ── Library ─────────────────────────────────────────────────

export interface LibraryEntry {
  id: string // normalized-URL hash
  url: string
  title: string
  lang: string
  kind: 'page' | 'youtube'
  score: number
  countableTokens: number
  knownTokens: number
  uniqueLemmas: number
  unknownLemmas: number
  /** lemma → token count; lets the library rescore without refetching. */
  lemmaCounts: Record<string, number>
  excerpt: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

// ── Language data ───────────────────────────────────────────

export interface LanguageState {
  lang: string
  dictReady: boolean
  dictForms: number
  freqReady: boolean
  freqLemmas: number
  calibratedAt?: number
  counts: { learning: number; known: number; ignored: number }
}

// ── Settings ────────────────────────────────────────────────

export interface Settings {
  /** Language being learned — the language of pages the reader analyzes. */
  targetLanguage: string
  /** Translation target when clicking words. */
  nativeLanguage: string
  primaryTranslation: 'google' | 'reverso' | 'deepl'
  /** Hostnames where the reader activates automatically. */
  autoHosts: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  targetLanguage: 'pl',
  nativeLanguage: 'de',
  primaryTranslation: 'google',
  autoHosts: [],
}

// ── Lookup results (reused from manga-translator) ───────────

export interface TranslationResult {
  text: string
  alternatives: string[]
}

export interface ReversoResult {
  translations: string[]
  examples: { source: string; target: string }[]
}

export interface DictEntry {
  word: string
  phonetic?: string
  partOfSpeech: string
  definitions: string[]
  examples: string[]
}

// ── YouTube (reused from language-reactor-clone) ────────────

export interface SubtitleCue {
  start: number
  end: number
  text: string
}

// ── Messaging ───────────────────────────────────────────────

export type Message =
  | { type: 'TRANSLATE'; payload: { text: string; from: string; to: string } }
  | { type: 'REVERSO_LOOKUP'; payload: { text: string; from: string; to: string } }
  | { type: 'DEEPL_LOOKUP'; payload: { text: string; from: string; to: string } }
  | { type: 'DICTIONARY_LOOKUP'; payload: { word: string; lang: string } }
  /** tokens are unique surface forms → Record<token, TokenInfo>. */
  | { type: 'ANALYZE_TOKENS'; payload: { lang: string; tokens: string[] } }
  | {
      type: 'SET_WORD_STATUS'
      payload: {
        lang: string
        lemma: string
        status: WordStatus | 'unknown' // 'unknown' deletes the record (reset)
        level?: LearningLevel
        translation?: string
        context?: string
        source: WordRecord['source']
      }
    }
  | { type: 'MARK_PAGE_READ'; payload: { lang: string; lemmas: string[] } }
  | { type: 'SAVE_LIBRARY_ENTRY'; payload: Omit<LibraryEntry, 'createdAt' | 'updatedAt'> }
  | { type: 'GET_LIBRARY'; payload: { lang?: string } }
  | { type: 'SET_LIBRARY_PINNED'; payload: { id: string; pinned: boolean } }
  | { type: 'DELETE_LIBRARY_ENTRY'; payload: { id: string } }
  | { type: 'GET_LANGUAGE_STATE'; payload: { lang: string } }
  | { type: 'GET_WORDS'; payload: { lang: string; status?: WordStatus } }
  | {
      type: 'IMPORT_WORDS'
      payload: {
        lang: string
        entries: { lemmaOrForm: string; translation?: string; context?: string; status?: WordStatus; level?: LearningLevel }[]
        /** Default status for entries that don't carry their own. */
        status: WordStatus
      }
    }
  | { type: 'CALIBRATION_SAMPLE'; payload: { lang: string } }
  | { type: 'CALIBRATION_ESTIMATE'; payload: { answers: { rank: number; known: boolean }[] } }
  | { type: 'CALIBRATION_APPLY'; payload: { lang: string; topN: number } }
  | { type: 'SCORE_VIDEOS'; payload: { lang: string; videoIds: string[] } }
  | { type: 'GET_SETTINGS' }
  | { type: 'SETTINGS_UPDATED'; payload: Settings }
  /** Popup/command → content script. */
  | { type: 'TOGGLE_READER' }
  | { type: 'GET_READER_STATE' }

/** Port 'language-setup': app page → background request. */
export type SetupRequest =
  | { type: 'SETUP_LANGUAGE'; lang: string }
  | { type: 'SETUP_LANGUAGE_LOCAL'; lang: string; lemmasTsv: string; freqTsv: string }

/** Port 'language-setup': background → app page events. */
export type SetupEvent =
  | { type: 'PROGRESS'; step: 'download' | 'parse' | 'store'; pct: number; detail: string }
  | { type: 'DONE'; state: LanguageState }
  | { type: 'ERROR'; error: string }
