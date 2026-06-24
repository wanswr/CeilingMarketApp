const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// V10: Performance Optimization - Prevent Metro from indexing the backend directory.
// This resolves "JavaScript heap out of memory" errors caused by large node_modules
// in the backend folder.
config.resolver.blockList = [
  /backend\/.*/,
];

config.resolver.sourceExts.push('cjs');

module.exports = config;
