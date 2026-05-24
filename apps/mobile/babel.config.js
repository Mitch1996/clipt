// NativeWind 4 ships its own babel preset; Expo Router needs Reanimated's
// plugin (and it MUST be the last plugin in the list). Order matters.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Reanimated must be last.
      "react-native-reanimated/plugin",
    ],
  };
};
