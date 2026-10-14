/* perfect-freehand
   MIT License

   Copyright (c) 2021 Stephen Ruiz Ltd

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
*/

const { PI } = Math

const RATE_OF_PRESSURE_CHANGE = 0.275

const FIXED_PI = PI + 0.0001

const START_CAP_SEGMENTS = 13

const END_CAP_SEGMENTS = 29

const CORNER_CAP_SEGMENTS = 13

const END_NOISE_THRESHOLD = 3

const MIN_STREAMLINE_T = 0.15

const STREAMLINE_T_RANGE = 0.85

const MIN_RADIUS = 0.01

const DEFAULT_FIRST_PRESSURE = 0.25

const DEFAULT_PRESSURE = 0.5

const UNIT_OFFSET                   = [1, 1]

function neg(A      )       {
  return [-A[0], -A[1]]
}

function add(A      , B      )       {
  return [A[0] + B[0], A[1] + B[1]]
}

function addInto(out      , A      , B      )       {
  out[0] = A[0] + B[0]
  out[1] = A[1] + B[1]
  return out
}

function sub(A      , B      )       {
  return [A[0] - B[0], A[1] - B[1]]
}

function subInto(out      , A      , B      )       {
  out[0] = A[0] - B[0]
  out[1] = A[1] - B[1]
  return out
}

function mul(A      , n        )       {
  return [A[0] * n, A[1] * n]
}

function mulInto(out      , A      , n        )       {
  out[0] = A[0] * n
  out[1] = A[1] * n
  return out
}

function div(A      , n        )       {
  return [A[0] / n, A[1] / n]
}

function per(A      )       {
  return [A[1], -A[0]]
}

function perInto(out      , A      )       {
  const temp = A[0]
  out[0] = A[1]
  out[1] = -temp
  return out
}

function dpr(A      , B      )         {
  return A[0] * B[0] + A[1] * B[1]
}

function isEqual(A      , B      )          {
  return A[0] === B[0] && A[1] === B[1]
}

function len(A      )         {
  return Math.hypot(A[0], A[1])
}

function len2(A      )         {
  return A[0] * A[0] + A[1] * A[1]
}

function dist2(A      , B      )         {
  const dx = A[0] - B[0]
  const dy = A[1] - B[1]
  return dx * dx + dy * dy
}

function uni(A      )       {
  return div(A, len(A))
}

function dist(A      , B      )         {
  return Math.hypot(A[1] - B[1], A[0] - B[0])
}

function rotAround(A      , C      , r        )       {
  const s = Math.sin(r)
  const c = Math.cos(r)

  const px = A[0] - C[0]
  const py = A[1] - C[1]

  const nx = px * c - py * s
  const ny = px * s + py * c

  return [nx + C[0], ny + C[1]]
}

function rotAroundInto(out      , A      , C      , r        )       {
  const s = Math.sin(r)
  const c = Math.cos(r)

  const px = A[0] - C[0]
  const py = A[1] - C[1]

  const nx = px * c - py * s
  const ny = px * s + py * c

  out[0] = nx + C[0]
  out[1] = ny + C[1]
  return out
}

function lrp(A      , B      , t        )       {
  return add(A, mul(sub(B, A), t))
}

function lrpInto(out      , A      , B      , t        )       {
  const dx = B[0] - A[0]
  const dy = B[1] - A[1]
  out[0] = A[0] + dx * t
  out[1] = A[1] + dy * t
  return out
}

function prj(A      , B      , c        )       {
  return add(A, mul(B, c))
}

function getStrokeRadius(
  size        ,
  thinning        ,
  pressure        ,
  easing                        = (t) => t
) {
  return size * easing(0.5 - thinning * (0.5 - pressure))
}

const { min } = Math

function simulatePressure(
  prevPressure        ,
  distance        ,
  size
)         {

  const sp = min(1, distance / size)

  const rp = min(1, 1 - sp)

  return min(
    1,
    prevPressure + (rp - prevPressure) * (sp * RATE_OF_PRESSURE_CHANGE)
  )
}

const _vectorDiff       = [0, 0]

function isValidPressure(pressure                    )                     {
  return pressure != null && pressure >= 0
}

