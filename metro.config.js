const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');

// V9 Optimization: Simplified exclusion list for macOS/Windows stability
config.resolver.blockList = [
  /backend\/.*/,
  /verification\/.*/,
];

module.exports = config;
