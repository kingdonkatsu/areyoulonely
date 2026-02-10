/**
 * EmotionalAR — Firebase Cloud Functions
 *
 * Six functions:
 *   1. moderateMessage       (Firestore onCreate) — AI emotion classification + toxicity
 *   2. moderateResponse      (Firestore onCreate) — toxicity check, increment responseCount
 *   3. fetchNearbyMessages   (HTTPS callable)     — geohash radius query
 *   4. cleanupExpiredMessages(scheduled daily)     — delete expired messages
 *   5. updatePresence        (HTTPS callable)      — update user lastSeen
 *   6. cleanupPresence       (scheduled every min) — delete stale presence records
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { geohashForLocation, geohashQueryBounds, distanceBetween } = require("geofire-common");
const { OpenAI } = require("openai");

admin.initializeApp();
const db = admin.firestore();

// ── OpenAI client (key set via firebase functions:config:set openai.key="...") ──
const openai = new OpenAI({
  apiKey: functions.config().openai?.key || process.env.OPENAI_API_KEY || "",
});

// ── Emotion ↔ Color mapping ────────────────────────────────────────────────────
const EMOTION_COLORS = {
  comfort:    "#FF9F66",
  hope:       "#FFD93D",
  sadness:    "#6B9BD1",
  stress:     "#A78BFA",
  loneliness: "#9CA3AF",
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. moderateMessage — Firestore onCreate trigger
// ═══════════════════════════════════════════════════════════════════════════════
exports.moderateMessage = functions.firestore
  .document("messages/{messageId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const messageText = data.text;

    try {
      // ── Call OpenAI for emotion analysis + toxicity check ──
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `Analyze this emotional message. Return JSON:
{
  "emotion": "comfort|sadness|stress|hope|loneliness",
  "intensity": 0.0-1.0,
  "colorHex": "#HEX",
  "isToxic": boolean,
  "supportiveVersion": "rewritten text or null"
}

Color mapping:
- comfort → #FF9F66
- hope    → #FFD93D
- sadness → #6B9BD1
- stress  → #A78BFA
- loneliness → #9CA3AF

Block: hate, harassment, self-harm, spam, PII
Rewrite: overly negative → constructive reflection
Allow: authentic vulnerability, sadness, stress`,
          },
          { role: "user", content: messageText },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const result = JSON.parse(completion.choices[0].message.content);

      // ── Block toxic content ──
      if (result.isToxic) {
        await snap.ref.delete();
        functions.logger.warn(`Toxic message deleted: ${context.params.messageId}`);
        return null;
      }

      // ── Generate geohash for location queries ──
      const geohash = geohashForLocation([data.latitude, data.longitude]);

      // ── Update message with AI metadata ──
      await snap.ref.update({
        emotion: result.emotion || "loneliness",
        intensity: Math.max(0, Math.min(1, result.intensity || 0.5)),
        colorHex: result.colorHex || EMOTION_COLORS[result.emotion] || "#9CA3AF",
        rewrittenText: result.supportiveVersion || null,
        geohash: geohash,
        responseCount: 0,
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7-day TTL
        ),
      });

      functions.logger.info(`Message moderated: ${context.params.messageId}, emotion: ${result.emotion}`);
    } catch (error) {
      functions.logger.error("Moderation error:", error);
      // On error, set safe defaults rather than leaving unmoderated
      const geohash = geohashForLocation([data.latitude, data.longitude]);
      await snap.ref.update({
        emotion: "loneliness",
        intensity: 0.5,
        colorHex: "#9CA3AF",
        geohash: geohash,
        responseCount: 0,
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        ),
      });
    }

    return null;
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 2. moderateResponse — Firestore onCreate trigger
// ═══════════════════════════════════════════════════════════════════════════════
exports.moderateResponse = functions.firestore
  .document("messages/{messageId}/responses/{responseId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const responseText = data.text;

    try {
      // ── Quick toxicity check via OpenAI ──
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `Check if this supportive response is toxic, harmful, or contains PII.
Return JSON: { "isToxic": boolean }
Block: hate, harassment, self-harm, spam, PII.
Allow: supportive, kind, empathetic messages.`,
          },
          { role: "user", content: responseText },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const result = JSON.parse(completion.choices[0].message.content);

      if (result.isToxic) {
        await snap.ref.delete();
        functions.logger.warn(`Toxic response deleted: ${context.params.responseId}`);
        return null;
      }

      // ── Increment parent message's responseCount ──
      const messageRef = db.collection("messages").doc(context.params.messageId);
      await messageRef.update({
        responseCount: admin.firestore.FieldValue.increment(1),
      });

      functions.logger.info(
        `Response moderated for message ${context.params.messageId}`
      );
    } catch (error) {
      functions.logger.error("Response moderation error:", error);
      // On error, still increment count (message already created)
      const messageRef = db.collection("messages").doc(context.params.messageId);
      await messageRef.update({
        responseCount: admin.firestore.FieldValue.increment(1),
      });
    }

    return null;
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 3. fetchNearbyMessages — HTTPS callable
// ═══════════════════════════════════════════════════════════════════════════════
exports.fetchNearbyMessages = functions.https.onCall(async (data, context) => {
  // ── Auth check ──
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { latitude, longitude, radiusMeters = 20 } = data;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "latitude and longitude are required numbers.");
  }

  const center = [latitude, longitude];
  const bounds = geohashQueryBounds(center, radiusMeters);
  const now = admin.firestore.Timestamp.now();

  // ── Query by geohash bounds ──
  const promises = bounds.map((bound) => {
    return db
      .collection("messages")
      .orderBy("geohash")
      .startAt(bound[0])
      .endAt(bound[1])
      .where("expiresAt", ">", now)
      .get();
  });

  const snapshots = await Promise.all(promises);

  // ── Filter by actual distance and deduplicate ──
  const seen = new Set();
  const messages = [];

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);

      const msgData = doc.data();
      const msgCenter = [msgData.latitude, msgData.longitude];
      const distanceKm = distanceBetween(msgCenter, center);
      const distanceM = distanceKm * 1000;

      if (distanceM <= radiusMeters) {
        messages.push({
          id: doc.id,
          text: msgData.rewrittenText || msgData.text,
          emotion: msgData.emotion,
          intensity: msgData.intensity,
          colorHex: msgData.colorHex,
          latitude: msgData.latitude,
          longitude: msgData.longitude,
          createdAt: msgData.createdAt?.toDate().toISOString() || null,
          responseCount: msgData.responseCount || 0,
          distanceMeters: Math.round(distanceM * 10) / 10,
        });
      }
    }
  }

  // ── Sort by distance ──
  messages.sort((a, b) => a.distanceMeters - b.distanceMeters);

  return { messages };
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. cleanupExpiredMessages — Scheduled daily at 3:00 AM UTC
// ═══════════════════════════════════════════════════════════════════════════════
exports.cleanupExpiredMessages = functions.pubsub
  .schedule("every day 03:00")
  .timeZone("UTC")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const expiredQuery = db
      .collection("messages")
      .where("expiresAt", "<", now)
      .limit(500); // batch limit

    const snapshot = await expiredQuery.get();

    if (snapshot.empty) {
      functions.logger.info("No expired messages to clean up.");
      return null;
    }

    const batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
      // Delete all sub-collection responses first
      const responses = await doc.ref.collection("responses").get();
      for (const resp of responses.docs) {
        batch.delete(resp.ref);
      }
      batch.delete(doc.ref);
      count++;
    }

    await batch.commit();
    functions.logger.info(`Cleaned up ${count} expired messages.`);
    return null;
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 5. updatePresence — HTTPS callable
// ═══════════════════════════════════════════════════════════════════════════════
exports.updatePresence = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { messageId } = data;

  if (!messageId || typeof messageId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "messageId is required.");
  }

  const userId = context.auth.uid;
  const now = admin.firestore.Timestamp.now();
  const ttl = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 1000)); // 30s TTL

  await db
    .collection("presence")
    .doc(messageId)
    .collection("viewers")
    .doc(userId)
    .set({
      lastSeen: now,
      ttl: ttl,
    });

  return { success: true };
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. cleanupPresence — Scheduled every minute
// ═══════════════════════════════════════════════════════════════════════════════
exports.cleanupPresence = functions.pubsub
  .schedule("every 1 minutes")
  .timeZone("UTC")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    // Query all presence collections for stale records
    const presenceRef = db.collectionGroup("viewers");
    const staleQuery = presenceRef.where("ttl", "<", now).limit(200);

    const snapshot = await staleQuery.get();

    if (snapshot.empty) {
      return null;
    }

    const batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
    }

    await batch.commit();
    functions.logger.info(`Cleaned up ${count} stale presence records.`);
    return null;
  });
