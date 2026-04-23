# بناء تطبيق "زبوني" (Android & iOS)

دليل كامل لبناء تطبيق Marsool/Zaboni محلياً (Android Gradle) أو عن بُعد (EAS iOS).
Bundle ID: **`com.zaboni.delivery`** — Firebase project: **`marsool-fcd5c`**.

---

## 0) المتطلبات (Prerequisites)

### للـ Android (بناء محلي):
- **Node.js** ≥ 20 و **pnpm** ≥ 9
- **JDK 17** (مطلوب من Android Gradle Plugin 8.x)
- **Android Studio** أو على الأقل **Android SDK Command-line Tools**
- متغير البيئة `ANDROID_HOME` يشير إلى مجلد SDK
- **EAS CLI** (للأمر `eas build --local`)

### للـ iOS (بناء عن بُعد):
- حساب **Apple Developer Program** فعّال ($99/سنة)
- App ID `com.zaboni.delivery` مُسجَّل في
  [developer.apple.com → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
  مع تفعيل **Push Notifications**
- حساب EAS (Expo) — مجاني

---

## 1) تثبيت الأدوات (Installation)

### 1.1 EAS CLI
```bash
npm install -g eas-cli
eas login    # سجّل الدخول بحساب Expo
```

### 1.2 JDK 17 (Android)

**Linux / WSL:**
```bash
sudo apt update
sudo apt install -y openjdk-17-jdk
java -version    # يجب أن يظهر "17.x"
```

**macOS:**
```bash
brew install --cask temurin@17
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc
source ~/.zshrc
```

**Windows:**
حمّل من [adoptium.net](https://adoptium.net/temurin/releases/?version=17) واختر **JDK 17 (.msi)**.
أعد تشغيل الـ terminal وتأكد:
```powershell
java -version
```

### 1.3 Android SDK

**الأسهل:** ثبّت [Android Studio](https://developer.android.com/studio) → افتحه مرة واحدة ليُحمّل SDK تلقائياً.

ثم أضف المتغيرات إلى ملف الـ shell (`~/.zshrc` أو `~/.bashrc`):
```bash
# macOS
export ANDROID_HOME=$HOME/Library/Android/sdk
# Linux
export ANDROID_HOME=$HOME/Android/Sdk
# Windows (PowerShell user env)
# setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"

export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin
```

تحقّق:
```bash
adb --version
sdkmanager --version
```

### 1.4 تبعيات المشروع
من جذر الـ monorepo:
```bash
pnpm install
```

---

## 2) إنشاء مفتاح التوقيع (Keystore) — Android فقط

كل تطبيق Android للنشر يجب أن يكون موقّعاً بـ keystore. **استخدم نفس الـ keystore لكل النسخ المستقبلية** — إذا فقدته فلن تستطيع تحديث التطبيق على Google Play.

### 2.1 توليد الـ keystore

من داخل `artifacts/marsool/`:
```bash
mkdir -p credentials
keytool -genkeypair -v \
  -keystore credentials/zaboni-release.keystore \
  -alias zaboni \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_KEYSTORE_PASSWORD \
  -keypass   YOUR_KEY_PASSWORD \
  -dname "CN=Zaboni Delivery, O=Zaboni, L=Homs, C=SY"
```

غيّر `YOUR_KEYSTORE_PASSWORD` و `YOUR_KEY_PASSWORD` إلى كلمات مرور قوية (يمكن أن تكونا متطابقتين).
احفظ الكلمات في مكان آمن (1Password، Bitwarden…).

### 2.2 ⚠️ احم الـ keystore

أضف إلى `.gitignore` في جذر المشروع (إذا لم يكن موجوداً):
```
artifacts/marsool/credentials/
*.keystore
*.jks
```

اعمل **نسخة احتياطية** لـ `credentials/zaboni-release.keystore` خارج المستودع (Google Drive مشفّر، USB…).

### 2.3 ربط الـ keystore بـ EAS local build

أنشئ `artifacts/marsool/credentials.json`:
```json
{
  "android": {
    "keystore": {
      "keystorePath": "credentials/zaboni-release.keystore",
      "keystorePassword": "YOUR_KEYSTORE_PASSWORD",
      "keyAlias": "zaboni",
      "keyPassword": "YOUR_KEY_PASSWORD"
    }
  }
}
```

⚠️ أضف `credentials.json` إلى `.gitignore` أيضاً — يحتوي كلمات مرور!

### 2.4 (بديل) رفع الـ keystore إلى EAS

إذا تريد أن يدير EAS الـ keystore بدلاً من ملف محلي:
```bash
cd artifacts/marsool
eas credentials
# اختر: Android → production → Keystore → Set up a new keystore → Upload my own file
```

في هذه الحالة لا تحتاج `credentials.json`.

---

## 3) ملفات Firebase (مطلوبة)

تأكد من وجود الملفات التالية في `artifacts/marsool/` (موجودة فعلاً):
- `google-services.json` — Android (يحتوي `package_name: com.zaboni.delivery`)
- `GoogleService-Info.plist` — iOS (يحتوي `BUNDLE_ID: com.zaboni.delivery`)

إذا غيّرت bundle ID مستقبلاً، ولّد الملفات من جديد من Firebase Console وضعها هنا.

---

## 4) بناء Android محلياً

### 4.1 بناء APK (للتجربة / التوزيع المباشر)

```bash
cd artifacts/marsool
eas build --platform android --profile production-apk --local
```

**الخرج:** ملف `build-XXXXX.apk` في `artifacts/marsool/` — يمكن تثبيته مباشرة على أي جهاز Android:
```bash
adb install build-XXXXX.apk
```

### 4.2 بناء AAB (للنشر على Google Play)

```bash
cd artifacts/marsool
eas build --platform android --profile production --local
```

**الخرج:** ملف `build-XXXXX.aab` — ارفعه إلى Google Play Console.

### 4.3 ملاحظات مهمة

- أول بناء بطيء جداً (10-25 دقيقة) لأنه يُحمّل Gradle و NDK ويبني native modules. البناءات اللاحقة أسرع بكثير.
- يستهلك حوالي **8-12 GB** من القرص للـ caches.
- إذا فشل البناء بسبب الذاكرة، ارفع heap الـ Gradle:
  ```bash
  echo 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m' >> ~/.gradle/gradle.properties
  ```
- `autoIncrement: true` في `eas.json` يرفع `versionCode` تلقائياً مع كل بناء.

---

## 5) بناء iOS عن بُعد (EAS Cloud)

البناء المحلي لـ iOS يتطلب macOS + Xcode، لذلك نستخدم EAS:

### 5.1 الإعداد لأول مرة
```bash
cd artifacts/marsool
eas build:configure        # إذا لم يكن قد تم
eas credentials            # ولّد أو ارفع شهادة Apple Distribution + provisioning profile
```

EAS سيسألك عن الدخول بحساب Apple — اختر **"Let EAS handle the process"** ليولّد كل شيء تلقائياً، أو ارفع شهاداتك يدوياً.

### 5.2 بناء IPA للنشر
```bash
eas build --platform ios --profile production
```

البناء يأخذ 15-25 دقيقة. عندما ينتهي، EAS يعطيك رابط لتحميل ملف `.ipa`، أو يمكنك إرسال الملف مباشرة إلى App Store Connect:
```bash
eas submit --platform ios --latest
```

---

## 6) بناء النسخة التجريبية (Preview / Internal)

نسخة لاختبار سريع، ليس للنشر:
```bash
# Android APK
eas build --platform android --profile preview --local

# iOS (Ad-hoc / TestFlight)
eas build --platform ios --profile preview
```

---

## 7) رفع رقم الإصدار

في `app.json`:
- `version` — يظهر للمستخدم (مثلاً `1.0.1`)
- `ios.buildNumber` — يجب أن يكون فريداً لكل رفع إلى App Store
- `android.versionCode` — رقم صحيح يزداد مع كل رفع إلى Play (يُدار تلقائياً بـ `autoIncrement: true`)

---

## 8) مشاكل شائعة

| المشكلة | الحل |
|---------|------|
| `SDK location not found` | ضع متغير `ANDROID_HOME` |
| `JAVA_HOME is set to invalid directory` | تأكد من JDK 17، ليس 11 أو 21 |
| `gradle: command not found` | استخدم `./gradlew` (يأتي مع المشروع بعد أول EAS build) |
| `Keystore was tampered with, or password was incorrect` | تحقق من الكلمات في `credentials.json` |
| `package com.zaboni.delivery not in google-services.json` | تأكد من تطابق bundle ID وأعد توليد الملف من Firebase |
| iOS build فشل بسبب push entitlement | تأكد من تفعيل **Push Notifications** على App ID في Apple Developer |

---

## 9) الإشعارات بعد البناء

بعد تثبيت التطبيق على جهاز حقيقي:
1. سجّل الدخول داخل التطبيق
2. التطبيق سيطلب صلاحية الإشعارات → اقبل
3. التطبيق يرسل الـ FCM token (Android) أو APN token (iOS) إلى الـ API تلقائياً
4. اختبر من لوحة الإدارة: `/admin/notifications` → "إرسال إشعار لمستخدم"

تحقق من log الـ API server:
```
[Firebase] Admin SDK initialized
```
إذا ظهر `[Firebase] Missing FIREBASE_*` فالـ secrets ناقصة — راجع `replit.md`.
