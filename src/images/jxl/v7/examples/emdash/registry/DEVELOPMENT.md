# Registry companion development

## Package

The manifest contains publisher, author and security-contact information. The version lives in `package.json`; profile text lives in `docs/`. The integration supports Cloudflare R2 and Node local storage.

The plugin CLI is pinned to `0.13.5`. Development dependencies are plugin-test `0.2.11`, EmDash `1.4.0`, TypeScript `5.9.3`, and Vitest `4.1.12`.

```sh
npm run test:unit
npm run validate
npm run typecheck
npm test
npm run bundle
```

The pure route tests run under Node's TypeScript stripping. The integration test exercises the real Worker Loader test host. The built bundle must meet the CLI limits: 128 KB per decompressed file, 256 KB total and 20 files.

## Listing images

`images/icon.svg` is the editable icon; `images/icon.png` is its 256 × 256 raster export. The screenshots show the optimizer on a real EmDash 1.4.0 Node site with rapier-jxl 8.3.2, at the default effort 7 and quality 90, on open photos.

| File | View |
| --- | --- |
| `images/optimizer-1440x1000-light.png` | 1440 × 1000, light mode |
| `images/optimizer-390x844-light.png` | 390 × 844, light mode |
| `images/recent-menu-1440x1000-light.png` | 1440 × 1000, light mode, a photo's menu open |
| `images/optimizer-1440x1000-dark.png` | 1440 × 1000, dark mode |
| `images/optimizer-390x844-dark.png` | 390 × 844, dark mode |

The release accepts at most eight screenshots in PNG, JPEG or WebP, each at most 1 MiB and 8192 pixels per side. Listing assets live under `images/` and are declared in `release.artifacts`; they are separate from the runtime bundle.

## References

- [Registry](https://docs.emdashcms.com/plugins/registry/)
- [Manifest](https://docs.emdashcms.com/plugins/creating-plugins/manifest/)
- [Bundling](https://docs.emdashcms.com/plugins/creating-plugins/publishing/)
- [Block Kit](https://docs.emdashcms.com/plugins/creating-plugins/block-kit/)
- [Sandbox testing](https://docs.emdashcms.com/plugins/creating-plugins/testing/)
