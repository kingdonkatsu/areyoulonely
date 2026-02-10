using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

// ────────────────────────────────────────────────────────────────────────────────
// Firebase SDK — only compiled when Firebase packages are imported.
// If developing without Firebase, comment out the #define below.
// ────────────────────────────────────────────────────────────────────────────────
#define FIREBASE_ENABLED

#if FIREBASE_ENABLED
using Firebase;
using Firebase.Auth;
using Firebase.Firestore;
using Firebase.Functions;
using Firebase.Extensions;
#endif

namespace EmotionalAR
{
    // ════════════════════════════════════════════════════════════════════════════
    // Data Models
    // ════════════════════════════════════════════════════════════════════════════

    [Serializable]
    public class MessageData
    {
        public string id;
        public string text;
        public string emotion;       // comfort | sadness | stress | hope | loneliness
        public float  intensity;     // 0.0 – 1.0
        public string colorHex;      // e.g. "#A78BFA"
        public double latitude;
        public double longitude;
        public int    responseCount;
        public string createdAt;     // ISO-8601
        public float  distanceMeters;

        /// <summary>Parse hex color string to Unity Color.</summary>
        public Color GetColor()
        {
            if (ColorUtility.TryParseHtmlString(colorHex, out Color c)) return c;
            return Color.gray;
        }
    }

    [Serializable]
    public class ResponseData
    {
        public string id;
        public string text;
        public string createdAt;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // FirebaseManager — Singleton MonoBehaviour
    // ════════════════════════════════════════════════════════════════════════════

    public class FirebaseManager : MonoBehaviour
    {
        // ── Singleton ──────────────────────────────────────────────────────────
        public static FirebaseManager Instance { get; private set; }

        // ── Events ─────────────────────────────────────────────────────────────
        public event Action OnFirebaseReady;
        public event Action<string> OnFirebaseError;

        // ── State ──────────────────────────────────────────────────────────────
        public bool IsReady { get; private set; }
        public string UserId { get; private set; }

#if FIREBASE_ENABLED
        private FirebaseAuth       _auth;
        private FirebaseFirestore  _db;
        private FirebaseFunctions  _functions;
#endif

        // ────────────────────────────────────────────────────────────────────────
        // Lifecycle
        // ────────────────────────────────────────────────────────────────────────

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Start()
        {
            InitializeFirebase();
        }

        // ────────────────────────────────────────────────────────────────────────
        // Initialization
        // ────────────────────────────────────────────────────────────────────────

        private async void InitializeFirebase()
        {
#if FIREBASE_ENABLED
            try
            {
                var dependencyStatus = await FirebaseApp.CheckAndFixDependenciesAsync();

                if (dependencyStatus != DependencyStatus.Available)
                {
                    Debug.LogError($"[FirebaseManager] Dependencies unavailable: {dependencyStatus}");
                    OnFirebaseError?.Invoke($"Firebase dependencies: {dependencyStatus}");
                    return;
                }

                _auth      = FirebaseAuth.DefaultInstance;
                _db        = FirebaseFirestore.DefaultInstance;
                _functions = FirebaseFunctions.DefaultInstance;

                // Anonymous sign-in
                var authResult = await _auth.SignInAnonymouslyAsync();
                UserId = authResult.User.UserId;

                IsReady = true;
                Debug.Log($"[FirebaseManager] Ready. Anonymous UID: {UserId}");
                OnFirebaseReady?.Invoke();
            }
            catch (Exception e)
            {
                Debug.LogError($"[FirebaseManager] Init failed: {e.Message}");
                OnFirebaseError?.Invoke(e.Message);
            }
#else
            // Stub for development without Firebase
            UserId = "dev-user-" + UnityEngine.Random.Range(1000, 9999);
            IsReady = true;
            Debug.Log("[FirebaseManager] Running in stub mode (no Firebase SDK).");
            OnFirebaseReady?.Invoke();
            await Task.CompletedTask;
#endif
        }

