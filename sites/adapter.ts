export interface SiteAdapter {
  id: string
  matches(url: URL): boolean
  /** Current reader page images (may be called repeatedly). */
  findPageImages(): HTMLImageElement[]
  /** Watch for new images (lazy-load, SPA navigation). Returns a cleanup function. */
  observe(onNew: (imgs: HTMLImageElement[]) => void): () => void
  /** Resolve the real image URL (data-src, srcset, ...). */
  getImageUrl(img: HTMLImageElement): string
}

const registry: SiteAdapter[] = []

export function registerAdapter(adapter: SiteAdapter): void {
  registry.push(adapter)
}

export function pickAdapter(url: URL): SiteAdapter | null {
  return registry.find(a => a.matches(url)) ?? null
}

/** Shared MutationObserver-based image watcher used by most adapters. */
export function observeImages(
  isCandidate: (img: HTMLImageElement) => boolean,
  onNew: (imgs: HTMLImageElement[]) => void,
): () => void {
  const seen = new WeakSet<HTMLImageElement>()

  const collect = (): HTMLImageElement[] => {
    const fresh: HTMLImageElement[] = []
    for (const img of Array.from(document.querySelectorAll('img'))) {
      if (seen.has(img) || !isCandidate(img)) continue
      seen.add(img)
      fresh.push(img)
    }
    return fresh
  }

  const initial = collect()
  if (initial.length > 0) onNew(initial)

  let scheduled = false
  const recheck = () => {
    if (scheduled) return
    scheduled = true
    setTimeout(() => {
      scheduled = false
      const fresh = collect()
      if (fresh.length > 0) onNew(fresh)
    }, 250)
  }

  const observer = new MutationObserver(recheck)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'data-src'],
  })

  // Lazy-loaded pages only become candidates once the image data arrives —
  // mutations alone miss that moment (img.complete is still false then).
  const onLoad = (e: Event) => {
    if ((e.target as HTMLElement)?.tagName === 'IMG') recheck()
  }
  document.addEventListener('load', onLoad, true)

  return () => {
    observer.disconnect()
    document.removeEventListener('load', onLoad, true)
  }
}

/** An image big enough to plausibly be a manga page. */
export function isMangaSizedImage(img: HTMLImageElement): boolean {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  return w >= 400 && h >= 400
}
