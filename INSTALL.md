# Installing znam permanently in Firefox

Loading via `about:debugging` is temporary — it's gone after every restart.
For a permanent install, Firefox requires the extension to be **signed by
Mozilla**. Signing an *unlisted* (self-distributed) add-on is automatic and
free: no human review, done in a minute. You do it once; re-sign only when you
change the code.

## One-time: get your Mozilla signing keys

1. Sign in at <https://addons.mozilla.org/> (any Firefox account).
2. Open <https://addons.mozilla.org/developers/addon/api/key/>.
3. Click **Generate new credentials**. You get a **JWT issuer** (looks like
   `user:1234567:890`) and a **JWT secret** (a long hex string).
4. Keep them private — treat the secret like a password.

## Method A — sign locally, then install (recommended)

From the project folder:

```sh
npm install
WEB_EXT_API_KEY="<JWT issuer>" WEB_EXT_API_SECRET="<JWT secret>" npm run sign
```

`npm run sign` builds the extension and submits it for unlisted signing. When
it finishes, the signed add-on is in `web-ext-artifacts/znam-<version>.xpi`.

Install it permanently:

1. Open Firefox → `about:addons`.
2. Click the gear ⚙ → **Install Add-on From File…**
3. Pick `web-ext-artifacts/znam-<version>.xpi`.

(Or just drag the `.xpi` onto a Firefox window.) It now survives restarts.

> Re-signing after code changes: bump `"version"` in `package.json` /
> `wxt.config.ts` (AMO rejects a version it has already signed), then run
> `npm run sign` again and re-install the new `.xpi`.

## Method B — automatic signed releases via GitHub (no local signing)

The repo ships a workflow at `.github/workflows/release.yml`. Add your keys as
repository secrets once (**Settings → Secrets and variables → Actions**):

- `AMO_JWT_ISSUER` = your JWT issuer
- `AMO_JWT_SECRET` = your JWT secret

Then push a version tag:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

The workflow builds, signs, and attaches the installable `.xpi` to a GitHub
Release. Download it from the Releases page and install it via `about:addons`
→ **Install Add-on From File…** as above.

## Method C — no signing (Developer Edition / ESR / Nightly only)

Regular Firefox refuses unsigned add-ons. On **Firefox Developer Edition**,
**ESR**, or **Nightly** you can allow them:

1. Open `about:config`, set `xpinstall.signatures.required` to `false`.
2. Install `.output/znam-<version>-firefox.zip` via `about:addons` →
   **Install Add-on From File…**

This does **not** work on standard Firefox release/beta.

## After installing

Open the toolbar popup → **Open library & words** → **Languages** → **Install**
for your target language (Polish, German, English ship with the extension).
Then toggle the reader on any page with the popup button or **Alt+R**.
