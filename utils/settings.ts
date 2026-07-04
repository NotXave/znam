import type { Settings } from './types'
import { DEFAULT_SETTINGS } from './types'

export async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...((settings as Partial<Settings>) ?? {}) }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings })
}
