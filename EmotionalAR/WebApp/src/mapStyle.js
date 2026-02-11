const mapStyle = {
    "version": 8,
    "name": "Untitled",
    "metadata": {
        "mapbox:autocomposite": true,
        "mapbox:thumb": "data:image/webp;base64,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",
        "mapbox:uiParadigm": "layers",
        "mapbox:sdk-support": {
            "js": "3.18.0",
            "android": "11.18.0",
            "ios": "11.18.0"
        },
        "mapbox:uiInteractiveImports": {
            "basemap": { "place-labels": { "select": "Click" } }
        },
        "mapbox:trackposition": false,
        "mapbox:groups": {}
    },
    "center": [103.68615682860445, 1.347259324432585],
    "zoom": 17.014606027712702,
    "bearing": -8.37536761422848,
    "pitch": 51.69286345223959,
    "lights": [
        {
            "id": "directional",
            "type": "directional",
            "properties": {
                "direction": [
                    "match",
                    ["config", "lightPreset"],
                    "dawn",
                    [
                        "match",
                        ["config", "theme"],
                        "monochrome",
                        ["literal", [120, 40]],
                        ["literal", [120, 50]]
                    ],
                    "day",
                    ["literal", [180, 20]],
                    "dusk",
                    [
                        "match",
                        ["config", "theme"],
                        "monochrome",
                        ["literal", [240, 30]],
                        ["literal", [240, 80]]
                    ],
                    "night",
                    ["literal", [270, 20]],
                    ["literal", [180, 20]]
                ],
                "color": [
                    "match",
                    ["config", "lightPreset"],
                    "dawn",
                    "hsl(33, 98%, 77%)",
                    "day",
                    "hsl(0, 0%, 100%)",
                    "dusk",
                    [
                        "match",
                        ["config", "theme"],
                        "monochrome",
                        "hsl(30, 0%, 50%)",
                        "hsl(30, 98%, 76%)"
                    ],
                    "night",
                    [
                        "match",
                        ["config", "theme"],
                        "monochrome",
                        "hsl(0, 0%, 0%)",
                        "hsl(225, 15%, 29%)"
                    ],
                    "hsl(0, 0%, 100%)"
                ],
                "intensity": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    12,
                    [
                        "match",
                        ["config", "lightPreset"],
                        "dawn",
                        0.5,
                        "day",
                        ["match", ["config", "theme"], "monochrome", 0.3, 0.2],
                        "dusk",
                        0,
                        "night",
                        ["match", ["config", "theme"], "monochrome", 0.01, 0],
                        0.2
                    ],
                    13,
                    [
                        "match",
                        ["config", "lightPreset"],
                        "night",
                        ["match", ["config", "theme"], "monochrome", 0.01, 0],
                        0.2
                    ],
                    14,
                    [
                        "match",
                        ["config", "lightPreset"],
                        "dawn",
                        ["match", ["config", "theme"], "monochrome", 0.35, 0.5],
                        "day",
                        0.2,
                        "dusk",
                        ["match", ["config", "theme"], "monochrome", 0.15, 0.2],
                        "night",
                        ["match", ["config", "theme"], "monochrome", 0.25, 0.5],
                        0.2
                    ]
                ],
                "cast-shadows": true,
                "shadow-intensity": [
                    "match",
                    ["config", "lightPreset"],
                    "night",
                    0.5,
                    "dusk",
                    0.85,
                    1
                ],
                "shadow-quality": 0.5
            }
        }
    ],
    "terrain": null,
    "fog": {
        "vertical-range": [30, 120],
        "range": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            ["literal", [1, 10]],
            15,
            ["literal", [1, 4]],
            22,
            ["literal", [14, 20]]
        ],
        "color": [
            "interpolate",
            ["exponential", 1.2],
            ["zoom"],
            5,
            [
                "interpolate",
                ["linear"],
                ["measure-light", "brightness"],
                0.1,
                [
                    "match",
                    ["config", "theme"],
                    "monochrome",
                    "hsla(0, 0%, 20%, 1)",
                    "hsla(240, 9%, 55%, 1)"
                ],
                0.4,
                "hsla(0, 0%, 100%, 1)"
            ],
            7,
            [
                "interpolate",
                ["linear"],
                ["measure-light", "brightness"],
                0.02,
                "hsla(213, 63%, 20%, 0.9)",
                0.03,
                "hsla(30, 65%, 60%, 0.5)",
                0.4,
                "hsla(10, 79%, 88%, 0.95)",
                0.45,
                "hsla(200, 60%, 98%, 0.9)"
            ]
        ],
        "high-color": [
            "interpolate",
            ["exponential", 1.2],
            ["zoom"],
            5,
            [
                "interpolate",
                ["linear"],
                ["measure-light", "brightness"],
                0.1,
                "hsla(215, 100%, 20%, 1)",
                0.4,
                "hsla(215, 100%, 51%, 1)"
            ],
            7,
            [
                "interpolate",
                ["linear"],
                ["measure-light", "brightness"],
                0,
                "hsla(228, 38%, 20%, 1)",
                0.05,
                "hsla(360, 100%, 85%, 1)",
                0.2,
                "hsla(205, 88%, 86%, 1)",
                0.4,
                "hsla(270, 65%, 85%, 1)",
                0.45,
                "hsla(0, 0%, 100%, 1)"
            ]
        ],
        "space-color": [
            "interpolate",
            ["exponential", 1.2],
            ["zoom"],
            5,
            [
                "match",
                ["config", "theme"],
                "monochrome",
                "hsl(0, 0%, 0%)",
                "hsl(211, 84%, 9%)"
            ],
            7,
            [
                "interpolate",
                ["linear"],
                ["measure-light", "brightness"],
                0,
                [
                    "match",
                    ["config", "theme"],
                    "monochrome",
                    "hsl(0, 0%, 0%)",
                    "hsl(211, 84%, 17%)"
                ],
                0.2,
                "hsl(210, 40%, 30%)",
                0.4,
                "hsl(270, 45%, 98%)",
                0.45,
                "hsl(210, 100%, 80%)"
            ]
        ],
        "horizon-blend": [
            "interpolate",
            ["exponential", 1.2],
            ["zoom"],
            5,
            ["match", ["config", "theme"], "monochrome", 0.001, 0.01],
            7,
            [
                "interpolate",
                ["exponential", 1.2],
                ["measure-light", "brightness"],
                0.35,
                0.03,
                0.4,
                0.1,
                0.45,
                0.03
            ]
        ],
        "star-intensity": [
            "interpolate",
            ["exponential", 1.2],
            ["zoom"],
            5,
            0.4,
            7,
            [
                "interpolate",
                ["exponential", 1.2],
                ["measure-light", "brightness"],
                0.1,
                0.2,
                0.3,
                0
            ]
        ]
    },
    "snow": {
        "color": "rgba(235, 199, 0, 0.58)",
        "center-thinning": 0.25,
        "density": 0.08,
        "opacity": 0.57,
        "vignette-color": "#ffffff",
        "intensity": 0.2,
        "flake-size": 2.34,
        "vignette": 0,
        "direction": [128, 195]
    },
    "imports": [
        {
            "id": "basemap",
            "url": "mapbox://styles/mapbox/standard",
            "config": {
                "show3dObjects": true,
                "showPlaceLabels": false,
                "theme": "default",
                "show3dFacades": false,
                "showPointOfInterestLabels": false,
                "lightPreset": "dusk",
                "showTransitLabels": false,
                "showAdminBoundaries": true,
                "colorBuildings": "hsl(40, 43%, 93%)",
                "showRoadLabels": false
            }
        }
    ],
    "sources": {},
    "sprite": "mapbox://sprites/grenadefan/cmlhkvdzf006m01qt5ku3di02/b8fjw435hx85pp7j172f016pl",
    "glyphs": "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    "projection": { "name": "globe" },
    "layers": [],
    "created": "2026-02-11T05:17:00.939Z",
    "modified": "2026-02-11T05:56:20.557Z",
    "id": "cmlhkvdzf006m01qt5ku3di02",
    "owner": "grenadefan",
    "visibility": "private",
    "protected": false,
    "draft": false
};

export default mapStyle;
