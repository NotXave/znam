// Lets `node --test` load the extensionless relative imports that the
// extension source uses (`import … from './generator'`).
//
// WXT/Vite resolves those at build time, so the source deliberately keeps the
// repo's existing extensionless style. Node's ESM resolver is stricter, so this
// hook fills in the '.ts' for test runs only — no source changes, no bundler,
// no devDependency.
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Note we cannot test "does it already have an extension?" by regex —
    // './lessons.de' looks extensioned but isn't. Just probe the filesystem.
    if (specifier.startsWith('.')) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          const url = new URL(candidate, context.parentURL)
          if (existsSync(fileURLToPath(url))) {
            return nextResolve(candidate, context)
          }
        } catch {
          // fall through to the default resolver
        }
      }
    }
    return nextResolve(specifier, context)
  },
})
