const path = require('path');

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

  const cached = Object.keys(require.cache).find(
    (k) => /[/\\]@expo[/\\]config-plugins[/\\]build[/\\]index\.js$/.test(k)
  );
  if (cached) return require(cached);

  return require('@expo/config-plugins');
};

const { withAppBuildGradle } = resolveConfigPlugins();

module.exports = function withRoomFix(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    if (!contents) {
      return config;
    }

    const resolutionBlock = `
configurations.all {
    resolutionStrategy {
        force 'androidx.room:room-runtime:2.7.1'
        force 'androidx.room:room-ktx:2.7.1'
        force 'androidx.room:room-common:2.7.1'
    }
}
`;

    if (contents.includes('room-runtime')) {
      return config;
    }

    config.modResults.contents = contents.replace(
      /^(android\s*\{)/m,
      `${resolutionBlock}\n$1`
    );

    return config;
  });
};
