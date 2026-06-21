import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";

export default function ErrandTab() {
  const router = useRouter();
  useEffect(() => {
    router.push("/errand-request" as any);
  }, []);
  return <View />;
}
