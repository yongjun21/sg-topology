const fs = require('fs')
const {contours} = require('d3-contour')
const _simplify = require('@turf/simplify')
const {projectGeojson, nestedMap} = require('./util')

const THRESHOLDS = [1, 21, 41, 61, 81, 101]

const generator = contours().thresholds(THRESHOLDS)

const SOURCES = [
  // 'srtm90',
  'srtm30',
  // 'aster',
  // 'alos'
]

SOURCES.forEach(generateContours)

function generateContours (source) {
  const meta = require(`../data/processed/${source}/meta.json`)
  const {buffer} = fs.readFileSync(`data/processed/${source}/dem.data`)
  const data = new Int16Array(buffer).map(v => v === -9999 ? 0 : v)
  const generated = generator.size([meta.width, meta.height])(data)
  const round5 = round(5)
  const projection = ([x, y]) => {
    return [
      meta.bbox[0] + x / meta.width * (meta.bbox[2] - meta.bbox[0]),
      meta.bbox[3] + y / meta.height * (meta.bbox[1] - meta.bbox[3])
    ].map(round5)
  }
  const cleaned = projectGeojson(generated, projection)
  const geojson = {
    type: 'FeatureCollection',
    features: cleaned.map(geometry => ({
      type: 'Feature',
      properties: {
        elevation: geometry.value
      },
      geometry: _simplify(geometry, {tolerance: 0.0001})
    }))
  }
  fs.writeFileSync(`data/processed/${source}/contours.json`, JSON.stringify(geojson))
}

function round (dp) {
  const k = Math.pow(10, dp)
  return v => Math.round(v * k) / k
}