        // ────────────────────────────────────────────────────────────────────────
        // Fetch Nearby Messages
        // ────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Calls the fetchNearbyMessages Cloud Function.
        /// Returns messages within <paramref name="radiusMeters"/> of the given position.
        /// </summary>
        public async Task<List<MessageData>> FetchNearbyMessages(
            double latitude, double longitude, float radiusMeters = 20f)
        {
            var messages = new List<MessageData>();

#if FIREBASE_ENABLED
            if (!IsReady) { Debug.LogWarning("[FirebaseManager] Not ready."); return messages; }

            try
            {
                var callable = _functions.GetHttpsCallable("fetchNearbyMessages");
                var data = new Dictionary<string, object>
                {
                    { "latitude",     latitude },
                    { "longitude",    longitude },
                    { "radiusMeters", radiusMeters }
                };

                var result = await callable.CallAsync(data);
                var resultDict = result.Data as Dictionary<string, object>;

                if (resultDict != null && resultDict.ContainsKey("messages"))
                {
                    var msgList = resultDict["messages"] as List<object>;
                    if (msgList != null)
                    {
                        foreach (var item in msgList)
                        {
                            var dict = item as Dictionary<string, object>;
                            if (dict == null) continue;

                            messages.Add(new MessageData
                            {
                                id             = dict.GetValueOrDefault("id", "").ToString(),
                                text           = dict.GetValueOrDefault("text", "").ToString(),
                                emotion        = dict.GetValueOrDefault("emotion", "loneliness").ToString(),
                                intensity      = Convert.ToSingle(dict.GetValueOrDefault("intensity", 0.5f)),
                                colorHex       = dict.GetValueOrDefault("colorHex", "#9CA3AF").ToString(),
                                latitude       = Convert.ToDouble(dict.GetValueOrDefault("latitude", 0.0)),
                                longitude      = Convert.ToDouble(dict.GetValueOrDefault("longitude", 0.0)),
                                responseCount  = Convert.ToInt32(dict.GetValueOrDefault("responseCount", 0)),
                                createdAt      = dict.GetValueOrDefault("createdAt", "").ToString(),
                                distanceMeters = Convert.ToSingle(dict.GetValueOrDefault("distanceMeters", 0f)),
                            });
                        }
                    }
                }

                Debug.Log($"[FirebaseManager] Fetched {messages.Count} nearby messages.");
            }
            catch (Exception e)
            {
                Debug.LogError($"[FirebaseManager] FetchNearbyMessages error: {e.Message}");
            }
#else
            // Stub: return sample messages for development
            messages.Add(new MessageData
            {
                id = "stub-1", text = "Feeling overwhelmed today",
                emotion = "stress", intensity = 0.7f, colorHex = "#A78BFA",
                latitude = latitude + 0.00005, longitude = longitude + 0.00003,
                responseCount = 3, createdAt = DateTime.UtcNow.ToString("o"), distanceMeters = 5f
            });
            messages.Add(new MessageData
            {
                id = "stub-2", text = "Grateful for small moments",
                emotion = "hope", intensity = 0.9f, colorHex = "#FFD93D",
                latitude = latitude - 0.00008, longitude = longitude + 0.00006,
                responseCount = 1, createdAt = DateTime.UtcNow.ToString("o"), distanceMeters = 12f
            });
            messages.Add(new MessageData
            {
                id = "stub-3", text = "Missing home",
                emotion = "sadness", intensity = 0.5f, colorHex = "#6B9BD1",
                latitude = latitude + 0.00002, longitude = longitude - 0.00009,
                responseCount = 0, createdAt = DateTime.UtcNow.ToString("o"), distanceMeters = 8f
            });
            await Task.CompletedTask;
#endif

            return messages;
        }

        // ────────────────────────────────────────────────────────────────────────
        // Post Message
        // ────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Creates a new anonymous emotional message at the given GPS position.
        /// Moderation happens server-side via Cloud Function trigger.
        /// </summary>
        public async Task<bool> PostMessage(string text, double latitude, double longitude)
        {
            if (string.IsNullOrWhiteSpace(text) || text.Length > 280)
            {
                Debug.LogWarning("[FirebaseManager] Invalid message text.");
                return false;
            }

#if FIREBASE_ENABLED
            if (!IsReady) return false;

            try
            {
                // Round GPS to ~10m precision (4 decimal places)
                latitude  = Math.Round(latitude,  4);
                longitude = Math.Round(longitude, 4);

                var docData = new Dictionary<string, object>
                {
                    { "text",      text },
                    { "latitude",  latitude },
                    { "longitude", longitude },
                    { "createdAt", FieldValue.ServerTimestamp }
                };

                await _db.Collection("messages").AddAsync(docData);
                Debug.Log("[FirebaseManager] Message posted successfully.");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[FirebaseManager] PostMessage error: {e.Message}");
                return false;
            }
#else
            Debug.Log($"[FirebaseManager] [STUB] PostMessage: \"{text}\" at ({latitude}, {longitude})");
            await Task.CompletedTask;
            return true;
#endif
        }

