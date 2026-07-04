import { isWordToken, stripPunctuation } from '../utils/tokenizer'

// Elements whose text must never be wrapped: code, form fields, editors,
// vector graphics, and znam's own UI.
const SKIP_SELECTOR =
  'script,style,noscript,code,pre,textarea,input,select,button,svg,math,' +
  '[contenteditable],#ci-tooltip,.ci-badge'

function isHidden(el: Element): boolean {
  const style = getComputedStyle(el)
  return style.display === 'none' || style.visibility === 'hidden'
}

/** Collect the text nodes under root that are safe to wrap. */
export function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const text = n.textContent
      if (!text || !/\p{L}/u.test(text)) return NodeFilter.FILTER_REJECT
      const parent = (n as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('.ci-word')) return NodeFilter.FILTER_REJECT
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT
      if (isHidden(parent)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) nodes.push(n as Text)
  return nodes
}

/**
 * Wrap the word tokens of one text node in .ci-word spans.
 * Whitespace and letter-less tokens stay as plain text.
 * Returns the created spans (dataset.word = punctuation-stripped token).
 */
export function wrapTextNode(node: Text): HTMLElement[] {
  const parent = node.parentNode
  if (!parent) return []
  const spans: HTMLElement[] = []
  const frag = document.createDocumentFragment()
  for (const part of (node.textContent || '').split(/(\s+)/)) {
    if (!part) continue
    const word = stripPunctuation(part)
    if (/^\s+$/.test(part) || !word || !isWordToken(word)) {
      frag.appendChild(document.createTextNode(part))
      continue
    }
    const span = document.createElement('span')
    span.className = 'ci-word'
    span.dataset.word = word
    span.textContent = part
    frag.appendChild(span)
    spans.push(span)
  }
  parent.replaceChild(frag, node)
  return spans
}

/** Undo wrapping: replace every .ci-word span under root with its text. */
export function unwrapAll(root: ParentNode): void {
  const spans = Array.from(root.querySelectorAll('.ci-word'))
  const parents = new Set<Node>()
  for (const span of spans) {
    const parent = span.parentNode
    if (!parent) continue
    parent.replaceChild(document.createTextNode(span.textContent || ''), span)
    parents.add(parent)
  }
  // Merge the fragmented text nodes back together
  for (const parent of parents) parent.normalize()
}
