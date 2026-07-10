import type { SiteAdapter } from './adapter'
import { observeImages, isMangaSizedImage } from './adapter'

function onChapterPage(): boolean {
  return location.pathname.startsWith('/chapter/')
}

function isPageImage(img: HTMLImageElement): boolean {
  if (!onChapterPage()) return false
  const src = img.currentSrc || img.src
  if (!src) return false
  // Reader serves pages from MD@Home nodes, uploads.mangadex.org, or as blob: URLs
  return isMangaSizedImage(img)
}

export const mangadexAdapter: SiteAdapter = {
  id: 'mangadex',

  matches(url: URL): boolean {
    return url.hostname === 'mangadex.org'
  },

  findPageImages(): HTMLImageElement[] {
    return Array.from(document.querySelectorAll('img')).filter(
      img => img.complete && isPageImage(img),
    )
  },

  observe(onNew) {
    return observeImages(img => img.complete && isPageImage(img), onNew)
  },

  getImageUrl(img: HTMLImageElement): string {
    return img.currentSrc || img.src
  },
}
