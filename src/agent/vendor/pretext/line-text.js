/*! Pretext 1.0.0 + main (0d102a5cd) | MIT; BSD/Unicode/ICU notices in LICENSE | Copyright (c) 2026 Pretext contributors */
import { findGraphemeEnds } from './graphemes.js'
import { HARD_BREAK, KIND_BITS, SOFT_HYPHEN, ZERO_WIDTH_BREAK, ZERO_WIDTH_GLUE } from './analysis.js'
import { isDiscretionaryLineEnd,                       } from './line-break.js'
import { getEngineProfile } from './measurement.js'

// A handle with each segment's text, which line text is built from: prepareWithSegments()'s, or
// a rich-inline paragraph's.
                                                                        

// Per handle, the grapheme ends of each segment a line has started or ended inside.
const graphemeEndCaches = new WeakMap                                           ()

// The offsets in a segment's text where its graphemes end, in order, then zeros.
export function getGraphemeEnds(prepared                  , segmentIndex        )             {
  let cache = graphemeEndCaches.get(prepared)
  if (cache === undefined) {
    cache = new Map                    ()
    graphemeEndCaches.set(prepared, cache)
  }
  let ends = cache.get(segmentIndex)
  if (ends === undefined) {
    const segment = prepared.segments[segmentIndex] 
    ends = new Int32Array(segment.length)
    findGraphemeEnds(getEngineProfile().graphemeTable, segment, 0, segment.length, ends)
    cache.set(segmentIndex, ends)
  }
  return ends
}

// Where grapheme `graphemeIndex` of a segment starts in its text.
function getGraphemeStart(prepared                  , segmentIndex        , graphemeIndex        )         {
  return graphemeIndex === 0 ? 0 : getGraphemeEnds(prepared, segmentIndex)[graphemeIndex - 1] 
}

// The text of a range of `prepared`'s segments, with no hyphen: that of a rich-inline fragment its
// line goes on after.
export function buildRangeText(
  prepared                  ,
  startSegmentIndex        ,
  startGraphemeIndex        ,
  endSegmentIndex        ,
  endGraphemeIndex        ,
)         {
  const { segmentFlags } = prepared
  // A range kept from a longer text, such as one prepared again since, can end
  // past this one, up to segment Infinity: its text stops at this text's end.
  const segmentCount = prepared.segments.length
  const segmentEnd = endSegmentIndex < segmentCount ? endSegmentIndex : segmentCount
  let text = ''
  for (let i = startSegmentIndex; i < segmentEnd; i++) {
    // A soft hyphen shows only as the hyphen of a line that ends at it, and one the
    // Gecko scan takes as a zero-width break never does.
    const kind = segmentFlags[i]  & KIND_BITS
    if (
      kind === SOFT_HYPHEN || kind === HARD_BREAK ||
      ((kind === ZERO_WIDTH_GLUE || kind === ZERO_WIDTH_BREAK) && prepared.segments[i] .charCodeAt(0) === 0x00AD)
    ) continue
    if (i === startSegmentIndex && startGraphemeIndex > 0) {
      text += prepared.segments[i] .slice(getGraphemeStart(prepared, i, startGraphemeIndex))
    } else {
      text += prepared.segments[i] 
    }
  }

  if (endGraphemeIndex > 0 && endSegmentIndex < segmentCount) {
    text += prepared.segments[endSegmentIndex] .slice(
      getGraphemeStart(prepared, endSegmentIndex, startSegmentIndex === endSegmentIndex ? startGraphemeIndex : 0),
      getGraphemeStart(prepared, endSegmentIndex, endGraphemeIndex),
    )
  }

  return text
}

// A line's text: its range's, with a hyphen where it ends at a soft hyphen, whose width counted it.
export function buildLineTextFromRange(
  prepared                  ,
  startSegmentIndex        ,
  startGraphemeIndex        ,
  endSegmentIndex        ,
  endGraphemeIndex        ,
)         {
  const text = buildRangeText(prepared, startSegmentIndex, startGraphemeIndex, endSegmentIndex, endGraphemeIndex)
  return isDiscretionaryLineEnd(prepared.segmentFlags, prepared.widths.length, endSegmentIndex, endGraphemeIndex) ? text + '-' : text
}
