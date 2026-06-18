const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withRoomFix(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

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
