const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');

// V9 Optimization: Robust exclusion that works on Windows and POSIX
// This prevents Metro from crashing when watching backend build artifacts or node_modules
config.resolver.blockList = [
  /.*[\\\/]backend[\\\/].*/,
  /.*[\\\/]verification[\\\/].*/,
];

module.exports = config;
