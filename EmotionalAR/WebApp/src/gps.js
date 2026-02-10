// ═══════════════════════════════════════════════════════════════
// GPS — Geolocation tracking + distance helpers
// ═══════════════════════════════════════════════════════════════

const EARTH_RADIUS = 6371000; // metres

let _lat = 0, _lng = 0;
let _ready = false;
let _watchId = null;
let _onUpdate = null;

/** Start tracking GPS. Returns a Promise that resolves with {lat, lng}. */
export function startGPS(onUpdate) {
    _onUpdate = onUpdate;
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            console.warn('[GPS] Geolocation not available, using stub position.');
            _lat = 1.3521; _lng = 103.8198; // Singapore
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

                // Start continuous watching
                _watchId = navigator.geolocation.watchPosition(
                    handleUpdate,
                    (err) => console.warn('[GPS] Watch error:', err.message),
                    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
                );
            },
            (err) => {
                console.warn('[GPS] Permission denied or error, using stub.');
                _lat = 1.3521; _lng = 103.8198;
                _ready = true;
                resolve({ lat: _lat, lng: _lng });
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

function handleUpdate(pos) {
    const newLat = pos.coords.latitude;
    const newLng = pos.coords.longitude;
    const dist = haversine(_lat, _lng, newLat, newLng);

    if (dist >= 5) { // moved > 5m
        _lat = newLat;
        _lng = newLng;
        if (_onUpdate) _onUpdate({ lat: _lat, lng: _lng, moved: dist });
    }
}

export function getPosition() { return { lat: _lat, lng: _lng }; }
export function isReady() { return _ready; }

/** Haversine distance in metres. */
export function haversine(lat1, lng1, lat2, lng2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Convert GPS offset to local XZ (metres).
 * x = east-west, z = north-south.
 */
export function gpsToLocal(lat, lng, refLat, refLng) {
    const x = (lng - refLng) * 111320 * Math.cos(refLat * Math.PI / 180);
    const z = (lat - refLat) * 110574;
    return { x, z };
}

export function stopGPS() {
    if (_watchId !== null) navigator.geolocation.clearWatch(_watchId);
}
