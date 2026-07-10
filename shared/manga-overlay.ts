import type { OcrRegion } from '../utils/types'
import { stripPunctuation } from '../utils/tokenizer'

export interface LayerLangs { from: string; to: string }

interface LayerEntry {
  layer: HTMLElement
  img: HTMLImageElement
  resizeObserver: ResizeObserver
}

/** Translated text → clickable znam word spans (.ci-word). */
function splitIntoWordSpans(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue
    if (/^\s+$/.test(part)) {
      frag.appendChild(document.createTextNode(' '))
      continue
    }
    const span = document.createElement('span')
    span.className = 'ci-word znam-tword'
    span.dataset.word = stripPunctuation(part) || part
    span.textContent = part
    frag.appendChild(span)
  }
  return frag
}

/** Renders opaque patches with translated, clickable text over manga bubbles. */
export class MangaOverlay {
  private layers = new Map<string, LayerEntry>()

  /** Called with the clickable word spans each time a patch is filled. */
  onWords: ((spans: HTMLElement[]) => void) | null = null

  private createLayer(img: HTMLImageElement, imageId: string): HTMLElement | null {
    this.removeLayer(imageId)
    const parent = img.parentElement
    if (!parent) return null
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'

    const layer = document.createElement('div')
    layer.className = 'znam-manga-layer'
    layer.dataset.imageId = imageId
    const position = () => {
      layer.style.left = `${img.offsetLeft}px`
      layer.style.top = `${img.offsetTop}px`
      layer.style.width = `${img.offsetWidth}px`
      layer.style.height = `${img.offsetHeight}px`
    }
    position()
    const resizeObserver = new ResizeObserver(position)
    resizeObserver.observe(img)
    parent.appendChild(layer)
    this.layers.set(imageId, { layer, img, resizeObserver })
    return layer
  }

  private applyBox(el: HTMLElement, bbox: { x: number; y: number; w: number; h: number }, nw: number, nh: number) {
    el.style.left = `${(bbox.x / nw) * 100}%`
    el.style.top = `${(bbox.y / nh) * 100}%`
    el.style.width = `${(bbox.w / nw) * 100}%`
    el.style.height = `${(bbox.h / nh) * 100}%`
  }

  renderFullLayer(img: HTMLImageElement, imageId: string, regions: OcrRegion[], langs: LayerLangs): void {
    const layer = this.createLayer(img, imageId)
    if (!layer) return
    const nw = img.naturalWidth || 1
    const nh = img.naturalHeight || 1
    for (const region of regions) {
      const patch = document.createElement('div')
      patch.className = 'znam-patch znam-pending'
      patch.dataset.regionId = region.id
      patch.dataset.from = langs.from
      patch.dataset.to = langs.to
      if (region.bgColor) patch.dataset.bg = region.bgColor
      patch.title = region.text
      this.applyBox(patch, region.bbox, nw, nh)
      layer.appendChild(patch)
    }
  }

  private applyPatchColor(patch: HTMLElement): void {
    const bg = patch.dataset.bg
    const m = bg?.match(/rgb\((\d+),(\d+),(\d+)\)/)
    if (!m) return
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])]
    patch.style.background = bg!
    patch.style.color = 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#111' : '#fff'
  }

  fillPatch(imageId: string, regionId: string, translatedText: string): void {
    const entry = this.layers.get(imageId)
    if (!entry) return
    const patch = entry.layer.querySelector(`.znam-patch[data-region-id="${regionId}"]`) as HTMLElement | null
    if (!patch) return

    patch.classList.remove('znam-pending')
    this.applyPatchColor(patch)
    patch.textContent = ''
    const wrap = document.createElement('span')
    wrap.className = 'znam-patch-text'
    wrap.appendChild(splitIntoWordSpans(translatedText))
    patch.appendChild(wrap)
    this.fitText(patch)
    this.onWords?.(Array.from(patch.querySelectorAll<HTMLElement>('.ci-word')))
  }

  private fitText(patch: HTMLElement): void {
    const overflows = () =>
      patch.scrollHeight > patch.clientHeight + 2 || patch.scrollWidth > patch.clientWidth + 2
    const max = Math.max(12, Math.min(34, Math.floor(patch.clientHeight / 2)))
    let size = 12
    patch.style.fontSize = `${size}px`
    while (size < max && !overflows()) { size += 2; patch.style.fontSize = `${size}px` }
    while (size > 7 && overflows()) { size--; patch.style.fontSize = `${size}px` }
  }

  removeLayer(imageId: string): void {
    const entry = this.layers.get(imageId)
    if (!entry) return
    entry.resizeObserver.disconnect()
    entry.layer.remove()
    this.layers.delete(imageId)
  }

  removeAll(): void {
    for (const id of Array.from(this.layers.keys())) this.removeLayer(id)
  }
}
