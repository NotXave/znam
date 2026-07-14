import type {
  LanguageState,
  LibraryEntry,
  Message,
  SetupEvent,
  WordRecord,
  WordStatus,
} from '../../utils/types'
import { getSettings, saveSettings } from '../../utils/settings'
import { difficultyLabel, rescoreLemmaCounts } from '../../utils/scoring'
import { parseVocabFile, wordsToAnki, wordsToCsv, type ParsedVocabFile } from '../../utils/csv-import'
import type { CalibrationSample } from '../../utils/calibration'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function send(msg: Message): Promise<any> {
  return browser.runtime.sendMessage(msg)
}

let lang = 'pl'

const LANGUAGES: [string, string][] = [
  ['pl', 'Polish'], ['en', 'English'], ['de', 'German'], ['ja', 'Japanese'],
  ['es', 'Spanish'], ['fr', 'French'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['nl', 'Dutch'], ['sv', 'Swedish'], ['cs', 'Czech'], ['sk', 'Slovak'],
  ['uk', 'Ukrainian'], ['ru', 'Russian'], ['ro', 'Romanian'], ['hu', 'Hungarian'],
  ['bg', 'Bulgarian'], ['el', 'Greek'], ['tr', 'Turkish'], ['ko', 'Korean'],
]

// ── Tabs ────────────────────────────────────────────────────

const refreshers: Record<string, () => void> = {
  stats: renderStats,
  library: renderLibrary,
  words: renderWords,
  languages: renderLanguageState,
  import: () => {},
  calibrate: () => {},
}

interface Stats {
  counts: { known: number; learning: number; ignored: number }
  levels: number[]
  addedThisWeek: number
  daily: Record<string, number>
  totalWords: number
  youtube: { count: number; unlockAt: number; unlocked: boolean; estimate: number; watchedThisWeek: number }
  netflix: { count: number; unlockAt: number; unlocked: boolean; estimate: number; watchedThisWeek: number }
  library: { total: number; pages: number; videos: number; netflixVideos: number; readThisWeek: number; sweetSpot: number; avgScore: number }
}

const LEVEL_COLORS = ['#c14b4b', '#c1774b', '#b8a12e', '#8fa32e', '#5d9e4a']

function tile(num: string | number, label: string): string {
  return `<div class="stat-tile"><div class="num">${num}</div><div class="lbl">${label}</div></div>`
}

function bar(label: string, value: number, max: number, color: string): string {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return `<div class="bar-row">
    <span class="bar-label">${label}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${color}"></span></span>
    <span class="bar-num">${value.toLocaleString()}</span>
  </div>`
}

interface DeepStats {
  growth: { t: number; total: number }[]
  activity: Record<string, number>
  freqCoverage: { band: number; known: number; learning: number; total: number }[]
  hardest: { lemma: string; translation: string; lookups: number; status: string; level?: number }[]
  sources: Record<string, number>
  knownThisMonth: number
  totalLookups: number
  streak: number
  scoreHistory: { t: number; score: number; kind: 'page' | 'youtube' | 'netflix' }[]
  weeklyReading: { week: string; page: number; youtube: number; netflix: number }[]
}

async function renderStats() {
  const [s, d]: [Stats, DeepStats] = await Promise.all([
    send({ type: 'GET_STATS', payload: { lang } }),
    send({ type: 'GET_DEEP_STATS', payload: { lang } }),
  ])
  if (!s || (s as any).error) return
  if (d && !(d as any).error) renderDeepStats(d, s)

  document.getElementById('stats-tiles')!.innerHTML =
    tile(s.counts.known.toLocaleString(), 'Words known') +
    tile(s.counts.learning.toLocaleString(), 'Learning') +
    tile('+' + s.addedThisWeek.toLocaleString(), 'New this week') +
    tile(Math.round(s.library.avgScore * 100) + '%', 'Avg comprehensibility')

  const statusMax = Math.max(1, s.counts.known, s.counts.learning, s.counts.ignored)
  document.getElementById('stats-status')!.innerHTML =
    bar('Known', s.counts.known, statusMax, '#5d9e4a') +
    bar('Learning', s.counts.learning, statusMax, '#b8a12e') +
    bar('Ignored', s.counts.ignored, statusMax, '#555')

  const levelMax = Math.max(1, ...s.levels)
  document.getElementById('stats-levels')!.innerHTML =
    s.levels.map((n, i) => bar(`Stage ${i + 1}`, n, levelMax, LEVEL_COLORS[i])).join('')

  // Daily new-words chart over the last 30 days
  const days: { date: string; count: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    days.push({ date: d, count: s.daily[d] || 0 })
  }
  const dayMax = Math.max(1, ...days.map(d => d.count))
  document.getElementById('stats-daily')!.innerHTML = days
    .map(d => `<div class="day" style="height:${Math.round((d.count / dayMax) * 100)}%" title="${d.date}: ${d.count} new"></div>`)
    .join('')

  renderComprehensionCard('stats-youtube', s.youtube, 'YouTube videos you watch', 'Open videos or Shorts (with subtitles) — each one watched counts.')
  renderComprehensionCard('stats-netflix', s.netflix, 'Netflix you watch (znam-transcribed)', 'Turn on 🎙️ Transcribe on a Netflix watch page — each session watched counts.')

  const lib = s.library
  document.getElementById('stats-reading')!.innerHTML = `
    <div class="bar-row"><span class="bar-label">In library</span><span>${lib.total.toLocaleString()} items — ${lib.pages} pages, ${lib.videos} YouTube, ${lib.netflixVideos} Netflix</span></div>
    <div class="bar-row"><span class="bar-label">This week</span><span>${lib.readThisWeek} read</span></div>
    <div class="bar-row"><span class="bar-label">Sweet spot</span><span>${lib.sweetSpot} at 90–98% comprehensible</span></div>
  `
}

function renderComprehensionCard(
  elId: string,
  stat: { count: number; unlockAt: number; unlocked: boolean; estimate: number; watchedThisWeek: number },
  subject: string,
  unlockHint: string,
) {
  const el = document.getElementById(elId)
  if (!el) return
  if (stat.unlocked) {
    const pct = Math.round(stat.estimate * 100)
    const label = difficultyLabel(stat.estimate)
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px">
        <span class="score-pill score-${label.replace(' ', '-').replace('sweet-spot', 'sweet')}" style="font-size:20px;min-width:70px">${pct}%</span>
        <div>
          <div>You understand roughly <b>${pct}%</b> of the ${LANGUAGES.find(([c]) => c === lang)?.[1] ?? lang} ${subject} — <span class="ci-label">${label}</span>.</div>
          <div class="hint">Estimated live from ${stat.count.toLocaleString()} watched${stat.watchedThisWeek ? ` · ${stat.watchedThisWeek} this week` : ''}. Updates as your vocabulary grows.</div>
        </div>
      </div>`
  } else {
    const left = stat.unlockAt - stat.count
    const pctBar = Math.round((stat.count / stat.unlockAt) * 100)
    el.innerHTML = `
      <div>🔒 Watch <b>${left}</b> more to unlock your comprehension estimate.</div>
      <div class="bar-row" style="margin-top:8px">
        <span class="bar-track"><span class="bar-fill" style="width:${pctBar}%;background:#2d4a77"></span></span>
        <span class="bar-num">${stat.count}/${stat.unlockAt}</span>
      </div>
      <div class="hint">${unlockHint}</div>`
  }
}

// ── Stats deep-dive ─────────────────────────────────────────
// Vanilla inline-SVG charts on the app's dark cards (#1a1a2e). Colors:
// categorical kind trio (page/youtube/netflix) and the status pair
// (known/learning) validated against the card surface; text stays in text
// tokens, marks carry the color.

const KIND_COLORS: Record<string, string> = { page: '#3987e5', youtube: '#e66767', netflix: '#9085e9' }
const KIND_LABELS: Record<string, string> = { page: 'Pages', youtube: 'YouTube', netflix: 'Netflix' }
const KNOWN_C = '#5d9e4a'
const LEARNING_C = '#b8a12e'
const GRID_C = '#2a2a44'
const MUTED_C = '#8a8aa0'
const SURFACE_C = '#1a1a2e'
const ACCENT_C = '#3987e5'
const HEAT_RAMP = ['#23233c', '#1c5cab', '#2a78d6', '#5598e7', '#9ec5f4']

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const fmtDay = (t: number) => new Date(t).toISOString().slice(0, 10)
const fmtShort = (t: number) => {
  const d = new Date(t)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function legendRow(items: [string, string][]): string {
  return `<div class="legend-row">${items
    .map(([color, label]) => `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${esc(label)}</span>`)
    .join('')}</div>`
}

/** Cumulative vocabulary growth — single-series area chart with hover. */
function renderGrowthChart(el: HTMLElement, growth: { t: number; total: number }[]) {
  if (growth.length < 2) {
    el.innerHTML = `<p class="hint">Not enough history yet — keep reading; this fills in as you track words.</p>`
    return
  }
  const W = 640, H = 170, L = 46, R = 60, T = 14, B = 24
  const t0 = growth[0].t, t1 = growth[growth.length - 1].t
  const yMax = Math.max(10, growth[growth.length - 1].total)
  const xf = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R)
  const yf = (v: number) => T + (1 - v / yMax) * (H - T - B)
  const pts = growth.map(g => `${xf(g.t).toFixed(1)},${yf(g.total).toFixed(1)}`)
  const line = `M${pts.join(' L')}`
  const area = `${line} L${xf(t1).toFixed(1)},${yf(0)} L${xf(t0).toFixed(1)},${yf(0)} Z`
  const yTicks = [0, Math.round(yMax / 2), yMax]
  const months: { x: number; label: string }[] = []
  const span = t1 - t0
  for (let i = 0; i <= 3; i++) {
    const t = t0 + (span * i) / 3
    months.push({ x: xf(t), label: fmtShort(t) })
  }
  const last = growth[growth.length - 1]
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="viz" role="img" aria-label="Cumulative tracked words over time">
      ${yTicks.map(v => `<line x1="${L}" x2="${W - R}" y1="${yf(v)}" y2="${yf(v)}" stroke="${GRID_C}" stroke-width="1"/>
        <text x="${L - 6}" y="${yf(v) + 4}" text-anchor="end" class="viz-tick">${v.toLocaleString()}</text>`).join('')}
      ${months.map(m => `<text x="${m.x}" y="${H - 6}" text-anchor="middle" class="viz-tick">${m.label}</text>`).join('')}
      <path d="${area}" fill="${ACCENT_C}" opacity="0.1"/>
      <path d="${line}" fill="none" stroke="${ACCENT_C}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${xf(last.t)}" cy="${yf(last.total)}" r="4.5" fill="${ACCENT_C}" stroke="${SURFACE_C}" stroke-width="2"/>
      <text x="${xf(last.t) + 8}" y="${yf(last.total) + 4}" class="viz-label">${last.total.toLocaleString()}</text>
      <circle class="viz-hover-dot" r="4.5" fill="${ACCENT_C}" stroke="${SURFACE_C}" stroke-width="2" style="display:none"/>
      <rect class="viz-hover-zone" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>
    </svg>`
  const svg = el.querySelector('svg')!
  const dot = svg.querySelector('.viz-hover-dot') as SVGCircleElement
  const zone = svg.querySelector('.viz-hover-zone')!
  const tip = ensureVizTip()
  zone.addEventListener('mousemove', (e: Event) => {
    const me = e as MouseEvent
    const rect = svg.getBoundingClientRect()
    const mx = ((me.clientX - rect.left) / rect.width) * W
    let best = growth[0], bd = Infinity
    for (const g of growth) { const dd = Math.abs(xf(g.t) - mx); if (dd < bd) { bd = dd; best = g } }
    dot.style.display = ''
    dot.setAttribute('cx', String(xf(best.t)))
    dot.setAttribute('cy', String(yf(best.total)))
    tip.style.display = 'block'
    tip.style.left = `${me.clientX + 12}px`
    tip.style.top = `${me.clientY - 10}px`
    tip.textContent = `${fmtDay(best.t)} — ${best.total.toLocaleString()} words`
  })
  zone.addEventListener('mouseleave', () => { dot.style.display = 'none'; ensureVizTip().style.display = 'none' })
}

let vizTip: HTMLElement | null = null
function ensureVizTip(): HTMLElement {
  if (vizTip?.isConnected) return vizTip
  vizTip = document.createElement('div')
  vizTip.className = 'viz-tip'
  document.body.appendChild(vizTip)
  return vizTip
}

/** GitHub-style activity heatmap: weeks × weekdays, sequential blue ramp. */
function renderHeatmap(el: HTMLElement, activity: Record<string, number>) {
  const DAY = 86400000
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const weeks = 18
  // Align the grid so the last column ends on today's week (Mon-first rows).
  const dow = (today.getDay() + 6) % 7 // 0 = Monday
  const start = today.getTime() - (weeks * 7 - (6 - dow) - 1) * DAY
  const values = Object.values(activity).filter(v => v > 0).sort((a, b) => a - b)
  const q = (f: number) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * f))] : 1
  const thresholds = [1, Math.max(2, q(0.5)), Math.max(3, q(0.75)), Math.max(4, q(0.9))]
  const cellFor = (v: number) => v <= 0 ? HEAT_RAMP[0] : v < thresholds[1] ? HEAT_RAMP[1] : v < thresholds[2] ? HEAT_RAMP[2] : v < thresholds[3] ? HEAT_RAMP[3] : HEAT_RAMP[4]
  const cell = 12, gap = 3
  const W = weeks * (cell + gap) + 30, H = 7 * (cell + gap) + 18
  let cells = ''
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const t = start + (w * 7 + r) * DAY
      if (t > today.getTime()) continue
      const key = new Date(t).toISOString().slice(0, 10)
      const v = activity[key] || 0
      cells += `<rect x="${30 + w * (cell + gap)}" y="${r * (cell + gap)}" width="${cell}" height="${cell}" rx="2" fill="${cellFor(v)}"><title>${key}: ${v} word ${v === 1 ? 'event' : 'events'}</title></rect>`
    }
  }
  const dayLabels = [['Mon', 0], ['Wed', 2], ['Fri', 4]] as [string, number][]
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="viz" style="max-width:${W}px" role="img" aria-label="Daily activity heatmap">
      ${dayLabels.map(([l, r]) => `<text x="0" y="${r * (cell + gap) + 10}" class="viz-tick">${l}</text>`).join('')}
      ${cells}
    </svg>
    <div class="legend-row" style="justify-content:flex-end">less
      ${HEAT_RAMP.map(c => `<span class="legend-swatch" style="background:${c}"></span>`).join('')} more
    </div>`
}

/** Frequency-coverage stacked bars: known + learning share of each top-N band. */
function renderFreqCoverage(el: HTMLElement, cov: DeepStats['freqCoverage']) {
  if (!cov.length) {
    el.innerHTML = `<p class="hint">No frequency list for this language yet — run language setup to download one.</p>`
    return
  }
  el.innerHTML = cov.map(({ band, known, learning, total }) => {
    const kp = (known / total) * 100
    const lp = (learning / total) * 100
    return `<div class="bar-row">
      <span class="bar-label">Top ${band.toLocaleString()}</span>
      <span class="bar-track freq-track" title="Top ${band.toLocaleString()}: ${known.toLocaleString()} known, ${learning.toLocaleString()} learning, ${(total - known - learning).toLocaleString()} untracked">
        <span class="bar-fill" style="width:${kp}%;background:${KNOWN_C}"></span>
        <span class="bar-fill" style="width:${lp}%;background:${LEARNING_C};margin-left:2px"></span>
      </span>
      <span class="bar-num">${Math.round(kp)}%</span>
    </div>`
  }).join('') + legendRow([[KNOWN_C, 'Known'], [LEARNING_C, 'Learning'], [GRID_C, 'Untracked']])
}

/** Comprehension scatter: one dot per library item, colored by kind. */
function renderScoreHistory(el: HTMLElement, hist: DeepStats['scoreHistory']) {
  if (hist.length < 3) {
    el.innerHTML = `<p class="hint">Read or watch a few more things — each one becomes a dot here.</p>`
    return
  }
  const W = 640, H = 190, L = 40, R = 70, T = 12, B = 24
  const t0 = hist[0].t, t1 = Date.now()
  const xf = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R)
  const yf = (score: number) => T + (1 - score) * (H - T - B)
  const kinds = [...new Set(hist.map(h => h.kind))]
  const xt: string[] = []
  for (let i = 0; i <= 3; i++) {
    const t = t0 + ((t1 - t0) * i) / 3
    xt.push(`<text x="${xf(t)}" y="${H - 6}" text-anchor="middle" class="viz-tick">${fmtShort(t)}</text>`)
  }
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="viz" role="img" aria-label="Comprehension score of each item over time">
      <rect x="${L}" y="${yf(0.98)}" width="${W - L - R}" height="${yf(0.9) - yf(0.98)}" fill="${KNOWN_C}" opacity="0.08"/>
      <text x="${W - R + 6}" y="${yf(0.94) + 4}" class="viz-tick">sweet spot</text>
      ${[0.5, 0.75, 1].map(v => `<line x1="${L}" x2="${W - R}" y1="${yf(v)}" y2="${yf(v)}" stroke="${GRID_C}" stroke-width="1"/>
        <text x="${L - 6}" y="${yf(v) + 4}" text-anchor="end" class="viz-tick">${Math.round(v * 100)}%</text>`).join('')}
      ${xt.join('')}
      ${hist.map(h => `<circle cx="${xf(h.t).toFixed(1)}" cy="${yf(h.score).toFixed(1)}" r="4" fill="${KIND_COLORS[h.kind]}" stroke="${SURFACE_C}" stroke-width="2"><title>${fmtDay(h.t)} — ${Math.round(h.score * 100)}% (${KIND_LABELS[h.kind]})</title></circle>`).join('')}
    </svg>
    ${legendRow(kinds.map(k => [KIND_COLORS[k], KIND_LABELS[k]] as [string, string]))}`
}

