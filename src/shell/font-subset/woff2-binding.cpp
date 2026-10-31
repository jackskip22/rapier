// SPDX-License-Identifier: MIT
#include <woff2/decode.h>
#include <emscripten/bind.h>

emscripten::val decode(std::string input) {
  if (input.size() > woff2::kDefaultMaxSize) return emscripten::val::null();
  const auto* bytes = reinterpret_cast<const uint8_t*>(input.data());
  const auto size = woff2::ComputeWOFF2FinalSize(bytes, input.size());
  if (size < 12 || size > woff2::kDefaultMaxSize) return emscripten::val::null();
  std::string output(size, 0);
  woff2::WOFF2StringOut out(&output);
  if (!woff2::ConvertWOFF2ToTTF(bytes, input.size(), &out) || output.size() != size)
    return emscripten::val::null();
  // Copy while the C++ string still owns its memory.
  return emscripten::val::global("Uint8Array").new_(emscripten::typed_memory_view(
    output.size(), reinterpret_cast<const uint8_t*>(output.data())));
}

EMSCRIPTEN_BINDINGS(rapier_woff2) { emscripten::function("decode", &decode); }
