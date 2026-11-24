import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { View } from "react-native";

export default function ErrandTab() {
  const router = useRouter();
  const hasNavigated = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        // The Homs directory; it falls back to the typed free order while it is empty.
        router.push("/directory" as any);
      } else {
        hasNavigated.current = false;
        router.navigate("/" as any);
      }
    }, [])
  );

  return <View style={{ flex: 1 }} />;
}
