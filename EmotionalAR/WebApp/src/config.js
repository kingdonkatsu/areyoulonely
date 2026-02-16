// ═══════════════════════════════════════════════════════════════
// Config — Shared application constants
// ═══════════════════════════════════════════════════════════════

// ── Mapbox API ──────────────────────────────────────────────
// Get your free token at: https://account.mapbox.com/access-tokens/
// Get your free token at: https://account.mapbox.com/access-tokens/
export const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

// Vector tile zoom level (15 = detailed street-level data)
export const TILE_ZOOM = 15;

// ── Tile Math Utilities ───────────────────────────────────────

/**
 * Convert lat/lon to tile coordinates at a given zoom level.
 * Returns { x, y } tile indices.
 */
export function latLonToTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

/**
 * Get the bounding box [west, south, east, north] for a tile.
 * Needed by vector-tile's toGeoJSON().
 */
export function tileBbox(x, y, z) {
    const n = Math.pow(2, z);
    const west = x / n * 360 - 180;
    const east = (x + 1) / n * 360 - 180;
    const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
    return { west, south, east, north };
}

/**
 * Fetch a Mapbox vector tile as an ArrayBuffer.
 * Uses mapbox.mapbox-streets-v8 tileset.
 * Returns null on failure after retries.
 */
export async function fetchVectorTile(tilesetId, z, x, y, maxRetries = 3) {
    const url = `https://api.mapbox.com/v4/${tilesetId}/${z}/${x}/${y}.mvt?access_token=${MAPBOX_ACCESS_TOKEN}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.status === 204 || res.status === 404) {
                console.log(`[Mapbox] Tile ${z}/${x}/${y}: empty (${res.status})`);
                return null;
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            return await res.arrayBuffer();
        } catch (err) {
            console.warn(`[Mapbox] Tile ${z}/${x}/${y} attempt ${attempt + 1}/${maxRetries}: ${err.message}`);
            if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }

    console.error(`[Mapbox] Tile ${z}/${x}/${y}: all ${maxRetries} attempts failed.`);
    return null;
}