function getStrokePoints

 (points           , options = {}                 )                {
  const { streamline = 0.5, size = 16, last: isComplete = false } = options

  if (points.length === 0) return []

  const t = MIN_STREAMLINE_T + (1 - streamline) * STREAMLINE_T_RANGE

  let pts = Array.isArray(points[0])
    ? (points       )
    : (points       ).map(({ x, y, pressure = DEFAULT_PRESSURE }) => [
        x,
        y,
        pressure,
      ])

  if (pts.length === 2) {
    const last = pts[1]
    pts = pts.slice(0, -1)
    for (let i = 1; i < 5; i++) {
      pts.push(lrp(pts[0]        , last        , i / 4))
    }
  }

  if (pts.length === 1) {
    pts = [...pts, [...add(pts[0]        , UNIT_OFFSET), ...pts[0].slice(2)]]
  }

  const strokePoints                = [
    {
      point: [pts[0][0], pts[0][1]],
      pressure: isValidPressure(pts[0][2]) ? pts[0][2] : DEFAULT_FIRST_PRESSURE,
      vector: [...UNIT_OFFSET],
      distance: 0,
      runningLength: 0,
    },
  ]

  let hasReachedMinimumLength = false

  let runningLength = 0

  let prev = strokePoints[0]

  const max = pts.length - 1

  for (let i = 1; i < pts.length; i++) {
    const point       =
      isComplete && i === max
        ?

          [pts[i][0], pts[i][1]]
        :

          lrp(prev.point, pts[i]        , t)

    if (isEqual(prev.point, point)) continue

    const distance = dist(point, prev.point)

    runningLength += distance

    if (i < max && !hasReachedMinimumLength) {
      if (runningLength < size) continue
      hasReachedMinimumLength = true

    }

    subInto(_vectorDiff, prev.point, point)
    prev = {

      point,

      pressure: isValidPressure(pts[i][2]) ? pts[i][2] : DEFAULT_PRESSURE,

      vector: uni(_vectorDiff),

      distance,

      runningLength,
    }

    strokePoints.push(prev)
  }

  strokePoints[0].vector = strokePoints[1]?.vector || [0, 0]

  return strokePoints
}

const _offset       = [0, 0]
const _tl       = [0, 0]
const _tr       = [0, 0]

function drawDot(center      , radius        )         {
  const offsetPoint = add(center, [1, 1])
  const start = prj(center, uni(per(sub(center, offsetPoint))), -radius)
  const dotPts         = []
  const step = 1 / START_CAP_SEGMENTS
  for (let t = step; t <= 1; t += step) {
    dotPts.push(rotAround(start, center, FIXED_PI * 2 * t))
  }
  return dotPts
}

function drawRoundStartCap(
  center      ,
  rightPoint      ,
  segments
)         {
  const cap         = []
  const step = 1 / segments
  for (let t = step; t <= 1; t += step) {
    cap.push(rotAround(rightPoint, center, FIXED_PI * t))
  }
  return cap
}

function drawFlatStartCap(
  center      ,
  leftPoint      ,
  rightPoint
)         {
  const cornersVector = sub(leftPoint, rightPoint)
  const offsetA = mul(cornersVector, 0.5)
  const offsetB = mul(cornersVector, 0.51)
  return [
    sub(center, offsetA),
    sub(center, offsetB),
    add(center, offsetB),
    add(center, offsetA),
  ]
}

function drawRoundEndCap(
  center      ,
  direction      ,
  radius        ,
  segments
)         {
  const cap         = []
  const start = prj(center, direction, radius)
  const step = 1 / segments
  for (let t = step; t < 1; t += step) {
    cap.push(rotAround(start, center, FIXED_PI * 3 * t))
  }
  return cap
}

function drawFlatEndCap(center      , direction      , radius        )         {
  return [
    add(center, mul(direction, radius)),
    add(center, mul(direction, radius * 0.99)),
    sub(center, mul(direction, radius * 0.99)),
    sub(center, mul(direction, radius)),
  ]
}

function computeTaperDistance(
  taper                              ,
  size        ,
  totalLength
)         {
  if (taper === false || taper === undefined) return 0
  if (taper === true) return Math.max(size, totalLength)
  return taper
}

function computeInitialPressure(
  points               ,
  shouldSimulatePressure         ,
  size
)         {
  return points.slice(0, 10).reduce((acc, curr) => {
    let pressure = curr.pressure
    if (shouldSimulatePressure) {
      pressure = simulatePressure(acc, curr.distance, size)
    }
    return (acc + pressure) / 2
  }, points[0].pressure)
}

