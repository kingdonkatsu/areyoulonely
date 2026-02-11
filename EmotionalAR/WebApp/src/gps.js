// ═══════════════════════════════════════════════════════════════
// GPS — Geolocation tracking + distance helpers
// ═══════════════════════════════════════════════════════════════

const EARTH_RADIUS = 6371000; // metres
const MAX_ACCURACY = 10;      // Reject readings with accuracy > 10m (indoor cap)

let _lat = 0, _lng = 0;
let _ready = false;
let _watchId = null;
let _onUpdate = null;
let _lastUpdateTime = 0;      // For speed calculation

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
                _lastUpdateTime = performance.now();
                console.log(`[GPS] Position: ${_lat.toFixed(6)}, ${_lng.toFixed(6)} (±${pos.coords.accuracy.toFixed(1)}m)`);
                resolve({ lat: _lat, lng: _lng });

                // Start continuous watching — fast timeout for near-instant updates
                _watchId = navigator.geolocation.watchPosition(
                    handleUpdate,
                    (err) => {
                        if (err.code !== err.TIMEOUT) {
                            console.warn('[GPS] Watch error:', err.message);
                        }
                    },
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
                );

                // Periodic status polling (every 10 seconds)
                setInterval(() => {
                    const timeSinceUpdate = ((performance.now() - _lastUpdateTime) / 1000).toFixed(1);
                    console.log(`📍 [GPS STATUS] Current: ${_lat.toFixed(6)}, ${_lng.toFixed(6)} | Last update: ${timeSinceUpdate}s ago`);
                }, 10000);
            },
            (err) => {
                console.warn('[GPS] Initial acquisition failed, using fallback.');
                _lat = 1.3521; _lng = 103.8198;
                _ready = true;
                _lastUpdateTime = performance.now();
                resolve({ lat: _lat, lng: _lng });
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    });
}

function handleUpdate(pos) {
    const newLat = pos.coords.latitude;
    const newLng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    const dist = haversine(_lat, _lng, newLat, newLng);

    // Log EVERY GPS update (even if filtered)
    console.log(`[GPS UPDATE] Lat: ${newLat.toFixed(6)}, Lng: ${newLng.toFixed(6)}, Accuracy: ±${accuracy.toFixed(1)}m, Distance: ${dist.toFixed(2)}m`);

    // Accuracy filter: reject noisy indoor readings
    if (accuracy > MAX_ACCURACY) {
        console.warn(`[GPS REJECTED] Accuracy ${accuracy.toFixed(1)}m > ${MAX_ACCURACY}m threshold`);
        return;
    }

    // Calculate time since last update for speed
    const now = performance.now();
    const timeDelta = (now - _lastUpdateTime) / 1000; // seconds

    if (dist >= 0.5) { // moved > 0.5m — pass to callback
        const speed = timeDelta > 0 ? dist / timeDelta : 0; // m/s

        console.log(`✅ [GPS ACCEPTED] Moved ${dist.toFixed(2)}m at ${speed.toFixed(2)} m/s`);

        _lat = newLat;
        _lng = newLng;
        _lastUpdateTime = now;

        if (_onUpdate) _onUpdate({
            lat: _lat,
            lng: _lng,
            moved: dist,
            speed: speed,
            accuracy: accuracy,
            timestamp: now
        });
    } else {
        console.log(`⏸️ [GPS IGNORED] Distance ${dist.toFixed(2)}m < 0.5m threshold`);
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
