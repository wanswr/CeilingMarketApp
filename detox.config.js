module.exports = {
  testRunner: 'jest',
  runnerConfig: 'e2e/config.json',
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/Ceilingsapp.app',
      build: 'xcodebuild -workspace ios/Ceilingsapp.xcworkspace -scheme Ceilingsapp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
  },
  devices: {
    'iPhone 11': {
      type: 'ios.simulator',
    },
  },
};
