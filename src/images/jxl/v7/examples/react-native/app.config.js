// RAPIER_NO_INTERNET=1 removes the INTERNET permission from the Android build: the encoder page has no network, and a release
module.exports = {
  expo: {
    name: 'JXLExample',
    slug: 'rapier-jxl-react-native',
    version: '1.0.0',
    orientation: 'portrait',
    ios: {bundleIdentifier: 'app.rapier.jxlexample.reactnative'},
    android: {
      package: 'app.rapier.jxlexample.reactnative',
      blockedPermissions: process.env.RAPIER_NO_INTERNET === '1' ? ['android.permission.INTERNET'] : []
    },
    plugins: [['expo-image-picker', {photosPermission: 'Pick a photo or video to encode. Nothing leaves the device.', microphonePermission: false}]]
  }
};
