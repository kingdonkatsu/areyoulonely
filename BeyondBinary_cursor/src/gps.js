const EARTH_RADIUS = 6371000;

let _lat = 0;
let _lng = 0;
let _ready = false;
let _watchId = null;
let _onUpdate = null;

export function startGPS(onUpdate) {
  _onUpdate = onUpdate;
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn('[GPS] Geolocation not available, using stub position.');
      _lat = 1.3521;
      _lng = 103.8198;
      _ready = true;
      resolve({ lat: _lat, lng: _lng });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        _lat = pos.coords.latitude;
        _lng = pos.coords.longitude;
        _ready = true;
        console.log(`[GPS] Position: ${_lat.toFixed(6)}, ${_lng.toFixed(6)}`);
        resolve({ lat: _lat, lng: _lng });

        _watchId = navigator.geolocation.watchPosition(
          handleUpdate,
          (err) => {
            if (err.code !== err.TIMEOUT) {
              console.warn('[GPS] Watch error:', err.message);
            }
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
        );
      },
      () => {
        console.warn('[GPS] Initial acquisition failed, using fallback.');
        _lat = 1.3521;
        _lng = 103.8198;
        _ready = true;
        resolve({ lat: _lat, lng: _lng });
      },
      { enableHighAccuracy: true, timeout: 30000 },
    );
  });
}

function handleUpdate(pos) {
  const newLat = pos.coords.latitude;
  const newLng = pos.coords.longitude;
  const dist = haversine(_lat, _lng, newLat, newLng);

  if (dist >= 1) {
    _lat = newLat;
    _lng = newLng;
    if (_onUpdate) _onUpdate({ lat: _lat, lng: _lng, moved: dist });
  }
}

export function getPosition() {
  return { lat: _lat, lng: _lng };
}

export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function gpsToLocal(lat, lng, refLat, refLng) {
  const x = (lng - refLng) * 111320 * Math.cos(refLat * Math.PI / 180);
  const z = (lat - refLat) * 110574;
  return { x, z };
}

