function calculateDistance(latitude1, longitude1, latitude2, longitude2) {
  const earthRadius = 6371000
  const dLatitude = ((latitude2 - latitude1) * Math.PI) / 180
  const dLongitude = ((longitude2 - longitude1) * Math.PI) / 180
  const a = Math.sin(dLatitude / 2) ** 2
    + Math.cos((latitude1 * Math.PI) / 180)
      * Math.cos((latitude2 * Math.PI) / 180)
      * Math.sin(dLongitude / 2) ** 2
  return earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function getShopLocation() {
  return {
    latitude: Number(process.env.SHOP_LAT || 13.7563),
    longitude: Number(process.env.SHOP_LNG || 100.5018),
    maxDistance: Number(process.env.MAX_DISTANCE_METERS || 100),
  }
}

function validateCoordinates(latitude, longitude) {
  return Number.isFinite(Number(latitude))
    && Number.isFinite(Number(longitude))
    && Number(latitude) >= -90
    && Number(latitude) <= 90
    && Number(longitude) >= -180
    && Number(longitude) <= 180
}

module.exports = { calculateDistance, getShopLocation, validateCoordinates }
