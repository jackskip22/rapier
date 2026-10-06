# The JPEG XL decoder lives here now, and never ships

`rapier.html` carries no JPEG XL decoder: 1.7 MB for a
compatibility measure with a known end date, when every current browser reads the format itself.
The build no longer references this directory, and `rapier.html` fell 3,005,869 -> 2,296,836 bytes.

It is kept HERE, under `tools/`, for development tooling only, never for the page.

What it is worth: a witness can now decode what Rapier WROTE and check the pixels, instead of
trusting a signature. `paint-picture-lossless` uses it to prove a painting round-trips exactly --
which is the actual content of "full quality", and the harness's own Chromium (140, and the format
landed in 145) can never show us.

Nothing under `tools/` reaches a build. If that ever stops being true, this directory is the first
thing to check.
