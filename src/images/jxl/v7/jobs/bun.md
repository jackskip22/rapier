# Bun

Why it helps: Bun on your OS and CPU.

**Need:** Bun 1.2 or later on any OS.

**Package:** `rapier-jxl@8.4.1`. The fixed [pictures](pictures/README.md) download from jsDelivr with checked hashes. **Time:** under a minute on a desktop.

1. [Open an issue](https://github.com/jackskip22/rapier-jxl/issues/new?template=job-result.yml&title=Bun) titled **Bun**, so others know it is taken.
2. In an empty folder, run:

   ```sh
   bunx rapier-jxl@8.4.1 selftest
   ```

3. Attach the file it writes, `rapier-jxl-selftest-bun.json`, to your issue, including failures.

The command encodes and decodes the screenshot and photo at efforts 1, 3, and 7. It recompresses and restores the camera JPEG at those efforts, verifies every result, and checks each SHA-256 against this release. The file records the OS, CPU, cores, memory, runtime version, the WebGPU adapter where present, the times and every pass or failure. It writes one file and sends nothing.
