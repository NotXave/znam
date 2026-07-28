import { getMorphForms, getMorphLemmas, putMorphRows, countMorphRows, type MorphRow } from '../db'
import type { Paradigm } from './generator'

/**
 * IndexedDB-backed access to the tagged inflection table. This is the one
 * module in utils/grammar/ that touches browser APIs; everything else stays
 * pure so it can be unit-tested.
 */

/** Parse `lemma \t pos \t tag \t form` rows from the bundled TSV. */
export function parseMorphTsv(lang: string, text: string): MorphRow[] {
  const out: MorphRow[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    const [lemma, pos, tag, form] = line.replace(/\r$/, '').split('\t')
    if (!lemma || !pos || !tag || !form) continue
    out.push({ lang, lemma, pos: pos as MorphRow['pos'], tag, form })
  }
  return out
}

/**
 * Install the bundled table into IndexedDB, reporting progress.
 * Written in chunks so a 23k-row insert does not block the UI thread.
 */
export async function installMorph(
  lang: string,
  text: string,
  onProgress?: (pct: number, detail: string) => void,
): Promise<number> {
  const rows = parseMorphTsv(lang, text)
  const CHUNK = 2000
  for (let i = 0; i < rows.length; i += CHUNK) {
    await putMorphRows(rows.slice(i, i + CHUNK))
    onProgress?.(
      Math.round(((i + CHUNK) / rows.length) * 100),
      `${Math.min(i + CHUNK, rows.length)} / ${rows.length} Formen`,
    )
  }
  return rows.length
}

export async function morphInstalled(lang: string): Promise<number> {
  return countMorphRows(lang)
}

/** Load full paradigms for a set of lemmas, as the generator wants them. */
export async function loadParadigms(
  lang: string,
  lemmas: string[],
): Promise<Map<string, Paradigm>> {
  const out = new Map<string, Paradigm>()
  await Promise.all(
    lemmas.map(async (lemma) => {
      const rows = await getMorphForms(lang, lemma)
      if (rows.length === 0) return
      const paradigm: Paradigm = new Map()
      for (const row of rows) paradigm.set(row.tag, row.form)
      out.set(lemma, paradigm)
    }),
  )
  return out
}

/** Every lemma with a verified paradigm — the pool templates may draw from. */
export async function usableLemmas(lang: string): Promise<string[]> {
  return [...(await getMorphLemmas(lang))]
}
