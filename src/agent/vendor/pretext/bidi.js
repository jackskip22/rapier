/*! Pretext 0.0.9 | MIT | Copyright (c) 2026 Pretext contributors */
import { latin1BidiTypes, nonLatin1BidiRanges } from './generated/bidi-data.js';
function classifyCodePoint(codePoint) {
    if (codePoint <= 0x00FF) return latin1BidiTypes[codePoint];
    let lo = 0;
    let hi = nonLatin1BidiRanges.length - 1;
    while(lo <= hi){
        const mid = lo + hi >> 1;
        const range = nonLatin1BidiRanges[mid];
        if (codePoint < range[0]) {
            hi = mid - 1;
            continue;
        }
        if (codePoint > range[1]) {
            lo = mid + 1;
            continue;
        }
        return range[2];
    }
    return 'L';
}
function computeBidiLevels(str) {
    const len = str.length;
    if (len === 0) return null;
    const types = new Array(len);
    let paragraphHasBidi = false;
    let paragraphStart = 0;
    let levels = null;
    for(let i = 0; i < len;){
        const first = str.charCodeAt(i);
        let codePoint = first;
        let codeUnitLength = 1;
        if (first >= 0xD800 && first <= 0xDBFF && i + 1 < len) {
            const second = str.charCodeAt(i + 1);
            if (second >= 0xDC00 && second <= 0xDFFF) {
                codePoint = (first - 0xD800 << 10) + (second - 0xDC00) + 0x10000;
                codeUnitLength = 2;
            }
        }
        const t = classifyCodePoint(codePoint);
        if (t === 'R' || t === 'AL' || t === 'AN') paragraphHasBidi = true;
        for(let j = 0; j < codeUnitLength; j++){
            types[i + j] = t;
        }
        if (t === 'B') {
            if (paragraphHasBidi) {
                levels ??= new Int8Array(len);
                levels[i] = resolveParagraphLevels(types, levels, paragraphStart, i);
            }
            paragraphStart = i + codeUnitLength;
            paragraphHasBidi = false;
        }
        i += codeUnitLength;
    }
    if (paragraphHasBidi) {
        levels ??= new Int8Array(len);
        resolveParagraphLevels(types, levels, paragraphStart, len);
    }
    return levels;
}
function resolveParagraphLevels(types, levels, start, end) {
    let startLevel = 0;
    for(let i = start; i < end; i++){
        const t = types[i];
        if (t === 'L') {
            startLevel = 0;
            break;
        }
        if (t === 'R' || t === 'AL') {
            startLevel = 1;
            break;
        }
    }
    const e = startLevel & 1 ? 'R' : 'L';
    const sor = e;
    let lastType = sor;
    for(let i = start; i < end; i++){
        if (types[i] === 'NSM') types[i] = lastType;
        else lastType = types[i];
    }
    lastType = sor;
    for(let i = start; i < end; i++){
        const t = types[i];
        if (t === 'EN') types[i] = lastType === 'AL' ? 'AN' : 'EN';
        else if (t === 'R' || t === 'L' || t === 'AL') lastType = t;
    }
    for(let i = start; i < end; i++){
        if (types[i] === 'AL') types[i] = 'R';
    }
    for(let i = start + 1; i < end - 1; i++){
        if (types[i] === 'ES' && types[i - 1] === 'EN' && types[i + 1] === 'EN') {
            types[i] = 'EN';
        }
        if (types[i] === 'CS' && (types[i - 1] === 'EN' || types[i - 1] === 'AN') && types[i + 1] === types[i - 1]) {
            types[i] = types[i - 1];
        }
    }
    for(let i = start; i < end; i++){
        if (types[i] !== 'EN') continue;
        let j;
        for(j = i - 1; j >= start && types[j] === 'ET'; j--)types[j] = 'EN';
        for(j = i + 1; j < end && types[j] === 'ET'; j++)types[j] = 'EN';
    }
    for(let i = start; i < end; i++){
        const t = types[i];
        if (t === 'WS' || t === 'ES' || t === 'ET' || t === 'CS') types[i] = 'ON';
    }
    lastType = sor;
    for(let i = start; i < end; i++){
        const t = types[i];
        if (t === 'EN') types[i] = lastType === 'L' ? 'L' : 'EN';
        else if (t === 'R' || t === 'L') lastType = t;
    }
    for(let i = start; i < end; i++){
        if (types[i] !== 'ON') continue;
        let runEnd = i + 1;
        while(runEnd < end && types[runEnd] === 'ON')runEnd++;
        const before = i > start ? types[i - 1] : sor;
        const after = runEnd < end ? types[runEnd] : sor;
        const bDir = before !== 'L' ? 'R' : 'L';
        const aDir = after !== 'L' ? 'R' : 'L';
        if (bDir === aDir) {
            for(let j = i; j < runEnd; j++)types[j] = bDir;
        }
        i = runEnd - 1;
    }
    for(let i = start; i < end; i++){
        if (types[i] === 'ON') types[i] = e;
    }
    for(let i = start; i < end; i++){
        const t = types[i];
        let level = startLevel;
        if ((startLevel & 1) === 0) {
            if (t === 'R') level++;
            else if (t === 'AN' || t === 'EN') level += 2;
        } else if (t === 'L' || t === 'AN' || t === 'EN') {
            level++;
        }
        levels[i] = level;
    }
    return startLevel;
}
export function computeSegmentLevels(normalized, segStarts) {
    const bidiLevels = computeBidiLevels(normalized);
    if (bidiLevels === null) return null;
    const segLevels = new Int8Array(segStarts.length);
    for(let i = 0; i < segStarts.length; i++){
        segLevels[i] = bidiLevels[segStarts[i]];
    }
    return segLevels;
}
