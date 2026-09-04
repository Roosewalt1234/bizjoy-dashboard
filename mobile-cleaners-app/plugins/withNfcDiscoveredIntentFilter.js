const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Adds an explicit android.nfc.action.NDEF_DISCOVERED intent-filter to MainActivity,
 * matching the same https://fizfixapp.ansearly.io/checkin & /attendance links already
 * declared for App Links (android.intent.action.VIEW).
 *
 * Why this is needed: on Android versions below 16, scanning an NFC tag whose NDEF
 * payload is an http/https URI fires ACTION_NDEF_DISCOVERED, not ACTION_VIEW - so
 * Android App Links / Digital Asset Links verification (which only governs ACTION_VIEW)
 * never gets a chance to route the tap to this app, and it can fall through to a
 * browser instead. Registering this app directly for NDEF_DISCOVERED on the same
 * scheme/host/pathPrefix makes tag dispatch route here regardless of Android version.
 * See: https://developer.android.com/develop/connectivity/nfc/nfc
 */
const withNfcDiscoveredIntentFilter = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const mainApplication = manifest.application?.[0];
    const mainActivity = mainApplication?.activity?.find(
      (activity) => activity.$?.['android:name'] === '.MainActivity',
    );

    if (!mainActivity) {
      throw new Error('withNfcDiscoveredIntentFilter: could not find .MainActivity in AndroidManifest.xml');
    }

    if (!mainActivity['intent-filter']) {
      mainActivity['intent-filter'] = [];
    }

    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.nfc.action.NDEF_DISCOVERED' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [
        { $: { 'android:scheme': 'https', 'android:host': 'fizfixapp.ansearly.io', 'android:pathPrefix': '/checkin' } },
        { $: { 'android:scheme': 'https', 'android:host': 'fizfixapp.ansearly.io', 'android:pathPrefix': '/attendance' } },
      ],
    });

    return config;
  });
};

module.exports = withNfcDiscoveredIntentFilter;
