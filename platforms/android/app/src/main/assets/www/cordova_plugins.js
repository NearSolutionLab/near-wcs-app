cordova.define('cordova/plugin_list', function(require, exports, module) {
  module.exports = [
    {
      "id": "cordova-plugin-bluetooth-serial.bluetoothSerial",
      "file": "plugins/cordova-plugin-bluetooth-serial/www/bluetoothSerial.js",
      "pluginId": "cordova-plugin-bluetooth-serial",
      "clobbers": [
        "window.bluetoothSerial"
      ]
    },
    {
      "id": "cordova-plugin-cache-clear.CacheClear",
      "file": "plugins/cordova-plugin-cache-clear/www/CacheClear.js",
      "pluginId": "cordova-plugin-cache-clear",
      "clobbers": [
        "CacheClear"
      ]
    },
    {
      "id": "cordova-plugin-device.device",
      "file": "plugins/cordova-plugin-device/www/device.js",
      "pluginId": "cordova-plugin-device",
      "clobbers": [
        "device"
      ]
    },
    {
      "id": "cordova-plugin-dialogs.notification",
      "file": "plugins/cordova-plugin-dialogs/www/notification.js",
      "pluginId": "cordova-plugin-dialogs",
      "merges": [
        "navigator.notification"
      ]
    },
    {
      "id": "cordova-plugin-dialogs.notification_android",
      "file": "plugins/cordova-plugin-dialogs/www/android/notification.js",
      "pluginId": "cordova-plugin-dialogs",
      "merges": [
        "navigator.notification"
      ]
    },
    {
      "id": "cordova-plugin-networkinterface.networkinterface",
      "file": "plugins/cordova-plugin-networkinterface/www/networkinterface.js",
      "pluginId": "cordova-plugin-networkinterface",
      "clobbers": [
        "window.networkinterface"
      ]
    },
    {
      "id": "cordova-plugin-spinner.SpinnerPlugin",
      "file": "plugins/cordova-plugin-spinner/www/spinner-plugin.js",
      "pluginId": "cordova-plugin-spinner",
      "clobbers": [
        "SpinnerPlugin"
      ]
    },
    {
      "id": "cordova-plugin-splashscreen.SplashScreen",
      "file": "plugins/cordova-plugin-splashscreen/www/splashscreen.js",
      "pluginId": "cordova-plugin-splashscreen",
      "clobbers": [
        "navigator.splashscreen"
      ]
    }
  ];
  module.exports.metadata = {
    "cordova-plugin-bluetooth-serial": "0.4.7",
    "cordova-plugin-cache-clear": "1.3.7",
    "cordova-plugin-device": "2.1.0",
    "cordova-plugin-dialogs": "2.0.2",
    "cordova-plugin-networkinterface": "2.0.0",
    "cordova-plugin-spinner": "1.1.0",
    "cordova-plugin-splashscreen": "6.0.1"
  };
});