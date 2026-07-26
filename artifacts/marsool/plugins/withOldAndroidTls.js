// Bundles the Let's Encrypt roots (ISRG Root X1 / X2) with the Android app and
// points the app at a network-security-config that trusts them in addition to
// the system CA store.
//
// Why: Android's system trust store on devices older than 7.1.1 does NOT contain
// ISRG Root X1, so the app's HTTP client (OkHttp) rejects Let's Encrypt / Cloudflare
// certificates — even though Chrome (which ships its own up-to-date roots) works.
// Carrying the roots inside the app makes HTTPS to the API work on old Android
// (5/6/7.0) too, which is a large share of the user base.
const path = require('path');
const fs = require('fs');

const resolveConfigPlugins = () => {
  const searchPaths = [
    __dirname,
    path.join(__dirname, '..'),
    path.join(__dirname, '..', '..', '..'),
  ];
  for (const p of searchPaths) {
    try {
      return require(require.resolve('@expo/config-plugins', { paths: [p] }));
    } catch (_) {}
  }
  return require('@expo/config-plugins');
};

const { withAndroidManifest, withDangerousMod } = resolveConfigPlugins();

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="@raw/le_roots" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

module.exports = function withOldAndroidTls(config) {
  // 1) Copy the CA bundle into res/raw and write the network security config.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const androidRoot = cfg.modRequest.platformProjectRoot;
      const resDir = path.join(androidRoot, 'app', 'src', 'main', 'res');
      const rawDir = path.join(resDir, 'raw');
      const xmlDir = path.join(resDir, 'xml');
      fs.mkdirSync(rawDir, { recursive: true });
      fs.mkdirSync(xmlDir, { recursive: true });

      const certSrc = path.join(__dirname, 'certs', 'le_roots.pem');
      fs.copyFileSync(certSrc, path.join(rawDir, 'le_roots.pem'));
      fs.writeFileSync(
        path.join(xmlDir, 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG,
      );
      return cfg;
    },
  ]);

  // 2) Reference it from the <application> tag.
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app && app.$) {
      app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return cfg;
  });

  return config;
};
