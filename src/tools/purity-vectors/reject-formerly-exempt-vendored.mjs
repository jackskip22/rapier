// Stands in for what agent/diff.mjs was before the kernel/worker split: a "vendored" file that
// used to sit behind a blanket per-file exemption (PURITY_VENDORED_EXCEPTIONS) in the purity
// gate. There is no such list left -- every module in the import graph is checked the same way.
export function vendoredOperation() {
  return Date.now();
}
