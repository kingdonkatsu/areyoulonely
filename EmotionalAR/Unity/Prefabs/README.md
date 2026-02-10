# Prefab Setup Guide

Create these prefabs in Unity Editor after importing the scripts and shaders.

---

## 1. EmotionNode Prefab

1. **Create** → 3D Object → Sphere
2. **Rename** to `EmotionNode`
3. **Scale**: (0.3, 0.27, 0.3) — Y squashed to 0.9
4. **Material**: Create new material using `EmotionalAR/NodeGlow` shader
   - Set defaults: Color white, Intensity 0.5, PulseSpeed 1.0, FresnelPower 3.0
5. **Add Component**: `EmotionNodeController` script
6. **Add Component**: `SphereCollider` (for tap detection)
7. **Drag** to `Assets/Prefabs/` folder

---

## 2. Platform Prefab

1. **Create** → 3D Object → Plane (or use the procedural mesh from ARWorldManager)
2. **Rename** to `Platform`
3. **Material**: Create new material using `EmotionalAR/PlatformGradient` shader
   - CenterColor: #E5E7EB, EdgeColor: transparent, FadeStart: 0.8
4. **Drag** to `Assets/Prefabs/`

---

## 3. Message Card Canvas

1. **Create** → UI → Canvas (Screen Space - Overlay)
2. **Add Component**: `MessageUIController` script
3. Create child panels:
   - **CardPanel** (RectTransform, CanvasGroup, Image with FrostedGlass material)
     - EmotionBadge (TMP_Text + Image background, pill shape)
     - MessageText (TMP_Text, 18pt, white, centered)
     - TimestampText (TMP_Text, 12pt, #E5E7EB, 60% opacity)
     - ResponseCountText (TMP_Text, 12pt)
     - SendSupportButton (Button + TMP_Text "Send Support")
     - CloseButton (top-right X)
   - **InputOverlay** (CanvasGroup)
     - BackgroundDim (Image, rgba(0,0,0,0.6))
     - InputField (TMP_InputField, white rounded rect, 120px height)
     - CharCounter (TMP_Text, "0 / 280")
     - SubmitButton (Button, "Send Anonymously", pill shape)
     - CancelButton
   - **LoadingPanel** (centered spinner + text "Finding nearby emotions...")
   - **EmptyPanel** (centered card with title, subtitle, share button)
   - **ModerationPanel** (small status text)
   - **ResponseListPanel** (scrollable list modal)
4. **Wire** all references in `MessageUIController` Inspector
5. Set CardPanel anchors to bottom-center, anchor preset stretch-horizontal

---

## 4. GestureHandler

1. Create **empty GameObject** named `GestureHandler`
2. **Add Component**: `GestureHandler` script
3. Wire references: AR Camera, World Pivot (parent of platform + nodes), MessageUIController

---

## 5. Scene Setup

```
Scene Hierarchy:
├── AR Session
├── AR Session Origin
│   └── AR Camera (with Post-Processing Volume)
├── FirebaseManager (+ FirebaseManager.cs, DontDestroyOnLoad)
├── ARWorldManager (+ ARWorldManager.cs)
│   └── WorldPivot (empty, parent for platform + nodes)
├── GestureHandler (+ GestureHandler.cs)
├── UICanvas (+ MessageUIController.cs)
│   ├── CardPanel
│   ├── InputOverlay
│   ├── LoadingPanel
│   ├── EmptyPanel
│   ├── ModerationPanel
│   └── ResponseListPanel
└── EventSystem
```

## 6. Skybox

1. **Create** → Material → `EmotionalAR/SkyboxGradient` shader
2. **Window** → Rendering → Lighting → Environment → Skybox Material → assign
3. Set TopColor: #E0E7FF, HorizonColor: #F3F4F6

## 7. Build Settings

- **iOS**: Requires iOS 14+, enable Camera Usage, Location Usage descriptions
- **Android**: API Level 29+, enable ARCore, Camera + Location permissions
