const c1 = [
    8364, 0, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 0,
    381, 0, 0, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250,
    339, 0, 382, 376,
];
function isInvalidCodePoint(codePoint) {
    return (codePoint === 0 ||
        (codePoint >= 0xd8_00 && codePoint <= 0xdf_ff) ||
        codePoint > 0x10_ff_ff);
}
export function replaceCodePoint(codePoint) {
    if (isInvalidCodePoint(codePoint)) {
        return 0xff_fd;
    }
    if (codePoint >= 128 && codePoint <= 159) {
        return c1[codePoint - 128] || codePoint;
    }
    return codePoint;
}
export function replaceCodePointXML(codePoint) {
    return isInvalidCodePoint(codePoint) ? 0xff_fd : codePoint;
}
export function codePointToString(codePoint) {
    return (codePoint - 1) >>> 0 < 0x7f || (codePoint - 0xa0) >>> 0 < 0xd7_60
        ? String.fromCharCode(codePoint)
        : String.fromCodePoint(replaceCodePoint(codePoint));
}