function getStrokeOutlinePoints(
  points               ,
  options                         = {}
)         {
  const {
    size = 16,
    smoothing = 0.5,
    thinning = 0.5,
    simulatePressure: shouldSimulatePressure = true,
    easing = (t) => t,
    start = {},
    end = {},
    last: isComplete = false,
  } = options

  const { cap: capStart = true, easing: taperStartEase = (t) => t * (2 - t) } =
    start

  const { cap: capEnd = true, easing: taperEndEase = (t) => --t * t * t + 1 } =
    end

  if (points.length === 0 || size <= 0) {
    return []
  }

  const totalLength = points[points.length - 1].runningLength

  const taperStart = computeTaperDistance(start.taper, size, totalLength)
  const taperEnd = computeTaperDistance(end.taper, size, totalLength)

  const minDistance = Math.pow(size * smoothing, 2)

  const leftPts         = []
  const rightPts         = []

  let prevPressure = computeInitialPressure(
    points,
    shouldSimulatePressure,
    size
  )

  let radius = getStrokeRadius(
    size,
    thinning,
    points[points.length - 1].pressure,
    easing
  )

  let firstRadius                     = undefined

  let prevVector = points[0].vector

  let prevLeftPoint = points[0].point
  let prevRightPoint = prevLeftPoint

  let tempLeftPoint       = prevLeftPoint
  let tempRightPoint       = prevRightPoint

  let isPrevPointSharpCorner = false

  for (let i = 0; i < points.length; i++) {
    let { pressure } = points[i]
    const { point, vector, distance, runningLength } = points[i]
    const isLastPoint = i === points.length - 1

    if (!isLastPoint && totalLength - runningLength < END_NOISE_THRESHOLD) {
      continue
    }

    if (thinning) {
      if (shouldSimulatePressure) {

        pressure = simulatePressure(prevPressure, distance, size)
      }

      radius = getStrokeRadius(size, thinning, pressure, easing)
    } else {
      radius = size / 2
    }

    if (firstRadius === undefined) {
      firstRadius = radius
    }

    const taperStartStrength =
      runningLength < taperStart
        ? taperStartEase(runningLength / taperStart)
        : 1

    const taperEndStrength =
      totalLength - runningLength < taperEnd
        ? taperEndEase((totalLength - runningLength) / taperEnd)
        : 1

    radius = Math.max(
      MIN_RADIUS,
      radius * Math.min(taperStartStrength, taperEndStrength)
    )

    const nextVector = (!isLastPoint ? points[i + 1] : points[i]).vector
    const nextDpr = !isLastPoint ? dpr(vector, nextVector) : 1.0
    const prevDpr = dpr(vector, prevVector)

    const isPointSharpCorner = prevDpr < 0 && !isPrevPointSharpCorner
    const isNextPointSharpCorner = nextDpr < 0

    if (isPointSharpCorner || isNextPointSharpCorner) {

      perInto(_offset, prevVector)
      mulInto(_offset, _offset, radius)

      const step = 1 / CORNER_CAP_SEGMENTS
      for (let t = 0; t <= 1; t += step) {

        subInto(_tl, point, _offset)
        rotAroundInto(_tl, _tl, point, FIXED_PI * t)
        tempLeftPoint = [_tl[0], _tl[1]]
        leftPts.push(tempLeftPoint)

        addInto(_tr, point, _offset)
        rotAroundInto(_tr, _tr, point, FIXED_PI * -t)
        tempRightPoint = [_tr[0], _tr[1]]
        rightPts.push(tempRightPoint)
      }

      prevLeftPoint = tempLeftPoint
      prevRightPoint = tempRightPoint

      if (isNextPointSharpCorner) {
        isPrevPointSharpCorner = true
      }
      continue
    }

    isPrevPointSharpCorner = false

    if (isLastPoint) {
      perInto(_offset, vector)
      mulInto(_offset, _offset, radius)
      leftPts.push(sub(point, _offset))
      rightPts.push(add(point, _offset))
      continue
    }

    lrpInto(_offset, nextVector, vector, nextDpr)
    perInto(_offset, _offset)
    mulInto(_offset, _offset, radius)

    subInto(_tl, point, _offset)
    tempLeftPoint = [_tl[0], _tl[1]]

    if (i <= 1 || dist2(prevLeftPoint, tempLeftPoint) > minDistance) {
      leftPts.push(tempLeftPoint)
      prevLeftPoint = tempLeftPoint
    }

    addInto(_tr, point, _offset)
    tempRightPoint = [_tr[0], _tr[1]]

    if (i <= 1 || dist2(prevRightPoint, tempRightPoint) > minDistance) {
      rightPts.push(tempRightPoint)
      prevRightPoint = tempRightPoint
    }

    prevPressure = pressure
    prevVector = vector
  }

  const firstPoint       = [points[0].point[0], points[0].point[1]]

  const lastPoint       =
    points.length > 1
      ? [points[points.length - 1].point[0], points[points.length - 1].point[1]]
      : add(points[0].point, [1, 1])

  const startCap         = []

  const endCap         = []

  if (points.length === 1) {
    if (!(taperStart || taperEnd) || isComplete) {
      return drawDot(firstPoint, firstRadius || radius)
    }
  } else {

    if (taperStart) {

    } else if (capStart) {
      startCap.push(
        ...drawRoundStartCap(firstPoint, rightPts[0], START_CAP_SEGMENTS)
      )
    } else {
      startCap.push(...drawFlatStartCap(firstPoint, leftPts[0], rightPts[0]))
    }

    const direction = per(neg(points[points.length - 1].vector))

    if (taperEnd) {

      endCap.push(lastPoint)
    } else if (capEnd) {
      endCap.push(
        ...drawRoundEndCap(lastPoint, direction, radius, END_CAP_SEGMENTS)
      )
    } else {
      endCap.push(...drawFlatEndCap(lastPoint, direction, radius))
    }
  }

  return leftPts.concat(endCap, rightPts.reverse(), startCap)
}

function getStroke(
  points                                                            ,
  options                = {}
)         {
  return getStrokeOutlinePoints(getStrokePoints(points, options), options)
}
export {getStroke, getStrokePoints};
