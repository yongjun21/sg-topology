const fs = require('fs')
const {readLineByLine, readHGT, readTiff, formatCSV, stitch, subset} = require('./util')

// preprocessSRTM90()
preprocessSRTM30()
// preprocessASTER()
// preprocessALOS()

function preprocessSRTM90 () {
  const DATA_BBOX = [100, 0, 105, 5]
  const CELL_WIDTH = 1 / 1200
  const BUFFER = 12

  const {subsetIndex, meta} = setup(DATA_BBOX, CELL_WIDTH, BUFFER)

  readLineByLine('data/raw/srtm90/srtm_57_12.txt')
    .slice(6)
    .slice(subsetIndex[1], subsetIndex[3] + 1)
    .map(parseLine)
    .reduce((arr, row, i) => {
      arr.set(row, i * meta.width)
      return arr
    }, new Int16Array(meta.width * meta.height))
    .then(data => {
      data.width = meta.width
      data.height = meta.height
      fs.writeFileSync('data/processed/srtm90/dem.data', data)
      fs.writeFileSync('data/processed/srtm90/dem.csv', formatCSV(data))
      fs.writeFileSync('data/processed/srtm90/meta.json', JSON.stringify(meta, null, 2))
    })

  function parseLine (line) {
    return line.split(' ')
      .slice(subsetIndex[0], subsetIndex[2] + 1)
      .map(Number)
  }
}

function preprocessSRTM30 () {
  const DATA_BBOX = [103, 1, 105, 2]
  const CELL_WIDTH = 1 / 3600
  const BUFFER = 36

  const {subsetIndex, meta} = setup(DATA_BBOX, CELL_WIDTH, BUFFER)

  const arr103 = readHGT('data/raw/srtm30/N01E103.hgt')
  const arr104 = readHGT('data/raw/srtm30/N01E104.hgt')
  const stiched = stitch([
    [arr103, arr104]
  ], 1)
  const data = subset(stiched, subsetIndex)
  fs.writeFileSync('data/processed/srtm30/dem.data', data)
  fs.writeFileSync('data/processed/srtm30/dem.csv', formatCSV(data))
  fs.writeFileSync('data/processed/srtm30/meta.json', JSON.stringify(meta, null, 2))
}

function preprocessASTER () {
  const DATA_BBOX = [103, 1, 105, 2]
  const CELL_WIDTH = 1 / 3600
  const BUFFER = 36

  const {subsetIndex, meta} = setup(DATA_BBOX, CELL_WIDTH, BUFFER)

  Promise.all([
    readTiff('data/raw/aster/ASTGTMV003_N01E103_dem.tif'),
    readTiff('data/raw/aster/ASTGTMV003_N01E104_dem.tif')
  ]).then(([arr103, arr104]) => {
    const stiched = stitch([
      [arr103, arr104]
    ], 1)
    const data = subset(stiched, subsetIndex)
    fs.writeFileSync('data/processed/aster/dem.data', data)
    fs.writeFileSync('data/processed/aster/dem.csv', formatCSV(data))
    fs.writeFileSync('data/processed/aster/meta.json', JSON.stringify(meta, null, 2))
  })
}

function preprocessALOS () {
  const DATA_BBOX = [103, 1, 105, 2]
  const CELL_WIDTH = 1 / 3600
  const BUFFER = 36

  const {subsetIndex, meta} = setup(DATA_BBOX, CELL_WIDTH, BUFFER)

  Promise.all([
    readTiff('data/raw/aster/ASTGTMV003_N01E103_dem.tif'),
    readTiff('data/raw/aster/ASTGTMV003_N01E104_dem.tif')
  ]).then(([arr103, arr104]) => {
    const stiched = stitch([
      [arr103, arr104]
    ], 1)
    const data = subset(stiched, subsetIndex)
    fs.writeFileSync('data/processed/alos/dem.data', data)
    fs.writeFileSync('data/processed/alos/dem.csv', formatCSV(data))
    fs.writeFileSync('data/processed/alos/meta.json', JSON.stringify(meta, null, 2))
  })
}

function setup (DATA_BBOX, CELL_WIDTH, BUFFER) {
  const SG_BBOX = [
    103.60570757438656,
    1.1586910224645797,
    104.08848741420671,
    1.4707745415467735
  ]

  const subsetIndex = addBuffer([
    ...lonLatToCell([SG_BBOX[0], SG_BBOX[3]], DATA_BBOX, CELL_WIDTH),
    ...lonLatToCell([SG_BBOX[2], SG_BBOX[1]], DATA_BBOX, CELL_WIDTH)
  ], BUFFER)

  const subsetBbox = [
    ...cellToLonLat([subsetIndex[0], subsetIndex[3]], DATA_BBOX, CELL_WIDTH),
    ...cellToLonLat([subsetIndex[2], subsetIndex[1]], DATA_BBOX, CELL_WIDTH)
  ]

  return {
    subsetIndex,
    meta: {
      bbox: subsetBbox,
      width: subsetIndex[2] - subsetIndex[0] + 1,
      height: subsetIndex[3] - subsetIndex[1] + 1,
      cellWidth: CELL_WIDTH
    }
  }
}

function lonLatToCell ([lon, lat], bbox, cellWidth) {
  return [
    Math.round((lon - bbox[0]) / cellWidth),
    Math.round((bbox[3] - lat) / cellWidth)
  ]
}

function cellToLonLat ([x, y], bbox, cellWidth) {
  return [
    bbox[0] + x * cellWidth,
    bbox[3] - y * cellWidth
  ]
}

function addBuffer (bbox, buffer) {
  return [
    Math.floor(bbox[0] / buffer) * buffer - buffer,
    Math.floor(bbox[1] / buffer) * buffer - buffer,
    Math.ceil(bbox[2] / buffer) * buffer + buffer,
    Math.ceil(bbox[3] / buffer) * buffer + buffer
  ]
}
