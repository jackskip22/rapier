# rapier-jxl in Android

Pick a photo or share one into the app. Encode at quality 80, effort 3, save a `.jxl` with the system picker, and share it.
The second action recompresses a JPEG, restores it, and compares the original and restored SHA-256 in Kotlin.
The third turns videos into animated JPEG XL: every frame the WebView plays, each with its own time.

One short Kotlin file. A hidden WebView runs the encoder in a worker and loads each module only when that action is used.
No NDK, no native `.so` libraries, no 16 KB page-size rebuilds, no analytics, and no Internet permission.

## Run

Use Android Studio with SDK 37, JDK 17, and Node 22.3 or later. Gradle downloads build dependencies once. The app runs offline.
From this folder:

```sh
npm install --no-save jpegxl
./gradlew assembleRelease
```

Open this folder in Android Studio and run on a phone, or build a debug APK with `./gradlew assembleDebug`.
For a local package build, set `JXL_PACKAGE` to its directory containing `package.json` and `dist/` before Gradle runs.

Android 8.0 (API 26) or newer. Binary messages need [WebView 116 or newer](https://developer.android.com/jetpack/androidx/releases/webkit#1.8.0-alpha01)
and `WEB_MESSAGE_ARRAY_BUFFER`. The app checks the feature and shows `JXL_WEBVIEW_BINARY_UNAVAILABLE` when absent.
The WebView version, not the Android version alone, determines support. No base64 crosses this bridge.

## Files

- `app/src/main/java/app/rapier/jxlexample/MainActivity.kt`: pickers, binary message port, framing protocol, SHA-256 check, save, and Share.
- `app/src/main/assets/encoder.html`: connects Kotlin's port to the worker and reads a video with `jpegxl/animation`.
- `app/src/main/assets/encoder.mjs`: lazy-imports `jpegxl/animation` for photos and `jpegxl/jpeg` for JPEG recompression and restoration.

`prepare-assets.mjs` copies only the built animation and JPEG modules unchanged. `jpegxl/animation` already carries the full still encoder, so this example does not ship `jpegxl/upload` beside it. `jpegxl/upload` alone cannot cover this app because it refuses animated video input and does not export `restore`. `WebViewAssetLoader` serves the files from `https://appassets.androidplatform.net/assets/`, with JavaScript MIME types and a policy allowing local scripts and WebAssembly.

## Compressed assets

Android packages `.mjs`, `.html`, and `.json` assets ZIP-compressed inside the APK, and the release build shrinks Kotlin and `androidx.webkit` with R8 (`isMinifyEnabled = true`, `isShrinkResources = true`). Measured from the built package assets (raw bytes, ZIP Deflate-9 compressed assets, and Brotli-11 for compressed store delivery):

| Asset | Uncompressed bytes | Compressed (Deflate-9) | Brotli-11 |
| --- | ---: | ---: | ---: |
| `animation.mjs` (photos and video worker) | 1,832,720 | 701,389 | 571,980 |
| `animation.browser.mjs` (reads video frames) | 74,910 | 26,912 | 24,035 |
| `jpeg.mjs` (recompress and restore) | 576,109 | 240,869 | 185,617 |
| Page, worker, headers, and license | 10,765 | 4,480 | 3,615 |
| Total encoder assets (all CPU architectures) | 2,494,504 | 973,650 | 785,247 |

If your app needs fewer actions, copy fewer modules: photos only with `jpegxl/upload` adds 427 KB of compressed assets, photos plus exact JPEG restore adds 668 KB, and photos plus video without JPEG restore adds 728 KB. Run `node prepare-assets.mjs` to measure your package. `build/encoder-assets.json` records every hash and compressed byte count.

### Compared with `awxkee/jxl-coder`

These encoder assets come to **0.97 MB** compressed (0.79 MB Brotli) once across every CPU architecture (`arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`), excluding the tiny Kotlin activity and `androidx.webkit` classes.

By comparison, [`awxkee/jxl-coder`](https://github.com/awxkee/jxl-coder) bundles native `.so` binaries per ABI inside its published Maven Central release AARs:

- **`jxl-coder` 2.6.0 (stable C++ `libjxl`)**: **2.36 MB** compressed for `arm64-v8a` alone (5.09 MB uncompressed), **2.10 MB** for `armeabi-v7a`, **2.48 MB** for `x86`, and **2.54 MB** for `x86_64`. All four ABIs together come to **9.53 MB** compressed.
- **`jxl-coder` 3.0.0-alpha11 (Rust `librjxlcoder.so`)**: **3.44 MB** compressed for `arm64-v8a` alone (6.62 MB uncompressed), **2.07 MB** for `armeabi-v7a`, **1.26 MB** for `x86`, and **1.20 MB** for `x86_64`. All four ABIs together come to **8.01 MB** compressed.

Rapier-jxl adds less than half the download size of a single `arm64-v8a` native ABI, needs no ABI splits or NDK maintenance, and keeps exact JPEG restoration.

## Check

`./gradlew testDebugUnitTest` checks Kotlin message handling and JPEG hash matching. Without an Android SDK,
`KOTLINC=/path/to/kotlinc bash test-jvm.sh` typechecks `MainActivity.kt` and runs the same checks on a JVM.

The package release check runs this page and its worker in Chromium against the built modules. That checks lazy loading (zero codec modules loaded at startup), binary messages, encoded output, restored JPEG hashes, a video read back frame by frame, refusals, and local-only requests. A phone checks the real WebView, pickers, incoming shares, saved-file sharing, rotation, and backgrounding.
