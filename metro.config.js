const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');

// V9 Optimization: Exclude non-frontend directories from Metro indexer
// This prevents ENOENT errors when backend/dist or other artifacts are deleted/rebuilt
config.resolver.blockList = [
  /backend\/.*/,
  /verification\/.*/,
];

module.exports = config;
