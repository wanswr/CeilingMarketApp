const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = true;
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'import'];

module.exports = config;
