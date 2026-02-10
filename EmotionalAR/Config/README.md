# Firebase Configuration Files

These files are required but **not included** in the repository for security reasons.

## How to Get Them

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create or select your project
3. Enable **Anonymous Authentication** (Authentication → Sign-in method → Anonymous)
4. Create a **Firestore Database** (Cloud Firestore → Create database)

### iOS — `GoogleService-Info.plist`

1. Firebase Console → Project Settings → Your Apps → iOS
2. Register your iOS app (Bundle ID matches Unity Player Settings)
3. Download `GoogleService-Info.plist`
4. Place in: `Assets/GoogleService-Info.plist` (Unity project root)

### Android — `google-services.json`

1. Firebase Console → Project Settings → Your Apps → Android
2. Register your Android app (Package Name matches Unity Player Settings)
3. Download `google-services.json`
4. Place in: `Assets/google-services.json` (Unity project root)

## Environment Variables

For Cloud Functions, set the OpenAI API key:

```bash
firebase functions:config:set openai.key="YOUR_OPENAI_API_KEY"
```

## Security Reminder

⚠️ **Never commit** `GoogleService-Info.plist`, `google-services.json`, or API keys to version control. Add them to `.gitignore`.
