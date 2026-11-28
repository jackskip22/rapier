# rapier-jxl in iOS

A Swift wrapper around the browser encoder in a `WKWebView`: no native JPEG XL codec to build or link. It turns videos into
animated JPEG XL, encodes a photo, recompresses a JPEG and restores the exact original SHA-256, turns a GIF into an animated JPEG XL,
keeps every sample of an opaque photo in exact mode, cancels a call, and refuses bad input with the package's `JXL_` code.
On iOS 17 and later, `UIImage` decodes the result and ImageIO reads an animation's first frame.

## Use

iOS 16.4 or newer, Swift 5.9, Xcode 15, Node 22.3 or later.

```sh
npm install --no-save jpegxl
node prepare-assets.mjs          # copies the built modules into Sources/RapierJXL/Web/jpegxl
```

Add this folder to your app as a local Swift package (File, Add Package Dependencies, Add Local) and import `RapierJXL`.
For a local package build, set `JXL_PACKAGE` to its directory containing `package.json` and `dist/` first.

```swift
import RapierJXL

let codec = JXLCodec()
let jxl = try await codec.encode(photo, quality: 80, effort: 3)     // UIImage or Data in, JPEG XL Data out
let exact = try await codec.encodeExact(photo)                      // every pixel kept
let small = try await codec.recompress(jpeg: jpegData)              // a JPEG's own bytes, smaller
let same = try await codec.restore(small)                           // the original JPEG restored exactly
let clip = try await codec.animate(video: movieURL)                 // a video: every frame, each with its time
let moving = try await codec.animate(gif: gifData)                  // a GIF, with its timing and loops
let shown = UIImage(data: jxl)                                      // iOS 17 and later
```

AVFoundation reads a video's frames (every frame, each with its own time, without playback pacing), so any
video the system reads works (`animate(video: Data, type: "video/mp4")` takes bytes). The page encodes them.
`animate` reports progress from 0 to 1 through its `progress` closure. Each call runs one at a time. Cancel a call by canceling its `Task`. The next call runs normally. A refusal throws
`JXLError` with the package's own `JXL_` code. A page that stops (iOS can end its process) refuses the call with `JXL_BRIDGE`, and the next call starts a new page.

## Files

- `Sources/RapierJXL/RapierJXL.swift`: `JXLCodec` and its calls.
- `Sources/RapierJXL/Video.swift`: reads a video's frames with AVFoundation, turned as the file is shown.
- `Sources/RapierJXL/Bridge.swift`: serves the bundle and carries bytes as HTTP bodies, `/in/<id>` and `/out/<id>/result`. No base64.
- `Sources/RapierJXL/Web/`: the page relay, the single encoder worker, and (after `prepare-assets.mjs`) `animation.mjs` and `jpeg.mjs`.
- `Example/`: a SwiftUI app that picks a video, photo or GIF, writes JPEG XL, shows it, and shares it. `xcodegen` builds its project.
- `Tests/`: `xcodebuild test -scheme RapierJXL -destination 'platform=iOS Simulator,name=iPhone 16' (or id=<simulator>)`.

## Asset bytes

`node prepare-assets.mjs` records the bytes and SHA-256 of each copied asset in `build/web-assets.json`.
Measure compressed delivery and app installation separately for the intended distribution.

## Check

The WebKit proof script (`repo/tools/jxl-ios-example.mjs`) runs the same page and worker in WebKit against the built package, with a local
server in the place of Swift: lazy module loading, photo, exact JPEG restore, GIF, video, refusal, cancel, and the next call. The Swift side runs on a
macOS runner (`ci/ios.yml`). A phone checks the real picker and share sheet.

ImageIO reads one frame of an animated JPEG XL on older system builds. The package's decoder, run in Node on the bytes
the worker wrote, reads every frame and its delay.