        // ────────────────────────────────────────────────────────────────────────
        // Post Response
        // ────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Adds a supportive response to a message.
        /// </summary>
        public async Task<bool> PostResponse(string messageId, string text)
        {
            if (string.IsNullOrWhiteSpace(text) || text.Length > 280)
            {
                Debug.LogWarning("[FirebaseManager] Invalid response text.");
                return false;
            }

#if FIREBASE_ENABLED
            if (!IsReady) return false;

            try
            {
                var docData = new Dictionary<string, object>
                {
                    { "text",      text },
                    { "createdAt", FieldValue.ServerTimestamp }
                };

                await _db.Collection("messages").Document(messageId)
                         .Collection("responses").AddAsync(docData);

                Debug.Log($"[FirebaseManager] Response posted to {messageId}.");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[FirebaseManager] PostResponse error: {e.Message}");
                return false;
            }
#else
            Debug.Log($"[FirebaseManager] [STUB] PostResponse to {messageId}: \"{text}\"");
            await Task.CompletedTask;
            return true;
#endif
        }

        // ────────────────────────────────────────────────────────────────────────
        // Fetch Responses
        // ────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Fetches all responses for a given message, ordered by creation time.
        /// </summary>
        public async Task<List<ResponseData>> FetchResponses(string messageId)
        {
            var responses = new List<ResponseData>();

#if FIREBASE_ENABLED
            if (!IsReady) return responses;

            try
            {
                var snapshot = await _db.Collection("messages").Document(messageId)
                                       .Collection("responses")
                                       .OrderBy("createdAt")
                                       .GetSnapshotAsync();

                foreach (var doc in snapshot.Documents)
                {
                    responses.Add(new ResponseData
                    {
                        id        = doc.Id,
                        text      = doc.GetValue<string>("text"),
                        createdAt = doc.GetValue<Firebase.Firestore.Timestamp>("createdAt")
                                       .ToDateTime().ToString("o")
                    });
                }

                Debug.Log($"[FirebaseManager] Fetched {responses.Count} responses for {messageId}.");
            }
            catch (Exception e)
            {
                Debug.LogError($"[FirebaseManager] FetchResponses error: {e.Message}");
            }
#else
            responses.Add(new ResponseData { id = "r1", text = "You're not alone", createdAt = DateTime.UtcNow.ToString("o") });
            responses.Add(new ResponseData { id = "r2", text = "Sending warmth", createdAt = DateTime.UtcNow.ToString("o") });
            await Task.CompletedTask;
#endif

            return responses;
        }

        // ────────────────────────────────────────────────────────────────────────
        // Presence
        // ────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Updates presence for the current user on a given message node.
        /// Should be called every ~15 seconds while viewing a message.
        /// </summary>
        public async Task UpdatePresence(string messageId)
        {
#if FIREBASE_ENABLED
            if (!IsReady) return;

            try
            {
                var callable = _functions.GetHttpsCallable("updatePresence");
                await callable.CallAsync(new Dictionary<string, object>
                {
                    { "messageId", messageId }
                });
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[FirebaseManager] UpdatePresence error: {e.Message}");
            }
#else
            Debug.Log($"[FirebaseManager] [STUB] UpdatePresence for {messageId}");
            await Task.CompletedTask;
#endif
        }

        /// <summary>
        /// Fetches the current viewer count for a message.
        /// </summary>
        public async Task<int> GetPresenceCount(string messageId)
        {
#if FIREBASE_ENABLED
            if (!IsReady) return 0;

            try
            {
                var snapshot = await _db.Collection("presence").Document(messageId)
                                       .Collection("viewers").GetSnapshotAsync();
                return snapshot.Count;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[FirebaseManager] GetPresenceCount error: {e.Message}");
                return 0;
            }
#else
            await Task.CompletedTask;
            return UnityEngine.Random.Range(0, 6);
#endif
        }
    }
}
