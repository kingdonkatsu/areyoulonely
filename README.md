# EmotionalAR

An immersive Augmented Reality web application that visualizes anonymous emotional messages as glowing 3D crystals in your real-world surroundings.

## Project Structure

- **EmotionalAR/**: The main application, including the WebApp and Firebase functions.
  - **WebApp/**: The frontend built with Vite, Three.js, and Mapbox GL JS.
  - **Firebase/**: Backend services and Cloud Functions.

## Getting Started

To run the main application, navigate to `EmotionalAR/WebApp`.

### Prerequisites

- Node.js
- Mapbox Access Token
- Groq/OpenAI API Key (for moderation features)

### Installation

1. Navigate to the WebApp directory:
   ```bash
   cd EmotionalAR/WebApp
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Fill in your `VITE_MAPBOX_ACCESS_TOKEN` and `VITE_GROQ_API_KEY`.

### Running Locally

```bash
npm run dev
```

Visit `http://localhost:5173` (or the port shown in your terminal).

## Licensing

[Add License Here]
