# Cloudflare Workers

Why it helps: Cloudflare's runtime, run locally with `wrangler dev`.

**Need:** Node 20 or later, to run `wrangler dev` (Cloudflare's local Workers runtime). No account is needed.

**Package:** `rapier-jxl@8.4.1` from npm. The fixed [pictures](pictures/README.md) are bundled into the Worker. **Time:** a few minutes, most of it the install. The test itself takes under a minute on a desktop.

1. [Open an issue](https://github.com/jackskip22/rapier-jxl/issues/new?template=job-result.yml&title=Cloudflare%20Workers) titled **Cloudflare Workers**, so others know it is taken.
2. Copy the [cloudflare-workers](cloudflare-workers/) and [pictures](pictures/) folders side by side, then in `cloudflare-workers/` run:

   ```sh
   npm install
   npx wrangler dev
   ```

3. Open http://localhost:8787. It runs the test and downloads `rapier-jxl-selftest-workerd.json`. Attach it to your issue, including failures.

The Worker encodes and decodes the screenshot and photo at efforts 1, 3, and 7. It recompresses and restores the camera JPEG at those efforts, verifies every result, and checks each SHA-256 against this release. It sends nothing.
