// Firebase client (stub-first). Fill FIREBASE_CONFIG to go live.

const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

const USE_STUBS = !FIREBASE_CONFIG.apiKey;

let _db;
let _auth;
let _functions;
let _userId;
let _ready = false;
let _localMessages = [];
const STORAGE_KEY = 'emotional_ar_local_messages';

const EMOTION_COLORS = {
  comfort: '#6EE7B7',
  hope: '#FFD93D',
  sadness: '#6B9BD1',
  stress: '#A78BFA',
  loneliness: '#F9A8D4',
};

const EMOTIONS = Object.keys(EMOTION_COLORS);

export async function initFirebase() {
  if (USE_STUBS) {
    _userId = 'dev-user-' + Math.floor(Math.random() * 9000 + 1000);

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        _localMessages = JSON.parse(saved);
        console.log(`[Firebase] Loaded ${_localMessages.length} local messages.`);
      } catch {
        _localMessages = [];
      }
    }

    _ready = true;
    console.log('[Firebase] Running in STUB mode — no real backend.');
    return;
  }

  const { initializeApp } = await import('firebase/app');
  const { getAuth, signInAnonymously } = await import('firebase/auth');
  const { getFirestore } = await import('firebase/firestore');
  const { getFunctions } = await import('firebase/functions');

  const app = initializeApp(FIREBASE_CONFIG);
  _auth = getAuth(app);
  _db = getFirestore(app);
  _functions = getFunctions(app);

  const result = await signInAnonymously(_auth);
  _userId = result.user.uid;
  _ready = true;
  console.log(`[Firebase] Ready. UID: ${_userId}`);
}

export function isReady() {
  return _ready;
}

export function getUserId() {
  return _userId;
}

export async function fetchNearbyMessages(lat, lng, radiusMeters = 20) {
  if (USE_STUBS) {
    const demo = generateStubMessages(lat, lng);
    return [..._localMessages, ...demo];
  }

  const { httpsCallable } = await import('firebase/functions');
  const fn = httpsCallable(_functions, 'fetchNearbyMessages');
  const result = await fn({ latitude: lat, longitude: lng, radiusMeters });
  return result.data.messages || [];
}

export async function postMessage(text, lat, lng) {
  if (USE_STUBS) {
    const id = 'local-' + Date.now();
    const emotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
    const msg = {
      id,
      text,
      emotion,
      intensity: 0.8,
      colorHex: EMOTION_COLORS[emotion],
      latitude: lat,
      longitude: lng,
      responseCount: 0,
      responses: [],
      createdAt: new Date().toISOString(),
      isLocal: true,
    };

    _localMessages.push(msg);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_localMessages));
    return true;
  }

  const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
  await addDoc(collection(_db, 'messages'), {
    text,
    latitude: Math.round(lat * 10000) / 10000,
    longitude: Math.round(lng * 10000) / 10000,
    createdAt: serverTimestamp(),
  });
  return true;
}

export async function postResponse(messageId, text) {
  if (USE_STUBS) {
    const msg = _localMessages.find((m) => m.id === messageId);
    if (msg) {
      msg.responses = msg.responses || [];
      msg.responses.push({ id: 'r-' + Date.now(), text });
      msg.responseCount = msg.responses.length;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_localMessages));
    }
    return true;
  }

  const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
  await addDoc(collection(_db, 'messages', messageId, 'responses'), {
    text,
    createdAt: serverTimestamp(),
  });
  return true;
}

export async function fetchResponses(messageId) {
  if (USE_STUBS) {
    const msg = _localMessages.find((m) => m.id === messageId);
    if (msg && msg.responses) return msg.responses;
    return generateStubResponses();
  }

  const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
  const q = query(
    collection(_db, 'messages', messageId, 'responses'),
    orderBy('createdAt'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, text: d.data().text }));
}

export async function updatePresence(messageId) {
  if (USE_STUBS) return;
  const { httpsCallable } = await import('firebase/functions');
  const fn = httpsCallable(_functions, 'updatePresence');
  await fn({ messageId });
}

export async function getPresenceCount(messageId) {
  if (USE_STUBS) return Math.floor(Math.random() * 6);
  const { collection, getDocs } = await import('firebase/firestore');
  const snap = await getDocs(collection(_db, 'presence', messageId, 'viewers'));
  return snap.size;
}

function generateStubMessages(lat, lng) {
  const phrases = [
    { text: 'Feeling overwhelmed today but trying to stay positive', emotion: 'stress' },
    { text: 'Grateful for the small moments of kindness', emotion: 'hope' },
    { text: 'Missing home and the people I love', emotion: 'sadness' },
    { text: "Found unexpected comfort in a stranger's smile", emotion: 'comfort' },
    { text: 'Sometimes the silence feels heavier than words', emotion: 'loneliness' },
    { text: 'Today I chose to be brave even when it was hard', emotion: 'hope' },
    { text: 'The weight of expectations never seems to lighten', emotion: 'stress' },
    { text: 'A warm cup of tea can heal more than you think', emotion: 'comfort' },
  ];

  return phrases.map((p, i) => {
    const angle = (i / phrases.length) * Math.PI * 2;
    const dist = 3 + Math.random() * 12;
    return {
      id: `stub-${i}`,
      text: p.text,
      emotion: p.emotion,
      intensity: 0.3 + Math.random() * 0.7,
      colorHex: EMOTION_COLORS[p.emotion],
      latitude: lat + Math.cos(angle) * dist / 110574,
      longitude: lng + Math.sin(angle) * dist / (111320 * Math.cos(lat * Math.PI / 180)),
      responseCount: Math.floor(Math.random() * 8),
      createdAt: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
      distanceMeters: dist,
    };
  });
}

function generateStubResponses() {
  return [
    { id: 'r1', text: "You're not alone in this" },
    { id: 'r2', text: 'Sending warmth your way' },
    { id: 'r3', text: 'Stay strong, it gets better' },
  ];
}

