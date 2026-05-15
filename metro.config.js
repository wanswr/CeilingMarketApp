const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

module.exports = config;
