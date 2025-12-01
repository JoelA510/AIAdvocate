# Deployment Guide: Google Play Store & Apple App Store

This guide details the steps to build and submit the **AI Advocate** mobile application to both the Google Play Store and Apple App Store using Expo EAS (Application Services).

## Prerequisites

1.  **Expo Account**: Ensure you are logged in to your Expo account.
    ```bash
    eas login
    ```
2.  **Apple Developer Account**: Required for iOS submission ($99/year).
3.  **Google Play Console Account**: Required for Android submission ($25 one-time fee).
4.  **EAS CLI**: Ensure you have the latest version.
    ```bash
    npm install -g eas-cli
    ```

---

## 🤖 Android (Google Play Store)

### 1. Build the App Bundle (AAB)
The Android App Bundle (`.aab`) is the format required by Google Play.

Run the following command in the `mobile-app` directory:

```bash
eas build --platform android --profile production
```

*   **Credentials**: EAS will ask to handle keystores for you. Select **Yes** to let EAS manage them securely.
*   **Wait**: The build will take 10-20 minutes.
*   **Download**: Once finished, download the `.aab` file from the link provided.

### 2. Submit to Google Play Console

#### First Time Submission (Manual)
1.  Go to the [Google Play Console](https://play.google.com/console).
2.  Create a new app.
3.  Navigate to **Testing > Internal testing** (or Production).
4.  Create a new release.
5.  Upload the `.aab` file you downloaded.
6.  Complete the store listing details (screenshots, description, privacy policy).
7.  Submit for review.

#### Subsequent Updates (Automated)
Once the first build is manually uploaded, you can automate future submissions:

```bash
eas submit -p android
```

---

## 🍎 iOS (Apple App Store)

### 1. Build the IPA
The `.ipa` file is the format required by Apple.

Run the following command in the `mobile-app` directory:

```bash
eas build --platform ios --profile production
```

*   **Credentials**: EAS will ask to log in to your Apple Developer account. It will handle certificates and provisioning profiles automatically.
*   **Wait**: The build will take 15-25 minutes.

### 2. Submit to App Store Connect

#### Automated Submission (Recommended)
You can submit directly from the CLI after the build (or separately):

```bash
eas submit -p ios
```

1.  Select the build you just created.
2.  EAS will upload the binary to **TestFlight** in App Store Connect.

#### Finalize in App Store Connect
1.  Go to [App Store Connect](https://appstoreconnect.apple.com/).
2.  Navigate to **My Apps > AI Advocate**.
3.  Go to **TestFlight** to verify the build is processing.
4.  Once processed, go to the **App Store** tab.
5.  Select the build you uploaded.
6.  Update screenshots and metadata if needed.
7.  Click **Submit for Review**.

---

## 🔄 OTA Updates (Over-The-Air)

For small JavaScript/asset changes (like the ones we made today), you don't need a full store build! You can push an update instantly to users who already have the app.

```bash
eas update --branch production --message "Fix: summary persistence and UI refinements"
```

*   **Note**: This only works for JS/CSS/Asset changes. If you add new native libraries (change `package.json` dependencies that require native code), you **MUST** do a full build (Steps 1 & 2 above).

---

## 🛠 Troubleshooting

*   **Build Fails?** Check the logs provided in the Expo dashboard link.
*   **Version Code Error?** Increment the `versionCode` (Android) or `buildNumber` (iOS) in `app.json` before building.
    ```json
    "android": { "versionCode": 2 },
    "ios": { "buildNumber": "2" }
    ```
