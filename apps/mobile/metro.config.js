// Metro config — standalone install (mobile is intentionally NOT in
// the pnpm workspace; see ../../pnpm-workspace.yaml + README). Metro's
// defaults handle this fine, we just need NativeWind on top.

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
});
