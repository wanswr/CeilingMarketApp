const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');

// V9 Optimization: Platform-agnostic exclusion list
// This prevents Metro from watching or indexing the backend directory
const projectRoot = __dirname;
const backendPath = path.resolve(projectRoot, 'backend');
const verificationPath = path.resolve(projectRoot, 'verification');

config.resolver.blockList = [
  new RegExp(backendPath.replace(/\\/g, '\\\\') + '.*'),
  new RegExp(verificationPath.replace(/\\/g, '\\\\') + '.*'),
];

module.exports = config;
