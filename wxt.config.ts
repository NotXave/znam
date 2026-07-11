import { defineConfig } from 'wxt'

export default defineConfig({
  suppressWarnings: { firefoxDataCollection: true },
  manifest: ({ browser }) => ({
    name: 'znam',
    version: '0.2.2',
    description:
      'Comprehensible-input reader — tracks the words you know and scores any page by how much of it you understand',
    permissions: ['storage', 'downloads', 'tabs'],
    host_permissions: [
      // The reader must work on any page; translation/dictionary endpoints
      // and data downloads (raw.githubusercontent.com) are covered too.
      '*://*/*',
    ],
    action: {
      default_title: 'znam',
    },
    web_accessible_resources: [
      // pcm-worklet.js: loaded via audioWorklet.addModule() from the Netflix
      // page context. transformers.web.min.js: dynamically imported by the
      // background page (kept out of the bundled background.js — see
      // utils/asr/whisper-local.ts for why).
      { resources: ['asr/pcm-worklet.js'], matches: ['*://www.netflix.com/*'] },
      { resources: ['asr/transformers.web.min.js'], matches: ['*://*/*'] },
    ],
    ...(browser === 'chrome' && {
      // Tesseract's WASM (manga OCR) needs this under MV3
      content_security_policy: {
        extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
      },
    }),
    commands: {
      'toggle-reader': {
        suggested_key: { default: 'Alt+R' },
        description: 'Toggle the reader on the current page',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'znam@notxave.github.io',
          strict_min_version: '121.0',
        },
      },
    }),
  }),
})
