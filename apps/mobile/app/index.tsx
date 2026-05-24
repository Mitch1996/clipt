import { Redirect } from "expo-router";

/**
 * Tiny redirect screen so a fresh app launch lands somewhere
 * meaningful. The root layout's Gate handles the actual signed-in vs
 * signed-out routing, so this just gets the routing machinery going.
 */
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
