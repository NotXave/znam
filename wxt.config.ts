import { defineConfig } from 'wxt'

export default defineConfig({
  suppressWarnings: { firefoxDataCollection: true },
  manifest: ({ browser }) => ({
    name: 'znam',
    version: '0.1.0',
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
          // znam sends no data to its own servers; word lookups go to the
          // translation/dictionary services the user chose, and stay local.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
})
