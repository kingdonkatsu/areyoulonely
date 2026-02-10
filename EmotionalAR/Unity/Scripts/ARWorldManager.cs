using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace EmotionalAR
{
    /// <summary>
    /// Manages the AR session, world environment, GPS tracking,
    /// and spawning/despawning of emotion nodes.
    /// </summary>
    public class ARWorldManager : MonoBehaviour
    {
        // ── Inspector References ───────────────────────────────────────────────
        [Header("AR")]
        [SerializeField] private ARSession          arSession;
        [SerializeField] private ARSessionOrigin    arSessionOrigin;
        [SerializeField] private ARPlaneManager     arPlaneManager;
        [SerializeField] private Camera             arCamera;

        [Header("Prefabs")]
        [SerializeField] private GameObject          emotionNodePrefab;
        [SerializeField] private GameObject          platformPrefab;

        [Header("Post-Processing")]
        [SerializeField] private Volume              postProcessingVolume;

        [Header("World Settings")]
        [SerializeField] private float worldRadius   = 10f;   // 20m diameter → 10m radius
        [SerializeField] private float fetchRadius   = 20f;   // metres
        [SerializeField] private float moveThreshold = 5f;    // re-fetch when moved >5m
        [SerializeField] private float fogStart      = 8f;
        [SerializeField] private float fogEnd        = 20f;

        // ── State ──────────────────────────────────────────────────────────────
        private readonly Dictionary<string, EmotionNodeController> _activeNodes = new();
        private GameObject _platformInstance;
        private Vector3    _worldOrigin;

        private double _lastLat;
        private double _lastLng;
        private bool   _locationReady;
        private bool   _worldSpawned;
        private float  _lastFetchTime;

        // ── Constants ──────────────────────────────────────────────────────────
        private const float FETCH_COOLDOWN = 10f; // seconds between fetches
        private const float EARTH_RADIUS   = 6371000f;

        // ── Events ─────────────────────────────────────────────────────────────
        public event Action<List<MessageData>> OnMessagesUpdated;
        public event Action                     OnWorldReady;

        // ════════════════════════════════════════════════════════════════════════
        // Lifecycle
        // ════════════════════════════════════════════════════════════════════════

        private IEnumerator Start()
        {
            // Wait for Firebase
            while (!FirebaseManager.Instance.IsReady)
                yield return new WaitForSeconds(0.2f);

            // Start GPS
            yield return StartCoroutine(InitializeLocation());

            // Configure rendering
            ConfigureRendering();

            // Launch animation
            yield return StartCoroutine(LaunchSequence());
        }

        private void Update()
        {
            if (!_locationReady || !_worldSpawned) return;

            UpdateLocation();
        }

        // ════════════════════════════════════════════════════════════════════════
        // GPS / Location
        // ════════════════════════════════════════════════════════════════════════

        private IEnumerator InitializeLocation()
        {
            // Check permission
            if (!Input.location.isEnabledByUser)
            {
                Debug.LogError("[ARWorldManager] Location services disabled by user.");
                yield break;
            }

            Input.location.Start(1f, 1f); // 1m accuracy, 1m update distance

            int timeout = 20;
            while (Input.location.status == LocationServiceStatus.Initializing && timeout > 0)
            {
                yield return new WaitForSeconds(1f);
                timeout--;
            }

            if (Input.location.status != LocationServiceStatus.Running)
            {
                Debug.LogError($"[ARWorldManager] Location failed: {Input.location.status}");
                yield break;
            }

            _lastLat = Input.location.lastData.latitude;
            _lastLng = Input.location.lastData.longitude;
            _locationReady = true;

            Debug.Log($"[ARWorldManager] GPS ready: ({_lastLat:F6}, {_lastLng:F6})");
        }

        private void UpdateLocation()
        {
            if (Input.location.status != LocationServiceStatus.Running) return;

            double lat = Input.location.lastData.latitude;
            double lng = Input.location.lastData.longitude;

            float dist = CalculateDistanceMeters(_lastLat, _lastLng, lat, lng);

            if (dist >= moveThreshold && Time.time - _lastFetchTime > FETCH_COOLDOWN)
            {
                _lastLat = lat;
                _lastLng = lng;
                FetchAndSpawnMessages();
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // World Setup
        // ════════════════════════════════════════════════════════════════════════

        private void ConfigureRendering()
        {
            // Camera settings
            if (arCamera != null)
            {
                arCamera.fieldOfView = 60f;
                arCamera.nearClipPlane = 0.1f;
                arCamera.farClipPlane = 30f;
            }

            // Post-processing: Soft bloom
            if (postProcessingVolume != null &&
                postProcessingVolume.profile.TryGet(out Bloom bloom))
            {
                bloom.threshold.value = 1.0f;
                bloom.intensity.value = 0.3f;
            }

            // Ambient light
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.96f, 0.96f, 0.96f); // #F5F5F5
            RenderSettings.ambientIntensity = 0.7f;

            // Fog
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = HexToColor("#C5D8E8");
            RenderSettings.fogDensity = 0.08f;
        }

        private IEnumerator LaunchSequence()
        {
            // Phase 1: Soft glowing pulse (1s)
            Debug.Log("[ARWorldManager] Launch: Glowing pulse...");
            yield return new WaitForSeconds(1f);

            // Phase 2: Expanding mist (1s)
            Debug.Log("[ARWorldManager] Launch: Expanding mist...");
            yield return new WaitForSeconds(1f);

            // Phase 3: Spawn platform
            SpawnPlatform();

            // Phase 4: Fetch and spawn nodes
            yield return StartCoroutine(FetchAndSpawnMessagesCoroutine());

            _worldSpawned = true;
            OnWorldReady?.Invoke();
            Debug.Log("[ARWorldManager] World ready.");
        }

        private void SpawnPlatform()
        {
            _worldOrigin = arCamera != null ? arCamera.transform.position : Vector3.zero;
            _worldOrigin.y -= 0.5f; // Slightly below camera

            if (platformPrefab != null)
            {
                _platformInstance = Instantiate(platformPrefab, _worldOrigin, Quaternion.identity);
                _platformInstance.transform.localScale = new Vector3(
                    worldRadius * 2f, 1f, worldRadius * 2f);
            }
            else
            {
                // Procedural platform fallback
                _platformInstance = CreateProceduralPlatform();
            }
        }

        private GameObject CreateProceduralPlatform()
        {
            var go = new GameObject("EmotionalAR_Platform");
            go.transform.position = _worldOrigin;

            var meshFilter   = go.AddComponent<MeshFilter>();
            var meshRenderer = go.AddComponent<MeshRenderer>();

            // Generate circular mesh with Perlin noise displacement
            meshFilter.mesh = GenerateCircularMesh(worldRadius, 64);

            // Apply platform shader/material
            var mat = new Material(Shader.Find("EmotionalAR/PlatformGradient"));
            if (mat.shader == null || mat.shader.name == "Hidden/InternalErrorShader")
            {
                mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                mat.color = HexToColor("#E5E7EB");
                mat.SetFloat("_Surface", 1); // Transparent
            }
            meshRenderer.material = mat;

            return go;
        }

        private Mesh GenerateCircularMesh(float radius, int segments)
        {
            var mesh = new Mesh();
            int vertCount = segments + 1;
            var vertices  = new Vector3[vertCount];
            var uv        = new Vector2[vertCount];
            var triangles = new int[segments * 3];

            // Center vertex
            vertices[0] = Vector3.zero;
            uv[0] = new Vector2(0.5f, 0.5f);

            for (int i = 0; i < segments; i++)
            {
                float angle = (float)i / segments * Mathf.PI * 2f;
                float x = Mathf.Cos(angle) * radius;
                float z = Mathf.Sin(angle) * radius;

                // Perlin noise displacement (±0.05m)
                float noise = Mathf.PerlinNoise(x * 0.5f + 100f, z * 0.5f + 100f);
                float y = (noise - 0.5f) * 0.1f;

                vertices[i + 1] = new Vector3(x, y, z);
                uv[i + 1] = new Vector2(
                    (Mathf.Cos(angle) + 1f) * 0.5f,
                    (Mathf.Sin(angle) + 1f) * 0.5f);

                int next = (i + 1) % segments + 1;
                triangles[i * 3]     = 0;
                triangles[i * 3 + 1] = i + 1;
                triangles[i * 3 + 2] = next;
            }

            mesh.vertices  = vertices;
            mesh.uv        = uv;
            mesh.triangles = triangles;
            mesh.RecalculateNormals();
            return mesh;
        }

        // ════════════════════════════════════════════════════════════════════════
        // Message Fetching & Node Spawning
        // ════════════════════════════════════════════════════════════════════════

        public async void FetchAndSpawnMessages()
        {
            if (Time.time - _lastFetchTime < FETCH_COOLDOWN) return;
            _lastFetchTime = Time.time;

            var messages = await FirebaseManager.Instance.FetchNearbyMessages(
                _lastLat, _lastLng, fetchRadius);

            ProcessMessages(messages);
        }

        private IEnumerator FetchAndSpawnMessagesCoroutine()
        {
            var task = FirebaseManager.Instance.FetchNearbyMessages(
                _lastLat, _lastLng, fetchRadius);

            while (!task.IsCompleted)
                yield return null;

            if (task.Exception != null)
            {
                Debug.LogError($"[ARWorldManager] Fetch error: {task.Exception.Message}");
                yield break;
            }

            ProcessMessages(task.Result);
        }

        private void ProcessMessages(List<MessageData> messages)
        {
            if (messages == null) return;

            // Track which message IDs are still present
            var currentIds = new HashSet<string>();

            foreach (var msg in messages)
            {
                currentIds.Add(msg.id);

                if (_activeNodes.ContainsKey(msg.id))
                {
                    // Update existing node
                    _activeNodes[msg.id].UpdateData(msg);
                }
                else
                {
                    // Spawn new node
                    SpawnNode(msg);
                }
            }

            // Remove nodes that are no longer nearby
            var toRemove = new List<string>();
            foreach (var kvp in _activeNodes)
            {
                if (!currentIds.Contains(kvp.Key))
                    toRemove.Add(kvp.Key);
            }
            foreach (var id in toRemove)
            {
                if (_activeNodes.TryGetValue(id, out var node))
                {
                    node.FadeOutAndDestroy();
                    _activeNodes.Remove(id);
                }
            }

            OnMessagesUpdated?.Invoke(messages);
        }

        private void SpawnNode(MessageData msg)
        {
            Vector3 localPos = GPSToLocalPosition(msg.latitude, msg.longitude);

            // Random Y offset: 0.5–2m above platform
            localPos.y = _worldOrigin.y + UnityEngine.Random.Range(0.5f, 2f);

            GameObject nodeObj;
            if (emotionNodePrefab != null)
            {
                nodeObj = Instantiate(emotionNodePrefab, localPos, Quaternion.identity);
            }
            else
            {
                // Procedural fallback: icosphere approximation
                nodeObj = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                nodeObj.transform.position = localPos;
                nodeObj.transform.localScale = Vector3.one * 0.3f;

                var renderer = nodeObj.GetComponent<Renderer>();
                var mat = new Material(Shader.Find("EmotionalAR/NodeGlow"));
                if (mat.shader.name == "Hidden/InternalErrorShader")
                    mat = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
                renderer.material = mat;
            }

            nodeObj.name = $"EmotionNode_{msg.id}";

            // Squash Y for organic feel
            var scale = nodeObj.transform.localScale;
            scale.y *= 0.9f;
            nodeObj.transform.localScale = scale;

            var controller = nodeObj.GetComponent<EmotionNodeController>();
            if (controller == null)
                controller = nodeObj.AddComponent<EmotionNodeController>();

            controller.Initialize(msg);
            _activeNodes[msg.id] = controller;
        }

        // ════════════════════════════════════════════════════════════════════════
        // GPS ↔ World Coordinate Conversion
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Converts a GPS position to a local XZ position relative to the user.
        /// x = (msgLng - userLng) × 111320 × cos(userLat)
        /// z = (msgLat - userLat) × 110574
        /// </summary>
        public Vector3 GPSToLocalPosition(double latitude, double longitude)
        {
            float x = (float)((longitude - _lastLng) * 111320.0 * Math.Cos(_lastLat * Math.PI / 180.0));
            float z = (float)((latitude  - _lastLat) * 110574.0);

            return new Vector3(x, 0f, z) + _worldOrigin;
        }

        /// <summary>
        /// Calculates distance in meters between two GPS coordinates.
        /// Uses Haversine formula.
        /// </summary>
        public static float CalculateDistanceMeters(
            double lat1, double lng1, double lat2, double lng2)
        {
            double dLat = (lat2 - lat1) * Math.PI / 180.0;
            double dLng = (lng2 - lng1) * Math.PI / 180.0;

            double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                       Math.Cos(lat1 * Math.PI / 180.0) *
                       Math.Cos(lat2 * Math.PI / 180.0) *
                       Math.Sin(dLng / 2) * Math.Sin(dLng / 2);

            double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));

            return (float)(EARTH_RADIUS * c);
        }

        // ════════════════════════════════════════════════════════════════════════
        // Utility
        // ════════════════════════════════════════════════════════════════════════

        public static Color HexToColor(string hex)
        {
            if (ColorUtility.TryParseHtmlString(hex, out Color c)) return c;
            return Color.white;
        }

        /// <summary>Returns the currently tracked user GPS position.</summary>
        public (double lat, double lng) GetUserPosition() => (_lastLat, _lastLng);

        /// <summary>Gets an active node controller by message ID.</summary>
        public EmotionNodeController GetNode(string messageId)
        {
            _activeNodes.TryGetValue(messageId, out var node);
            return node;
        }

        private void OnDestroy()
        {
            if (Input.location.status == LocationServiceStatus.Running)
                Input.location.Stop();
        }
    }
}
