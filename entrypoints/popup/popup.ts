import type { LanguageState, Settings } from '../../utils/types'
import { getSettings, saveSettings } from '../../utils/settings'

const LANGUAGES: [string, string][] = [
  ['pl', 'Polish'], ['en', 'English'], ['de', 'German'], ['ja', 'Japanese'],
  ['es', 'Spanish'], ['fr', 'French'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['nl', 'Dutch'], ['sv', 'Swedish'], ['no', 'Norwegian'], ['da', 'Danish'],
  ['fi', 'Finnish'], ['cs', 'Czech'], ['sk', 'Slovak'], ['uk', 'Ukrainian'],
  ['ru', 'Russian'], ['ro', 'Romanian'], ['hu', 'Hungarian'], ['bg', 'Bulgarian'],
  ['el', 'Greek'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['he', 'Hebrew'],
  ['hi', 'Hindi'], ['ko', 'Korean'], ['zh-CN', 'Chinese (Simplified)'],
  ['th', 'Thai'], ['vi', 'Vietnamese'], ['id', 'Indonesian'],
]

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function fillLanguages(select: HTMLSelectElement) {
  for (const [code, name] of LANGUAGES) {
    const opt = document.createElement('option')
    opt.value = code
    opt.textContent = name
    select.appendChild(opt)
  }
}

async function activeTab(): Promise<{ id: number; hostname: string } | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (tab?.id == null || !tab.url) return null
  try {
    return { id: tab.id, hostname: new URL(tab.url).hostname }
  } catch {
    return null
  }
}

async function persistSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = { ...(await getSettings()), ...patch }
  await saveSettings(settings)
  const tab = await activeTab()
  if (tab) {
    browser.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', payload: settings }).catch(() => {})
  }
  return settings
}

async function refreshToggleState() {
  const tab = await activeTab()
  const toggle = $<HTMLButtonElement>('toggle')
  if (!tab) {
    toggle.disabled = true
    return
  }
  const state = await browser.tabs.sendMessage(tab.id, { type: 'GET_READER_STATE' }).catch(() => null)
  const active = !!(state as any)?.active
  toggle.textContent = active ? 'Deactivate reader on this page' : 'Activate reader on this page'
  toggle.classList.toggle('active', active)
}

async function refreshLanguageState(lang: string) {
  const el = $('lang-state')
  const state: LanguageState | null = await browser.runtime
    .sendMessage({ type: 'GET_LANGUAGE_STATE', payload: { lang } })
    .catch(() => null)
  if (!state || (state as any).error) {
    el.textContent = ''
    return
  }
  const dict = state.dictReady ? `${state.dictForms.toLocaleString()} forms` : 'no dictionary — open setup'
  el.innerHTML = `<b>${lang}</b>: ${state.counts.known.toLocaleString()} known · ${state.counts.learning.toLocaleString()} learning<br/>${dict}`
}

async function init() {
  const targetSel = $<HTMLSelectElement>('target-lang')
  const nativeSel = $<HTMLSelectElement>('native-lang')
  const primarySel = $<HTMLSelectElement>('primary-translation')
  const autoHost = $<HTMLInputElement>('auto-host')

  fillLanguages(targetSel)
  fillLanguages(nativeSel)

  const settings = await getSettings()
  targetSel.value = settings.targetLanguage
  nativeSel.value = settings.nativeLanguage
  primarySel.value = settings.primaryTranslation

  const tab = await activeTab()
  if (tab) {
    $('hostname').textContent = tab.hostname
    autoHost.checked = settings.autoHosts.includes(tab.hostname)
  } else {
    autoHost.disabled = true
  }

  targetSel.addEventListener('change', async () => {
    await persistSettings({ targetLanguage: targetSel.value })
    refreshLanguageState(targetSel.value)
  })
  nativeSel.addEventListener('change', () => persistSettings({ nativeLanguage: nativeSel.value }))
  primarySel.addEventListener('change', () =>
    persistSettings({ primaryTranslation: primarySel.value as Settings['primaryTranslation'] }),
  )

  const mangaSel = $<HTMLSelectElement>('manga-source')
  mangaSel.value = settings.mangaSource
  mangaSel.addEventListener('change', () => persistSettings({ mangaSource: mangaSel.value }))

  const nfTierSel = $<HTMLSelectElement>('netflix-tier')
  const nfModelSel = $<HTMLSelectElement>('netflix-model-size')
  const nfServerInput = $<HTMLInputElement>('netflix-server-url')
  const nfCloudInput = $<HTMLInputElement>('netflix-cloud-key')
  const nfModeSel = $<HTMLSelectElement>('netflix-mode')
  nfTierSel.value = settings.netflixAsrTier
  nfModelSel.value = settings.netflixModelSize
  nfServerInput.value = settings.netflixServerUrl
  nfCloudInput.value = settings.netflixCloudApiKey
  nfModeSel.value = settings.netflixSubtitleMode

  function syncNetflixTierRows() {
    $('netflix-model-row').hidden = nfTierSel.value !== 'local'
    $('netflix-server-row').hidden = nfTierSel.value !== 'server'
    $('netflix-cloud-row').hidden = nfTierSel.value !== 'cloud'
  }
  syncNetflixTierRows()

  nfTierSel.addEventListener('change', () => {
    syncNetflixTierRows()
    persistSettings({ netflixAsrTier: nfTierSel.value as Settings['netflixAsrTier'] })
  })
  nfModelSel.addEventListener('change', () =>
    persistSettings({ netflixModelSize: nfModelSel.value as Settings['netflixModelSize'] }),
  )
  nfServerInput.addEventListener('change', () => persistSettings({ netflixServerUrl: nfServerInput.value.trim() }))
  nfCloudInput.addEventListener('change', () => persistSettings({ netflixCloudApiKey: nfCloudInput.value.trim() }))
  nfModeSel.addEventListener('change', () =>
    persistSettings({ netflixSubtitleMode: nfModeSel.value as Settings['netflixSubtitleMode'] }),
  )

  autoHost.addEventListener('change', async () => {
    if (!tab) return
    const current = await getSettings()
    const hosts = new Set(current.autoHosts)
    if (autoHost.checked) hosts.add(tab.hostname)
    else hosts.delete(tab.hostname)
    await persistSettings({ autoHosts: [...hosts] })
  })

  $('toggle').addEventListener('click', async () => {
    const t = await activeTab()
    if (!t) return
    await browser.tabs.sendMessage(t.id, { type: 'TOGGLE_READER' }).catch(() => {})
    await refreshToggleState()
  })

  $('open-app').addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('/app.html') })
    window.close()
  })

  refreshToggleState()
  refreshLanguageState(settings.targetLanguage)
}

init()
