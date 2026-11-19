import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAddresses } from "@/context/AddressContext";
import type { DeliveryTarget } from "@/lib/kitchenApi";

/**
 * Where a pre-order will be delivered: the customer's default address, which must
 * carry a map pin (the delivery fee and the courier both depend on it).
 */
export function useKitchenDelivery() {
  const { defaultAddress } = useAddresses();
  const router = useRouter();
  const { t } = useTranslation();

  const lat = defaultAddress?.latitude, lon = defaultAddress?.longitude;
  const target: DeliveryTarget | null =
    defaultAddress && lat != null && lon != null
      ? {
          address: defaultAddress.address?.trim() ? `${defaultAddress.label} — ${defaultAddress.address.trim()}` : defaultAddress.label,
          lat,
          lon,
        }
      : null;

  /** Sends the customer to fix their address when there is nowhere to deliver to. */
  const askForAddress = () => {
    Alert.alert(
      t(defaultAddress ? "orderRequest.noLocationTitle" : "orderRequest.noAddressTitle"),
      t(defaultAddress ? "orderRequest.noLocationBody" : "orderRequest.noAddressBody"),
      [
        { text: t(defaultAddress ? "orderRequest.setLocation" : "orderRequest.addAddress"), onPress: () => router.push("/addresses") },
        { text: t("common.cancel"), style: "cancel" },
      ],
    );
  };

  return { target, label: defaultAddress?.label ?? null, askForAddress };
}
