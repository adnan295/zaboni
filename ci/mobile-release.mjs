import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'artifacts/marsool');
const action = process.argv[2];
const required = name => {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing ${name}`);
  return value;
};
const temp = () => path.join(required('RUNNER_TEMP'), 'zaboni-signing');
function writeSecret(name, value) {
  fs.mkdirSync(temp(), { recursive: true, mode: 0o700 });
  const file = path.join(temp(), name);
  fs.writeFileSync(file, value, { mode: 0o600 });
  return file;
}
function persistEnv(name, value) {
  if (/[\r\n]/.test(value)) throw new Error(`Invalid ${name}`);
  fs.appendFileSync(required('GITHUB_ENV'), `${name}=${value}\n`);
}

if (action === 'configure') {
  const version = required('RELEASE_VERSION');
  const build = required('RELEASE_BUILD');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a numeric x.y.z version');
  if (!/^[1-9]\d*$/.test(build) || Number(build) > 2100000000) throw new Error('Invalid build number');
  const file = path.join(app, 'app.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const e = config.expo;
  if (e.android.package !== 'com.zaboni.delivery' || e.ios.bundleIdentifier !== 'com.zaboni.delivery') {
    throw new Error('Unexpected application identifier');
  }
  e.version = version;
  e.android.versionCode = Number(build);
  e.ios.buildNumber = build;
  e.ios.appleTeamId = 'H5V2BKC8WA';
  // Store builds must not load an older update from the former EAS account.
  // Keep the existing project ID for Expo push tokens on installed clients.
  e.runtimeVersion = version;
  e.updates = { ...e.updates, enabled: false };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  console.log(`Prepared Zaboni ${version} (${build})`);
} else if (action === 'android-signing') {
  const keystore = writeSecret('upload.keystore', Buffer.from(required('ANDROID_KEYSTORE_BASE64'), 'base64'));
  required('ANDROID_KEY_PASSWORD');
  required('ANDROID_STORE_PASSWORD');
  const alias = required('ANDROID_KEY_ALIAS');
  const expected = required('ANDROID_UPLOAD_CERT_SHA256').replace(/:/g, '').toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(expected)) throw new Error('Invalid upload certificate SHA-256');
  const cert = execFileSync('keytool', [
    '-J-Duser.language=en', '-list', '-v', '-keystore', keystore,
    '-alias', alias, '-storepass:env', 'ANDROID_STORE_PASSWORD',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const actual = cert.match(/SHA256:\s*([A-Fa-f0-9:]+)/)?.[1].replace(/:/g, '').toUpperCase();
  if (actual !== expected) throw new Error('Signing certificate does not match the Play upload certificate');
  let account;
  try { account = JSON.parse(required('PLAY_SERVICE_ACCOUNT_JSON')); }
  catch { throw new Error('Invalid Play service account JSON'); }
  if (account.type !== 'service_account' || !account.private_key || !account.client_email) throw new Error('Invalid Play service account');
  const accountPath = writeSecret('play-service-account.json', JSON.stringify(account));
  persistEnv('ANDROID_KEYSTORE_PATH', keystore);
  persistEnv('PLAY_JSON_PATH', accountPath);
  persistEnv('ZABONI_SIGNING_GRADLE', path.join(root, 'ci/android-signing.gradle'));
  fs.appendFileSync(path.join(app, 'android/app/build.gradle'), '\napply from: file(System.getenv("ZABONI_SIGNING_GRADLE"))\n');
  console.log('Android upload certificate verified; release signing configured');
} else if (action === 'ios-signing') {
  required('IOS_DISTRIBUTION_PASSWORD');
  required('ASC_KEY_ID');
  required('ASC_ISSUER_ID');
  required('ASC_KEY_CONTENT');
  persistEnv('IOS_P12_PATH', writeSecret('distribution.p12', Buffer.from(required('IOS_DISTRIBUTION_P12_BASE64'), 'base64')));
  persistEnv('IOS_PROFILE_PATH', writeSecret('zaboni.mobileprovision', Buffer.from(required('IOS_PROVISIONING_PROFILE_BASE64'), 'base64')));
} else if (action === 'cleanup') {
  fs.rmSync(temp(), { recursive: true, force: true });
} else {
  throw new Error('Expected configure, android-signing, ios-signing or cleanup');
}
