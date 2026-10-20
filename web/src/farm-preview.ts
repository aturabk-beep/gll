// Display-only farm footprint from the calibrated ciftlik.png. The live
// boundary remains the office test boundary returned by the backend.
export const farmImageBounds = {
 south: 37.070134888361615,
 west: 30.31945901335553,
 north: 37.08018355375682,
 east: 30.33332243224469,
};

export function farmPreviewBoundary(bufferMeters: number) {
 const buffer_meters = Math.max(0, Math.min(1000, Number.isFinite(bufferMeters) ? bufferMeters : 0));
 const centerLat = (farmImageBounds.south + farmImageBounds.north) / 2;
 const centerLon = (farmImageBounds.west + farmImageBounds.east) / 2;
 const latitudeDelta = buffer_meters / 6371000 * 180 / Math.PI;
 const longitudeDelta = buffer_meters / (6371000 * Math.cos(centerLat * Math.PI / 180)) * 180 / Math.PI;
 return {
  buffer_meters,
  south: farmImageBounds.south - latitudeDelta,
  west: farmImageBounds.west - longitudeDelta,
  north: farmImageBounds.north + latitudeDelta,
  east: farmImageBounds.east + longitudeDelta,
  centerLat,
  centerLon,
 };
}
