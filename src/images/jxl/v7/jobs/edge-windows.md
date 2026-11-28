# Edge on Windows

Why it helps: Windows on x64 and ARM, where the browser has no JPEG XL decoder.

**Need:** a Windows PC with a current Edge.

**Package:** `rapier-jxl@8.4.1` and the fixed [pictures](pictures/README.md), loaded from jsDelivr with checked hashes. **Time:** about a minute.

1. [Open an issue](https://github.com/jackskip22/rapier-jxl/issues/new?template=job-result.yml&title=Edge%20on%20Windows) titled **Edge on Windows**, so others know it is taken.
2. [Open the test page](https://rapier.website/docs/jxl-job.html?job=selftest) in that browser. Enter the browser, OS and device, and press **Run**. Keep the page in front.
3. Press **Download results** and attach the file to your issue, including failures.

The page encodes and decodes the screenshot and photo at efforts 1, 3, and 7. It recompresses and restores the camera JPEG at those efforts, verifies every result, and checks each SHA-256 against this release. Where native decoding is available, it checks the exact PNG outputs. It reads no local files and sends no results.