/** Weekly reading/watching volume — stacked columns by kind. */
function renderVolume(el: HTMLElement, weeks: DeepStats['weeklyReading']) {
  const W = 640, H = 160, L = 34, R = 10, T = 10, B = 24
  const totals = weeks.map(w => w.page + w.youtube + w.netflix)
  const max = Math.max(1, ...totals)
  const slot = (W - L - R) / weeks.length
  const bw = Math.min(24, slot - 8)
  const yf = (v: number) => T + (1 - v / max) * (H - T - B)
  let bars = ''
  weeks.forEach((w, i) => {
    const x = L + i * slot + (slot - bw) / 2
    let acc = 0
    for (const kind of ['page', 'youtube', 'netflix'] as const) {
      const v = w[kind]
      if (!v) continue
      const y1 = yf(acc), y0 = yf(acc + v)
      const isTop = acc + v === totals[i]
      bars += `<rect x="${x.toFixed(1)}" y="${(y0 + (isTop ? 0 : 1)).toFixed(1)}" width="${bw}" height="${Math.max(1, y1 - y0 - (isTop ? 0 : 2)).toFixed(1)}" fill="${KIND_COLORS[kind]}" ${isTop ? 'rx="3"' : ''}><title>Week of ${w.week}: ${v} ${KIND_LABELS[kind]}</title></rect>`
      acc += v
    }
    if (i % 2 === 0) bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="viz-tick">${w.week}</text>`
  })
  const yTicks = [0, Math.ceil(max / 2), max]
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="viz" role="img" aria-label="Items read or watched per week">
      ${yTicks.map(v => `<line x1="${L}" x2="${W - R}" y1="${yf(v)}" y2="${yf(v)}" stroke="${GRID_C}" stroke-width="1"/>
        <text x="${L - 6}" y="${yf(v) + 4}" text-anchor="end" class="viz-tick">${v}</text>`).join('')}
      ${bars}
    </svg>
    ${legendRow([[KIND_COLORS.page, 'Pages'], [KIND_COLORS.youtube, 'YouTube'], [KIND_COLORS.netflix, 'Netflix']])}`
}

const SOURCE_LABELS: Record<string, string> = {
  'click': 'Clicked while reading',
  'page-read': 'Auto-tracked from pages',
  'calibration': 'Calibration',
  'import': 'Imported',
  'manual': 'Manual',
}

function renderDeepStats(d: DeepStats, s: Stats) {
  document.getElementById('stats-tiles2')!.innerHTML =
    tile(d.streak ? `🔥 ${d.streak}` : '0', 'Day streak') +
    tile('+' + d.knownThisMonth.toLocaleString(), 'Marked known (30 days)') +
    tile(d.totalLookups.toLocaleString(), 'Total lookups') +
    tile(s.library.total.toLocaleString(), 'Items in library')

  renderGrowthChart(document.getElementById('stats-growth')!, d.growth)
  renderFreqCoverage(document.getElementById('stats-freq')!, d.freqCoverage)
  renderHeatmap(document.getElementById('stats-heatmap')!, d.activity)
  renderScoreHistory(document.getElementById('stats-scores')!, d.scoreHistory)
  renderVolume(document.getElementById('stats-volume')!, d.weeklyReading)

  const srcMax = Math.max(1, ...Object.values(d.sources))
  document.getElementById('stats-sources')!.innerHTML = Object.entries(d.sources)
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => bar(SOURCE_LABELS[src] || src, n, srcMax, ACCENT_C))
    .join('')

  const hardestEl = document.getElementById('stats-hardest')!
  if (d.hardest.length === 0) {
    hardestEl.innerHTML = `<p class="hint">Nothing yet — words you look up repeatedly will surface here.</p>`
  } else {
    hardestEl.innerHTML = `<table class="hardest-table">
      ${d.hardest.map(h => {
        const chip = h.status === 'known'
          ? `<span class="hw-chip" style="background:${KNOWN_C}">known</span>`
          : `<span class="hw-chip" style="background:${LEVEL_COLORS[(h.level ?? 1) - 1]}">stage ${h.level ?? 1}</span>`
        return `<tr><td class="hw-lemma">${esc(h.lemma)}</td><td class="hw-tr">${esc(h.translation)}</td><td>${chip}</td><td class="hw-n">${h.lookups}×</td></tr>`
      }).join('')}
    </table>`
  }
}

function switchTab(name: string) {
  document.querySelectorAll('nav button').forEach(b =>
    b.classList.toggle('active', (b as HTMLElement).dataset.tab === name),
  )
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.id === `tab-${name}`),
  )
  refreshers[name]?.()
}

