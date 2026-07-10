import type { SiteAdapter } from './adapter'
import { observeImages, isMangaSizedImage } from './adapter'

function onChapterPage(): boolean {
  return /\/chapters?\//.test(location.pathname)
}

function isPageImage(img: HTMLImageElement): boolean {
  if (!onChapterPage()) return false
  const src = img.currentSrc || img.src
  if (!src) return false
  return isMangaSizedImage(img)
}

export const weebcentralAdapter: SiteAdapter = {
  id: 'weebcentral',

  matches(url: URL): boolean {
    return /(^|\.)weebcentral\.com$/.test(url.hostname)
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
