# YWAM - TRICHY Beneficiary Management - Android app

Developed by **CHANDRABOSE GOVINDAN**

This folder builds the Android app (an **APK** file). The app lets staff, from their phone:

- search and view beneficiaries, with photos
- see and show an ID card on the screen
- add new beneficiaries and edit existing ones (with a photo from the phone camera)
- mark monthly attendance
- see events and add participants

It talks to the **office server** (the `ywam-server` program). Everything the phone changes appears
on the office computers (Sync edition) and the other way round. The phone needs to be on the
office Wi-Fi, or connected through a VPN such as Tailscale.

---

## Part 1 - Get the APK file (no programs to install)

GitHub builds the APK for you on its own computers. It is free.

1. Create a free account at **github.com** (keep the repository **Private**).
2. Click **New repository**, give it a name (for example `ywam-mobile`), choose **Private**, click **Create repository**.
3. On the new repository page click **uploading an existing file**. Open this folder on your
   computer and **drag everything inside it** into the browser window
   (the folders `.github`, `android`, `assets`, `tools`, `www` and the files `package.json`,
   `package-lock.json`, `capacitor.config.json`, `.gitignore`).
   Do **not** upload a `node_modules` folder if you have one.
   Click **Commit changes**.
4. Click the **Actions** tab. If GitHub asks, click **I understand my workflows, enable them**.
5. Click **Build Android APK** on the left, then **Run workflow** (green button) and **Run workflow** again.
6. Wait about 8-10 minutes until the circle turns into a green tick.
7. Open that finished run and scroll to the bottom. Under **Artifacts** click
   **YWAM-Beneficiary-APK** - a zip file downloads. Unzip it: inside is **YWAM-Beneficiary.apk**.

> Making a new version later: change the files, upload them again, and run the workflow again.
> Every version is signed with the same key, so the new APK installs **over** the old one
> and keeps the app settings.

## Part 2 - Install on a phone

1. Copy `YWAM-Beneficiary.apk` to the phone (WhatsApp to yourself, USB cable, Google Drive, email...).
2. Tap the file. If Android says the app is from an unknown source, tap **Settings** and allow
   **Install unknown apps** for the app you opened the file from (Files, Chrome, WhatsApp...),
   then go back and tap **Install**.
3. If Google Play Protect warns about an unrecognised app, choose **Install anyway** - this is
   your own organisation's app.

## Part 3 - First start on the phone

1. The administrator creates a key of the **MOBILE** edition on the server's admin page
   (Edition: *MOBILE (Android phone app)*) - one key for each phone.
2. Open the **YWAM Beneficiary** app. Type the **server address**
   (for example `http://192.168.1.20:4000`) and the **license key**, then tap **Activate**.
3. A key works on **one phone only**. If a phone is lost or replaced, the administrator presses
   **Reset** on that key in the admin page and the key can be activated on the new phone.

The same app also opens in any phone browser at `http://<server address>/m/`
(for example `http://192.168.1.20:4000/m/`) without installing anything.

---

## For developers

The app is the phone web app from `ywam-server/public/m` wrapped with [Capacitor](https://capacitorjs.com).

```
npm install
npm run sync-www        # copy the latest phone app from ../ywam-server/public/m into www/
npx cap sync android
npx cap open android    # opens Android Studio; Build > Build APK(s)
```

Notes

- Requires Node 22+, JDK 21 and the Android SDK (Android Studio installs the SDK).
- `android/app/AndroidManifest.xml` allows plain `http://` because the office server is inside the
  private network and normally has no HTTPS certificate.
- `android/app/ywam-debug.keystore` is the fixed key every build is signed with (password `ywamdebug`).
  Keep the repository private. For Google Play you must create your own release key.
- App id: `org.ywamtrichy.beneficiary`. Icons come from `assets/` (`npx @capacitor/assets generate --android`).