// ── Library ─────────────────────────────────────────────────

async function renderLibrary() {
  const list = $('library-list')
  const [entries, words] = await Promise.all([
    send({ type: 'GET_LIBRARY', payload: { lang } }) as Promise<LibraryEntry[]>,
    send({ type: 'GET_WORDS', payload: { lang } }) as Promise<WordRecord[]>,
  ])
  if (!Array.isArray(entries)) return

  // Live rescoring against current knowledge — no refetching pages
  const statusMap = new Map<string, { status: WordStatus; level?: typeof words[number]['level'] }>()
  for (const w of words ?? []) statusMap.set(w.lemma, { status: w.status, level: w.level })
  const scored = entries.map(e => {
    const r = rescoreLemmaCounts(e.lemmaCounts || {}, l => statusMap.get(l))
    return { ...e, score: r.countableTokens > 0 ? r.score : e.score, unknownLemmas: r.unknownLemmas }
  })

  const pinnedOnly = $<HTMLInputElement>('lib-pinned-only').checked
  const sort = $<HTMLSelectElement>('lib-sort').value
  let items = pinnedOnly ? scored.filter(e => e.pinned) : scored
  if (sort === 'score-desc') items.sort((a, b) => b.score - a.score)
  else if (sort === 'score-asc') items.sort((a, b) => a.score - b.score)
  else if (sort === 'date') items.sort((a, b) => b.updatedAt - a.updatedAt)
  else if (sort === 'channel') {
    // Group by channel (A–Z); items without one (web pages) go last, most
    // comprehensible first within each channel.
    items.sort((a, b) => {
      const ca = a.channel || '￿'
      const cb = b.channel || '￿'
      return ca.localeCompare(cb) || b.score - a.score
    })
  }
  else if (sort === 'sweet') {
    const key = (e: LibraryEntry) => {
      if (e.score >= 0.9 && e.score <= 0.98) return 2 + e.score
      return e.score > 0.98 ? 1 : e.score
    }
    items.sort((a, b) => key(b) - key(a))
  }

  list.innerHTML = ''
  if (items.length === 0) {
    list.innerHTML = '<div class="hint">Nothing here yet — activate the reader on a page and it will show up.</div>'
    return
  }
  for (const e of items) {
    const pct = Math.round(e.score * 100)
    const label = difficultyLabel(e.score)
    const item = document.createElement('div')
    item.className = 'item'
    item.innerHTML = `
      <span class="score-pill score-${label.replace(' ', '-').replace('sweet-spot', 'sweet')}" title="${label}">${pct}%</span>
      <div class="grow">
        <a href="${e.url}" target="_blank" rel="noopener"></a>
        <div class="meta"><span class="ci-channel"></span>${e.unknownLemmas} unknown words · ${e.countableTokens.toLocaleString()} tokens · ${new Date(e.updatedAt).toLocaleDateString()}</div>
      </div>
      <button class="pin" title="Pin to reading list">${e.pinned ? '★' : '☆'}</button>
      <button class="del" title="Remove">✕</button>
    `
    ;(item.querySelector('a') as HTMLElement).textContent = e.title
    ;(item.querySelector('.ci-channel') as HTMLElement).textContent =
      e.kind === 'youtube' ? `▶ ${e.channel ? e.channel + ' · ' : ''}` : ''
    item.querySelector('.pin')!.addEventListener('click', async () => {
      await send({ type: 'SET_LIBRARY_PINNED', payload: { id: e.id, pinned: !e.pinned } })
      renderLibrary()
    })
    item.querySelector('.del')!.addEventListener('click', async () => {
      await send({ type: 'DELETE_LIBRARY_ENTRY', payload: { id: e.id } })
      renderLibrary()
    })
    list.appendChild(item)
  }
}

