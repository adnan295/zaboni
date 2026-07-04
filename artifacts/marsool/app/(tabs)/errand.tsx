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
        router.push("/errand-request" as any);
      } else {
        hasNavigated.current = false;
        router.navigate("/" as any);
      }
    }, [])
  );

  return <View style={{ flex: 1 }} />;
}
