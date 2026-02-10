# EmotionalAR 🌐✨

**Anonymous emotional expression through augmented reality.**

A mobile AR app that visualizes anonymous emotional messages as glowing 3D nodes in a calm miniature world overlaid on your real surroundings. Share how you feel, see the emotional landscape around you, and send support to others — all completely anonymously.

---

## Architecture

```
┌──────────────────────┐         ┌─────────────────────────┐
│   Unity AR Client    │ ←────→  │    Firebase Backend      │
│                      │         │                          │
│  • AR Foundation     │         │  • Anonymous Auth        │
│  • Emotion Nodes     │         │  • Firestore (messages)  │
│  • Gesture Controls  │         │  • Cloud Functions (x6)  │
│  • Message Card UI   │         │  • OpenAI moderation     │
│  • GPS → World Pos   │         │  • Geohash queries       │
└──────────────────────┘         └─────────────────────────┘
```

## Features

- **Post** anonymous emotional messages anchored to your GPS location
- **View** nearby messages (20m radius) as glowing 3D nodes in AR
- **Read & Reply** — tap a node to read, send supportive responses
- **Visual Feedback** — nodes brighten and warm as support accumulates
- **Presence** — see anonymous viewer dots orbiting active messages
- **AI Moderation** — GPT-4 classifies emotions, blocks toxicity, rewrites negativity
- **Privacy-first** — no profiles, no usernames, no tracking, 7-day auto-delete

## Anti-Patterns (By Design)

❌ No likes/upvotes/reactions · ❌ No followers/friends · ❌ No profiles  
❌ No leaderboards · ❌ No push notifications · ❌ No viral mechanics

---

## Tech Stack

| Layer      | Technology                                     |
|------------|-------------------------------------------------|
| Engine     | Unity 2022.3 LTS + Universal Render Pipeline    |
| AR         | AR Foundation 5.1, ARKit 4+ / ARCore 1.30+      |
| Backend    | Firebase (Auth, Firestore, Cloud Functions)      |
| AI         | OpenAI GPT-4 Turbo (emotion + moderation)        |
| Targets    | iOS 14+ / Android 10+                            |

---

## Setup Guide

### 1. Firebase Project

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and init
firebase login
firebase init functions   # Select JavaScript, Node 18

# Install dependencies
cd Firebase/functions
npm install

# Set OpenAI API key
firebase functions:config:set openai.key="YOUR_OPENAI_API_KEY"

# Deploy
firebase deploy --only functions,firestore:rules
```

### 2. Unity Project

1. **Create** a new Unity 2022.3 LTS project with **Universal Render Pipeline**
2. **Import packages** via Package Manager:
   - AR Foundation 5.1.0
   - ARKit XR Plugin 5.1.0 (iOS)
   - ARCore XR Plugin 5.1.0 (Android)
   - TextMeshPro
3. **Import** [DOTween](http://dotween.demigiant.com/) (free version)
4. **Import** Firebase Unity SDK packages: Auth, Firestore, Functions
5. **Copy files** into your Unity project:
   - `Unity/Scripts/` → `Assets/Scripts/`
   - `Unity/Shaders/` → `Assets/Shaders/`
6. **Add config** files to `Assets/`:
   - `GoogleService-Info.plist` (iOS — from Firebase Console)
   - `google-services.json` (Android — from Firebase Console)
7. **Follow** `Unity/Prefabs/README.md` to create prefabs and wire Inspector references
8. **Build settings**: Enable location services, camera access

### 3. Build & Deploy

- **iOS**: Build in Unity → open Xcode project → deploy to device
- **Android**: Build APK/AAB → install on device

---

## File Structure

```
EmotionalAR/
├── Unity/
│   ├── Scripts/
│   │   ├── FirebaseManager.cs      # Singleton — auth, Firestore, presence
│   │   ├── ARWorldManager.cs       # AR session, world setup, GPS conversion
│   │   ├── EmotionNodeController.cs# Node animation, color, interactions
│   │   ├── MessageUIController.cs  # Card UI, text input, states
│   │   └── GestureHandler.cs       # Pinch, drag, tap input
│   ├── Shaders/
│   │   ├── NodeGlow.shader         # Fresnel + emission pulse + additive
│   │   ├── FrostedGlass.shader     # Translucent blur card material
│   │   ├── PlatformGradient.shader # Radial gradient + Perlin noise
│   │   └── SkyboxGradient.shader   # Procedural lavender gradient
│   └── Prefabs/
│       └── README.md               # Prefab creation instructions
├── Firebase/
│   ├── functions/
│   │   ├── index.js                # 6 Cloud Functions
│   │   └── package.json
│   └── firestore.rules
├── Config/
│   └── README.md                   # Firebase config file instructions
└── README.md                       # ← You are here
```

---

## Emotion Color Palette

| Emotion    | Color     | Hex       | Temperature   |
|------------|-----------|-----------|---------------|
| Comfort    | Warm Orange | `#FF9F66` | Hot           |
| Hope       | Soft Yellow | `#FFD93D` | Warm          |
| Sadness    | Calm Blue   | `#6B9BD1` | Cool          |
| Stress     | Cool Purple | `#A78BFA` | Cool          |
| Loneliness | Muted Gray  | `#9CA3AF` | Neutral-Cool  |

---

## Performance Targets

- World loads in ≤ 3 seconds
- ≥ 30 FPS on iPhone 12 / Galaxy S21
- < 100 draw calls
- < 500 MB memory
- Message fetch latency ≤ 300ms

---

## License

This project is provided as-is for educational and personal use.