// ── Words ───────────────────────────────────────────────────

async function renderWords() {
  const list = $('word-list')
  const search = $<HTMLInputElement>('word-search').value.trim().toLowerCase()
  const filter = $<HTMLSelectElement>('word-filter').value as WordStatus | ''
  const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang } })
  if (!Array.isArray(words)) return

  const sort = $<HTMLSelectElement>('word-sort').value
  let items = words
  if (filter) items = items.filter(w => w.status === filter)
  if (search) items = items.filter(w => w.lemma.includes(search) || (w.translation || '').toLowerCase().includes(search))
  if (sort === 'lookups') items.sort((a, b) => (b.lookups ?? 0) - (a.lookups ?? 0) || b.updatedAt - a.updatedAt)
  else if (sort === 'alpha') items.sort((a, b) => a.lemma.localeCompare(b.lemma))
  else items.sort((a, b) => b.updatedAt - a.updatedAt)

  const min = Math.max(1, Number($<HTMLInputElement>('freq-threshold').value) || 1)
  const freqN = words.filter(w => (w.lookups ?? 0) >= min).length
  $('freq-count').textContent = freqN ? `${freqN} words` : 'no words yet'

  $('word-count').textContent =
    `${words.filter(w => w.status === 'known').length.toLocaleString()} known · ` +
    `${words.filter(w => w.status === 'learning').length.toLocaleString()} learning · ` +
    `${words.filter(w => w.status === 'ignored').length.toLocaleString()} ignored` +
    (items.length !== words.length ? ` — showing ${items.length.toLocaleString()}` : '')

  list.innerHTML = ''
  const frag = document.createDocumentFragment()
  for (const w of items.slice(0, 500)) {
    const level = w.level ?? 1
    const statusLabel = w.status === 'learning' ? `learning ${level}` : w.status
    const levelButtons = [1, 2, 3, 4, 5]
      .map(l =>
        `<button data-s="learning" data-l="${l}" class="lvl-${l}${w.status === 'learning' && level === l ? ' active' : ''}" title="Learning stage ${l}">${l}</button>`,
      )
      .join('')
    const lookups = w.lookups ?? 0
    const lookupBadge = lookups > 0 ? ` <span class="hint" title="times you looked it up">· ${lookups}× looked up</span>` : ''
    const item = document.createElement('div')
    item.className = 'item'
    item.innerHTML = `
      <div class="grow">
        <b></b> <span class="status-${w.status}">${statusLabel}</span>${lookupBadge}
        <div class="meta"></div>
      </div>
      <div class="word-status">
        ${levelButtons}
        <button data-s="known" ${w.status === 'known' ? 'class="active"' : ''}>Known</button>
        <button data-s="ignored" ${w.status === 'ignored' ? 'class="active"' : ''}>Ignore</button>
        <button data-s="unknown" title="Forget">✕</button>
      </div>
    `
    ;(item.querySelector('b') as HTMLElement).textContent = w.lemma
    ;(item.querySelector('.meta') as HTMLElement).textContent =
      [w.translation, w.context].filter(Boolean).join(' — ').slice(0, 120)
    item.querySelector('.word-status')!.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest('button')
      if (!btn) return
      await send({
        type: 'SET_WORD_STATUS',
        payload: {
          lang,
          lemma: w.lemma,
          status: btn.dataset.s as any,
          level: btn.dataset.l ? (Number(btn.dataset.l) as any) : undefined,
          source: 'manual',
        },
      })
      renderWords()
    })
    frag.appendChild(item)
  }
  list.appendChild(frag)
  if (items.length > 500) {
    const more = document.createElement('div')
    more.className = 'hint'
    more.textContent = `…and ${items.length - 500} more (narrow with search)`
    list.appendChild(more)
  }
}

