# EmotionalAR (BeyondBinary)

An immersive Augmented Reality web application that visualizes anonymous emotional messages as glowing 3D crystals in your real-world surroundings.

Built with **Three.js**, **Mapbox GL JS**, and **Vite**.

## ✨ Features

- **Real-Time GPS Tracking**: Characters move with you in the real world.
- **Color-Based Building Detection**: Characters and messages intelligently interact with buildings (climb rooftops, float on structures) using pixel sampling.
- **Dynamic 3D Environment**: Mapbox 3D terrain and buildings rendered seamlessly with Three.js characters.
- **Emotional Visualization**: Messages appear as floating crystals, color-coded by emotion (Joy, Sadness, Anger, Fear, etc.).
- **Mobile Optimized**: Designed for touch controls, with "swipe to pan" and "tap to relocate" camera features.

## 🛠 Tech Stack

- **Frontend**: Vanilla JavaScript (ES Modules)
- **3D Rendering**: Three.js
- **Map Data**: Mapbox GL JS (Standard Style)
- **Build Tool**: Vite
- **Backend/Data**: Firebase (Firestore)

## 🚀 Getting Started

### Prerequisites

1.  **Node.js**: Install from [nodejs.org](https://nodejs.org/).
2.  **Mapbox Access Token**: Get a free token from [Mapbox](https://account.mapbox.com/).

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/EmotionalAR.git
    cd EmotionalAR/WebApp
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Mapbox Token:
    - Open `src/config.js`.
    - Replace `MAPBOX_ACCESS_TOKEN` with your own token.
    - **Important**: Ensure your token has `localhost:3000` (and `localhost:5173` if dev port changes) in its **URL Restrictions**.

### Running Locally

Start the development server:

```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

## 📱 Testing on Mobile

To test GPS and AR features on your phone, you **cannot** simply visit `http://192.168.x.x:3000` because browsers block Geolocation on insecure (non-HTTPS) connections.

**Recommended Method: USB Port Forwarding (Chrome/Edge)**

1.  Connect your Android phone to your PC via USB.
2.  Enable **USB Debugging** on your phone.
3.  Open `chrome://inspect/#devices` in Chrome on your PC.
4.  Click **Port forwarding...**.
5.  Add rule: Port `3000` points to `localhost:3000`.
6.  On your phone's Chrome browser, visit `http://localhost:3000`.
    - This allows GPS to work because `localhost` is treated as a secure origin found.

**Debugging on Mobile**

- An **Eruda** console button (floating gear icon) is added to the screen on mobile devices.
- Tap it to view console logs and errors directly on your phone.

## ⚠️ Troubleshooting

**1. Mapbox 403 Errors / Blank Map**
- **Cause**: Invalid token or URL restrictions.
- **Fix**: Check your Mapbox dashboard. verify the token is valid and `localhost` is allowed.

**2. "GPS Geolocation not available"**
- **Cause**: Accessing via `http://` IP address (e.g., `http://192.168.1.5:3000`).
- **Fix**: Use USB Port Forwarding to access via `localhost` (see above) or deploy to a secure host (Vercel/Netlify).

**3. Character Clipping / Jerky Movement**
- The app uses pro-active building detection. If data is loading slowly, minor clipping may occur initially. Ensure a stable internet connection for map tiles.
