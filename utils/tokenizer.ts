/** Unicode-aware word matcher: letters with inner apostrophes/hyphens. */
const WORD_RE = /\p{L}[\p{L}'’-]*\p{L}|\p{L}/gu

/** Extract surface tokens (original case) from running text. */
export function tokenize(text: string): string[] {
  return text.match(WORD_RE) ?? []
}

/** Strip surrounding punctuation from a display token, keep inner letters/digits. */
export function stripPunctuation(part: string): string {
  return part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

/** True if the token contains at least one letter (numbers/symbols never count). */
export function isWordToken(token: string): boolean {
  return /\p{L}/u.test(token)
}

export function isCapitalized(token: string): boolean {
  const first = token[0]
  return !!first && first !== first.toLowerCase() && first === first.toUpperCase()
}
