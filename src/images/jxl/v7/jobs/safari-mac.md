# Safari on a Mac

Why it helps: Safari's own JPEG XL decoder and WebAssembly on macOS.

**Need:** a Mac with Safari 26 or later, normal settings.

**Package:** `rapier-jxl@8.4.1` and the fixed [pictures](pictures/README.md), loaded from jsDelivr with checked hashes. **Time:** about a minute.

1. [Open an issue](https://github.com/jackskip22/rapier-jxl/issues/new?template=job-result.yml&title=Safari%20on%20a%20Mac) titled **Safari on a Mac**, so others know it is taken.
2. [Open the test page](https://rapier.website/docs/jxl-job.html?job=selftest) in that browser. Enter the browser, OS and device, and press **Run**. Keep the page in front.
3. Press **Download results** and attach the file to your issue, including failures.

The page encodes and decodes the screenshot and photo at efforts 1, 3, and 7. It recompresses and restores the camera JPEG at those efforts, verifies every result, and checks each SHA-256 against this release. Where native decoding is available, it checks the exact PNG outputs. It reads no local files and sends no results.
