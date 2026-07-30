/**
 * Fetching German glosses for a set of lemmas.
 *
 * Split out of utils/vocab-bg.ts so it can be tested. The network is
 * unreachable in the environment this was developed in, which meant the one
 * part of Słówka that could not be exercised was also the part that had
 * already produced its worst bug: a 317-second hang at session start, when a
 * blocked endpoint timed out per chunk, fell back to one request per word, and
 * timed out again on each of those.
 *
 * Everything here is a pure function of its inputs plus an injected
 * `TranslateFn`, so a fake can reproduce hanging, throwing, echoing and
 * miscounting responses without a network.
 */

/** The shape of utils/translate.ts's `translateBatch`. */
export interface TranslateFn {
  (texts: string[], from: string, to: string): Promise<string[]>
}

/**
 * Lemmas per request.
 *
 * Small on purpose. The batch endpoint joins texts with a sentinel and
 * occasionally mangles it; a small chunk keeps the blast radius of one bad
 * response down.
 */
export const GLOSS_CHUNK = 25

/** Total wall-clock allowance for a session's worth of glosses. */
export const TRANSLATE_BUDGET_MS = 8000

/** Never ask for more than a session could possibly use. */
export const MAX_GLOSS_REQUESTS = 60

export interface GlossOptions {
  chunk?: number
  budgetMs?: number
  max?: number
  now?: () => number
}

export interface GlossOutcome {
  /** lemma → gloss, only for lemmas that came back with a usable answer */
  glosses: Map<string, string>
  /** how many lemmas were sent */
  requested: number
  /** how many chunk requests were issued */
  requests: number
  /** true when the budget ran out or a request failed, so the result is partial */
  timedOut: boolean
}

/**
 * The lemmas that still need a gloss.
 *
 * Trivial, and exported anyway: "a card that already has a gloss costs no
 * network" is the property that makes Słówka work offline, and it deserves a
 * test that does not need IndexedDB to run.
 */
export function needGlosses<T extends { lemma: string; translation?: string }>(
  cards: T[],
): T[] {
  return cards.filter(c => !c.translation)
}

/**
 * A gloss identical to the word it glosses is not a translation.
 *
 * The batch endpoint returns the input unchanged when it cannot translate a
 * token — which is most of the time for an inflected Polish lemma it does not
 * recognise. Storing that would produce a card whose question and answer are
 * the same string.
 */
function isEcho(lemma: string, gloss: string): boolean {
  return gloss.toLowerCase() === lemma.toLowerCase()
}

/** Reject after `ms`, without leaving a timer holding the event loop open. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const alarm = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('translate budget')), Math.max(1, ms))
  })
  return Promise.race([promise, alarm]).finally(() => clearTimeout(timer))
}

export async function fetchGlosses(
  lemmas: string[],
  from: string,
  to: string,
  translate: TranslateFn,
  opts: GlossOptions = {},
): Promise<GlossOutcome> {
  const chunkSize = opts.chunk ?? GLOSS_CHUNK
  const budgetMs = opts.budgetMs ?? TRANSLATE_BUDGET_MS
  const max = opts.max ?? MAX_GLOSS_REQUESTS
  const now = opts.now ?? Date.now

  const wanted = [...new Set(lemmas.filter(Boolean))].slice(0, max)
  const glosses = new Map<string, string>()
  if (wanted.length === 0) {
    return { glosses, requested: 0, requests: 0, timedOut: false }
  }

  const deadline = now() + budgetMs
  let requests = 0
  let timedOut = false

  for (let i = 0; i < wanted.length; i += chunkSize) {
    if (now() >= deadline) {
      timedOut = true
      break
    }
    const batch = wanted.slice(i, i + chunkSize)
    let out: string[]
    try {
      requests++
      out = await withDeadline(translate(batch, from, to), deadline - now())
    } catch {
      // Offline, throttled, or out of time. Keep what earlier chunks returned
      // rather than discarding a partial result — an eight-word session is
      // still a session.
      timedOut = true
      break
    }

    // A response of the wrong length means the caller's index no longer
    // identifies the word. Dropping the chunk loses some glosses; trusting it
    // would give one card another card's answer, which is worse and silent.
    if (!Array.isArray(out) || out.length !== batch.length) continue

    batch.forEach((lemma, j) => {
      const gloss = (out[j] ?? '').trim()
      if (!gloss || isEcho(lemma, gloss)) return
      glosses.set(lemma, gloss)
    })
  }

  return { glosses, requested: wanted.length, requests, timedOut }
}
