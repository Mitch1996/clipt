// NativeWind 4 ships its own babel preset; Reanimated 4 split the
// babel plugin out into `react-native-worklets/plugin` (was
// `react-native-reanimated/plugin` in v3). It MUST be the last plugin.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Worklets plugin must be last.
      "react-native-worklets/plugin",
    ],
  };
};