function download(filename: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Languages ───────────────────────────────────────────────

async function renderLanguageState() {
  const state: LanguageState = await send({ type: 'GET_LANGUAGE_STATE', payload: { lang } })
  if (!state || (state as any).error) return
  $('lang-state').innerHTML = `
    <h2>${LANGUAGES.find(([c]) => c === lang)?.[1] ?? lang}</h2>
    <div>Lemma dictionary: <b>${state.dictReady ? `${state.dictForms.toLocaleString()} forms` : 'not installed'}</b></div>
    <div>Frequency list: <b>${state.freqReady ? `${state.freqLemmas.toLocaleString()} lemmas` : 'not installed'}</b></div>
    <div>Words: <b class="status-known">${state.counts.known.toLocaleString()} known</b> ·
      <b class="status-learning">${state.counts.learning.toLocaleString()} learning</b> ·
      ${state.counts.ignored.toLocaleString()} ignored</div>
    ${state.calibratedAt ? `<div class="hint">Calibrated ${new Date(state.calibratedAt).toLocaleDateString()}</div>` : ''}
  `
}

function runSetup(request: any) {
  const progress = $('setup-progress')
  const bar = $('setup-bar')
  const detail = $('setup-detail')
  progress.hidden = false
  $<HTMLButtonElement>('setup-download').disabled = true
  $<HTMLButtonElement>('setup-local').disabled = true

  const port = browser.runtime.connect({ name: 'language-setup' })
  port.onMessage.addListener((event: SetupEvent) => {
    if (event.type === 'PROGRESS') {
      bar.style.width = `${event.pct}%`
      detail.textContent = `${event.step}: ${event.detail}`
    } else if (event.type === 'DONE') {
      bar.style.width = '100%'
      detail.textContent = `Done — ${event.state.dictForms.toLocaleString()} forms installed`
      finish()
    } else if (event.type === 'ERROR') {
      detail.textContent = `Error: ${event.error}`
      finish()
    }
  })
  port.onDisconnect.addListener(finish)
  port.postMessage(request)

  function finish() {
    $<HTMLButtonElement>('setup-download').disabled = false
    $<HTMLButtonElement>('setup-local').disabled = false
    renderLanguageState()
  }
}

// ── Calibration ─────────────────────────────────────────────

let calSamples: CalibrationSample[] = []
let calAnswers: { rank: number; known: boolean }[] = []

async function calStart() {
  calSamples = await send({ type: 'CALIBRATION_SAMPLE', payload: { lang } })
  if (!Array.isArray(calSamples) || calSamples.length < 10) {
    $('cal-intro').querySelector('.hint')!.textContent =
      'No frequency data for this language — install language data first (Languages tab).'
    return
  }
  calAnswers = []
  $('cal-intro').hidden = true
  $('cal-quiz').hidden = false
  $('cal-result').hidden = true
  calShowWord()
}

function calShowWord() {
  const i = calAnswers.length
  if (i >= calSamples.length) {
    calFinish()
    return
  }
  $('cal-word').textContent = calSamples[i].lemma
  $('cal-progress').textContent = `${i + 1} / ${calSamples.length}`
}

async function calAnswer(known: boolean) {
  calAnswers.push({ rank: calSamples[calAnswers.length].rank, known })
  if (calAnswers.length >= calSamples.length) await calFinish()
  else calShowWord()
}

async function calFinish() {
  const { topN } = await send({ type: 'CALIBRATION_ESTIMATE', payload: { answers: calAnswers } })
  $('cal-quiz').hidden = true
  $('cal-result').hidden = false
  const slider = $<HTMLInputElement>('cal-slider')
  slider.value = String(Math.max(100, Math.min(50000, topN)))
  calSyncSlider()
}

function calSyncSlider() {
  const n = Number($<HTMLInputElement>('cal-slider').value)
  $('cal-topn').textContent = n.toLocaleString()
  $('cal-topn2').textContent = n.toLocaleString()
}

// ── Wire-up ─────────────────────────────────────────────────

async function init() {
  const langSel = $<HTMLSelectElement>('lang-select')
  for (const [code, name] of LANGUAGES) {
    const opt = document.createElement('option')
    opt.value = code
    opt.textContent = name
    langSel.appendChild(opt)
  }
  const settings = await getSettings()
  lang = settings.targetLanguage
  if (!LANGUAGES.some(([c]) => c === lang)) {
    const opt = document.createElement('option')
    opt.value = lang
    opt.textContent = lang
    langSel.appendChild(opt)
  }
  langSel.value = lang
  langSel.addEventListener('change', async () => {
    lang = langSel.value
    await saveSettings({ ...(await getSettings()), targetLanguage: lang })
    const activeTab = (document.querySelector('nav button.active') as HTMLElement)?.dataset.tab
    if (activeTab) refreshers[activeTab]?.()
  })

  document.querySelectorAll('nav button').forEach(b =>
    b.addEventListener('click', () => switchTab((b as HTMLElement).dataset.tab!)),
  )

  // Refresh the current tab when you come back to this page (e.g. after
  // watching a video in another tab) so scores reflect the words you learned.
  const refreshActiveTab = () => {
    const t = (document.querySelector('nav button.active') as HTMLElement | null)?.dataset.tab
    if (t) refreshers[t]?.()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshActiveTab()
  })
  window.addEventListener('focus', refreshActiveTab)

  $('lib-pinned-only').addEventListener('change', renderLibrary)
  $('lib-sort').addEventListener('change', renderLibrary)

  $('word-search').addEventListener('input', renderWords)
  $('word-filter').addEventListener('change', renderWords)
  $('word-sort').addEventListener('change', renderWords)
  $('export-csv').addEventListener('click', async () => {
    const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang } })
    download(`znam-${lang}-words.csv`, wordsToCsv(words))
  })
  $('export-anki').addEventListener('click', async () => {
    const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang, status: 'learning' } })
    download(`znam-${lang}-anki.txt`, wordsToAnki(words))
  })

  // Export the most-looked-up words (≥ threshold), hardest first
  async function frequentWords(): Promise<WordRecord[]> {
    const min = Math.max(1, Number($<HTMLInputElement>('freq-threshold').value) || 1)
    const words: WordRecord[] = await send({ type: 'GET_WORDS', payload: { lang } })
    return words
      .filter(w => (w.lookups ?? 0) >= min)
      .sort((a, b) => (b.lookups ?? 0) - (a.lookups ?? 0))
  }
  async function updateFreqCount() {
    const words = await frequentWords()
    $('freq-count').textContent = words.length ? `${words.length} words` : 'no words yet'
  }
  $('freq-threshold').addEventListener('input', updateFreqCount)
  $('export-freq-csv').addEventListener('click', async () => {
    const words = await frequentWords()
    if (words.length) download(`znam-${lang}-frequent.csv`, wordsToCsv(words))
  })
  $('export-freq-anki').addEventListener('click', async () => {
    const words = await frequentWords()
    if (words.length) download(`znam-${lang}-frequent-anki.txt`, wordsToAnki(words))
  })

  $('setup-download').addEventListener('click', () =>
    runSetup({ type: 'SETUP_LANGUAGE', lang }),
  )
  $('setup-local').addEventListener('click', async () => {
    const lemmasFile = $<HTMLInputElement>('local-lemmas').files?.[0]
    const freqFile = $<HTMLInputElement>('local-freq').files?.[0]
    if (!lemmasFile || !freqFile) return
    runSetup({
      type: 'SETUP_LANGUAGE_LOCAL',
      lang,
      lemmasTsv: await lemmasFile.text(),
      freqTsv: await freqFile.text(),
    })
  })

  let parsedImport: ParsedVocabFile | null = null

  function importEntries() {
    if (!parsedImport) return []
    const swap = $<HTMLInputElement>('import-swap').checked
    return swap
      ? parsedImport.entries
          .filter(e => e.translation)
          .map(e => ({ ...e, lemmaOrForm: e.translation!, translation: e.lemmaOrForm }))
      : parsedImport.entries
  }

  function renderImportPreview() {
    const preview = $('import-preview')
    if (!parsedImport) {
      preview.hidden = true
      return
    }
    const { skippedPhrases } = parsedImport
    const format = parsedImport.format === 'lute-db' ? 'Lute database' : parsedImport.format
    const entries = importEntries()
    const sample = entries
      .slice(0, 8)
      .map(e => {
        const status = e.status === 'learning' && e.level ? `learning ${e.level}` : e.status
        return `${e.lemmaOrForm} → ${e.translation || '—'}${status ? ` (${status})` : ''}`
      })
      .join('<br/>')
    preview.hidden = false
    preview.innerHTML =
      `Detected <b>${format}</b> format, ${entries.length} single words` +
      (skippedPhrases ? `, ${skippedPhrases} multi-word terms will be skipped` : '') +
      `.<br/><br/>${sample || '(nothing parseable)'}${entries.length > 8 ? '<br/>…' : ''}`
    $('import-swap-row').hidden = false
  }

  $('import-file').addEventListener('change', async () => {
    const file = $<HTMLInputElement>('import-file').files?.[0]
    $('import-result').textContent = ''
    if (!file) {
      parsedImport = null
      renderImportPreview()
      return
    }
    // Lute SQLite database → read via sql.js; everything else → text parse
    if (/\.(db|sqlite\d?)$/i.test(file.name)) {
      $('import-result').textContent = 'Reading Lute database…'
      try {
        const { parseLuteDb } = await import('../../utils/lute-db')
        const lute = await parseLuteDb(await file.arrayBuffer())
        parsedImport = { format: 'lute-db', entries: lute.entries, skippedPhrases: lute.skippedPhrases }
        $('import-result').textContent = lute.languages.length
          ? `Languages in this database: ${lute.languages.join(', ')}.`
          : ''
      } catch (err: any) {
        parsedImport = null
        $('import-result').textContent = `Could not read database: ${err?.message || err}`
      }
    } else {
      parsedImport = parseVocabFile(await file.text())
    }
    renderImportPreview()
  })
  $('import-swap').addEventListener('change', renderImportPreview)

  $('import-run').addEventListener('click', async () => {
    const result = $('import-result')
    if (!parsedImport) {
      result.textContent = 'Pick a file first.'
      return
    }
    const { skippedPhrases } = parsedImport
    const format = parsedImport.format === 'lute-db' ? 'Lute database' : parsedImport.format
    const entries = importEntries()
    // Rows may carry a language as a code ("pl") or a full name ("Polish",
    // Lute does this); import matching rows or rows without a language.
    const langName = (LANGUAGES.find(([c]) => c === lang)?.[1] || '').toLowerCase()
    const matchesLang = (l: string) => {
      const v = l.trim().toLowerCase()
      return v === lang.toLowerCase() || v === langName
    }
    const anyLang = $<HTMLInputElement>('import-any-lang').checked
    const relevant = anyLang ? entries : entries.filter(e => !e.language || matchesLang(e.language))
    if (relevant.length === 0) {
      const seen = [...new Set(entries.map(e => e.language).filter(Boolean))].join(', ')
      result.textContent = `Detected ${format} format, but no rows for "${lang}"` +
        (seen ? ` — the file contains: ${seen}.` : ` (${entries.length} rows, none matched).`)
      return
    }
    const status = $<HTMLSelectElement>('import-status').value as WordStatus
    const resp = await send({ type: 'IMPORT_WORDS', payload: { lang, entries: relevant, status } })
    const parts = [
      `Detected ${format} format.`,
      `Imported ${resp.imported}, skipped ${resp.skipped} already-tracked words.`,
    ]
    if (skippedPhrases > 0) parts.push(`${skippedPhrases} multi-word terms skipped.`)
    if (relevant.length < entries.length) parts.push(`${entries.length - relevant.length} rows in other languages skipped.`)
    result.textContent = parts.join(' ')
  })

  $('cal-start').addEventListener('click', calStart)
  $('cal-know').addEventListener('click', () => calAnswer(true))
  $('cal-dont').addEventListener('click', () => calAnswer(false))
  $('cal-slider').addEventListener('input', calSyncSlider)
  $('cal-apply').addEventListener('click', async () => {
    const topN = Number($<HTMLInputElement>('cal-slider').value)
    const resp = await send({ type: 'CALIBRATION_APPLY', payload: { lang, topN } })
    $('cal-applied').textContent = `Marked ${resp.added.toLocaleString()} new words as known.`
    renderLanguageState()
  })

  renderStats()
}

init()
