import type { SiteAdapter } from './adapter'
import { observeImages, isMangaSizedImage } from './adapter'

function isPageImage(img: HTMLImageElement): boolean {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  // Generic heuristic: large portrait-ish images in the main content
  return w >= 500 && h >= 500 && isMangaSizedImage(img)
}

export const genericAdapter: SiteAdapter = {
  id: 'generic',

  matches(): boolean {
    return true
  },

  findPageImages(): HTMLImageElement[] {
    return Array.from(document.querySelectorAll('img')).filter(isPageImage)
  },

  observe(onNew) {
    return observeImages(img => img.complete && isPageImage(img), onNew)
  },

  getImageUrl(img: HTMLImageElement): string {
    return img.currentSrc || img.src
  },
}
