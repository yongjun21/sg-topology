const fs = require('fs')
const readline = require('readline')
const geotiff = require('geotiff')

exports.readLineByLine = function (...args) {
  const transforms = []
  let state = 'pending'
  let error = null

  const rl = readline.createInterface({
    input: fs.createReadStream(...args)
  })

  rl.on('line', line => {
    for (let t of transforms) {
      const {value, done} = t.input || {value: line, done: false}
      if (done) {
        t.output.value = value
        t.output.done = true
      } else if (t.type === 'filter') {
        t.output.value = value
        t.output.done = !t.fn(value, t.index++)
      } else if (t.type === 'map') {
        t.output.value = t.fn(value, t.index++)
        t.output.done = false
      } else if (t.type === 'reduce') {
        if (t.index === 0 && t.output === undefined) t.output = value
        else t.output = t.fn(t.output, value, t.index++)
      }
    }
  })

  rl.on('close', () => {
    transforms.forEach(t => {
      if (t.type === 'reduce') t.resolve(t.output)
    })
    state = 'fulfilled'
  })

  rl.on('error', err => {
    transforms.forEach(t => {
      if (t.type === 'reduce') t.reject(err)
    })
    state = 'rejected'
    error = err
  })

  function createPromise (context) {
    const p = {}

    const methods = ['filter', 'map']
    methods.forEach(method => {
      p[method] = fn => {
        const output = {}
        transforms.push({
          type: method,
          fn,
          index: 0,
          input: context,
          output
        })
        return createPromise(output)
      }
    })

    p.slice = (start, end) => {
      const output = {}
      transforms.push({
        type: 'filter',
        fn: (line, i) => (start == null || i >= start) && (end == null || i < end),
        index: 0,
        input: context,
        output
      })
      return createPromise(output)
    }

    p.reduce = (fn, init) => {
      if (state === 'fulfilled') return Promise.resolve()
      if (state === 'rejected') return Promise.reject(error)
      return new Promise((resolve, reject) => {
        transforms.push({
          type: 'reduce',
          fn,
          index: 0,
          input: context,
          output: init,
          resolve,
          reject
        })
      })
    }

    p.then = (...args) => {
      return p.reduce((a, v) => {
        a.push(v)
        return a
      }, []).then(...args)
    }

    return p
  }

  return createPromise()
}

exports.readHGT = function (...args) {
  const {buffer} = fs.readFileSync(...args)
  const view = new DataView(buffer)
  const arr = new Int16Array(view.byteLength / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = view.getInt16(i * 2)
  }
  arr.width = arr.height = Math.sqrt(arr.length)
  return arr
}

exports.readTiff = function (...args) {
  const {buffer} = fs.readFileSync(...args)
  return geotiff.fromArrayBuffer(buffer)
    .then(parser => parser.readRasters())
    .then(rasters => rasters[0])
    .then(arr => {
      arr.width = arr.height = Math.sqrt(arr.length)
      return arr
    })
}

exports.formatCSV = function (data) {
  const {height, width} = data
  const rows = []
  for (let i = 0; i < height; i++) {
    const row = Array.from(data.slice(i * width, (i + 1) * width))
      .map(v => (v === 0 || v === -9999) ? '  ' : v.toFixed().padStart(2, ' '))
      .join(',')
    rows.push(row)
  }
  return rows.join('\n')
}

exports.stitch = function (matrix, overlap = 0) {
  const r = matrix.length
  const c = matrix[0].length
  const {height, width} = matrix[0][0]
  const H = r * (height - overlap) + overlap
  const W = c * (width - overlap) + overlap
  const arr = new matrix[0][0].constructor(H * W)
  arr.height = H
  arr.width = W
  let offset = 0
  for (let y = 0; y < r; y++) {
    for (let i = 0; i < height; i++) {
      if (y > 0 && i < overlap) continue
      for (let x = 0; x < c; x++) {
        const trim = x > 0 ? overlap : 0
        const slice = matrix[y][x].slice(i * width + trim, (i + 1) * width)
        arr.set(slice, offset)
        offset += slice.length
      }
    }
  }
  return arr
}

exports.subset = function (data, bbox) {
  const {width, height} = data
  const minCol = clamp(bbox[0], 0, width - 1)
  const minRow = clamp(bbox[1], 0, height - 1)
  const maxCol = clamp(bbox[2], 0, width - 1)
  const maxRow = clamp(bbox[3], 0, height - 1)
  const arr = data.filter((v, i) => {
    const row = Math.floor(i / width)
    const col = i % width
    return row >= bbox[1] && row <= bbox[3] && col >= bbox[0] && col <= bbox[2]
  })
  arr.width = maxCol - minCol + 1
  arr.height = maxRow - minRow + 1

  return arr
}

exports.projectGeojson = function projectGeojson (geojson, proj) {
  if (Array.isArray(geojson)) return geojson.map(item => projectGeojson(item, proj))
  if (geojson.type === 'FeatureCollection') {
    const features = geojson.features.map(item => projectGeojson(item, proj))
    return Object.assign({}, geojson, {features})
  }
  if (geojson.type === 'Feature') {
    const geometry = projectGeojson(geojson.geometry, proj)
    return Object.assign({}, geojson, {geometry})
  }
  const nestedLevels = {
    Point: 0,
    LineString: 1,
    Polygon: 2,
    MultiPoint: 1,
    MultiLineString: 2,
    MultiPolygon: 3
  }
  const coordinates = nestedMap(geojson.coordinates, proj, nestedLevels[geojson.type])
  return Object.assign({}, geojson, {coordinates})
}

exports.nestedMap = nestedMap

function nestedMap (arr, fn, levels = 1) {
  if (levels === 0) return fn(arr)
  return arr.map(v => nestedMap(v, fn, levels - 1))
}

function clamp (value, min, max) {
  return Math.min(Math.max(value, min), max)
}
