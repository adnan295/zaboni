import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zaboni-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'ci'), { recursive: true });
  fs.mkdirSync(path.join(root, 'artifacts/marsool/android/app'), { recursive: true });
  fs.copyFileSync(new URL('./mobile-release.mjs', import.meta.url), path.join(root, 'ci/mobile-release.mjs'));
  const config = { expo: { android: { package: 'com.zaboni.delivery' }, ios: { bundleIdentifier: 'com.zaboni.delivery' }, updates: { enabled: true }, extra: { eas: { projectId: 'existing-project' } } } };
  const configPath = path.join(root, 'artifacts/marsool/app.json');
  fs.writeFileSync(configPath, JSON.stringify(config));
  fs.writeFileSync(path.join(root, 'artifacts/marsool/android/app/build.gradle'), '// generated\n');
  const envPath = path.join(root, 'github-env');
  fs.writeFileSync(envPath, '');
  const run = (action, env = {}) => spawnSync(process.execPath, [path.join(root, 'ci/mobile-release.mjs'), action], {
    encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: path.join(root, 'temp'), GITHUB_ENV: envPath, RELEASE_VERSION: '1.0.17', RELEASE_BUILD: '109', ...env },
  });
  return { root, configPath, config, envPath, run };
}

test('store release pins app identity and prevents old OTA bundles overriding the fix', t => {
  const f = fixture(t);
  assert.equal(f.run('configure').status, 0);
  const e = JSON.parse(fs.readFileSync(f.configPath)).expo;
  assert.equal(e.version, '1.0.17');
  assert.equal(e.android.versionCode, 109);
  assert.equal(e.ios.appleTeamId, 'H5V2BKC8WA');
  assert.equal(e.updates.enabled, false);
  assert.equal(e.extra.eas.projectId, 'existing-project');
});

test('unsafe versions and invalid build numbers fail without changing the app', t => {
  const f = fixture(t);
  for (const env of [{ RELEASE_VERSION: '1.0.17; touch injected' }, { RELEASE_BUILD: '-1' }, { RELEASE_BUILD: '2100000001' }]) {
    assert.notEqual(f.run('configure', env).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.configPath)), f.config);
  }
});

test('a different application cannot be signed by the Zaboni workflow', t => {
  const f = fixture(t);
  f.config.expo.android.package = 'com.other.app';
  fs.writeFileSync(f.configPath, JSON.stringify(f.config));
  assert.notEqual(f.run('configure').status, 0);
});

function signingFixture(t) {
  const f = fixture(t);
  const bin = path.join(f.root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'keytool'), '#!/bin/sh\nprintf "SHA256: ' + 'AB:'.repeat(31) + 'AB\\n"\n', { mode: 0o700 });
  const env = {
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    ANDROID_KEYSTORE_BASE64: Buffer.from('test keystore').toString('base64'),
    ANDROID_STORE_PASSWORD: 'test-password', ANDROID_KEY_PASSWORD: 'test-password', ANDROID_KEY_ALIAS: 'test',
    ANDROID_UPLOAD_CERT_SHA256: 'AB'.repeat(32),
    PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 'test@example.invalid', private_key: 'test key' }),
  };
  return { ...f, env };
}

test('mismatched Android upload certificate blocks publication setup', t => {
  const f = signingFixture(t);
  const result = f.run('android-signing', { ...f.env, ANDROID_UPLOAD_CERT_SHA256: 'CD'.repeat(32) });
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(f.envPath, 'utf8'), '');
});

test('signing setup stores credentials only in private temporary files and cleans them', t => {
  const f = signingFixture(t);
  assert.equal(f.run('android-signing', f.env).status, 0);
  const file = path.join(f.root, 'temp/zaboni-signing/play-service-account.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(fs.readFileSync(f.envPath, 'utf8').includes('ANDROID_KEYSTORE_PATH='));
  assert.equal(f.run('cleanup').status, 0);
  assert.equal(fs.existsSync(file), false);
});

test('malformed service account does not echo its contents in the error', t => {
  const f = signingFixture(t);
  const secret = 'PRIVATE_CONTENT_MUST_NOT_APPEAR';
  const result = f.run('android-signing', { ...f.env, PLAY_SERVICE_ACCOUNT_JSON: secret });
  assert.notEqual(result.status, 0);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
});


test('build-only signs without Play credentials but publishing still requires them', t => {
  const f = signingFixture(t);
  const env = { ...f.env, PLAY_SERVICE_ACCOUNT_JSON: '', PLAY_TRACK: 'build-only' };
  assert.equal(f.run('android-signing', env).status, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'temp/zaboni-signing/play-service-account.json')), false);
  for (const track of ['internal', 'production']) {
    assert.notEqual(f.run('android-signing', { ...env, PLAY_TRACK: track }).status, 0);
  }
});
