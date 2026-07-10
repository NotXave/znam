// Kept separate from tesseract-host.ts so the Chrome MV3 service worker can
// check language support without importing tesseract.js itself.
const TESS_LANG_MAP: Record<string, string> = {
  en: 'eng',
  pl: 'pol',
  auto: 'eng+pol',
}

export function toTesseractLangs(lang: string): string | null {
  return TESS_LANG_MAP[lang] ?? null
}
