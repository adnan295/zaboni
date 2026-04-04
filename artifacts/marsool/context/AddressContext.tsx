import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Address {
  id: string;
  label: string;
  address: string;
  isDefault: boolean;
}

interface AddressContextValue {
  addresses: Address[];
  defaultAddress: Address | null;
  addAddress: (label: string, address: string) => void;
  updateAddress: (id: string, label: string, address: string) => void;
  deleteAddress: (id: string) => void;
  setDefault: (id: string) => void;
}

const AddressContext = createContext<AddressContextValue | null>(null);
const STORAGE_KEY = "@marsool_addresses";

const DEFAULT_ADDRESSES: Address[] = [
  { id: "a1", label: "المنزل", address: "حي النخيل، شارع الأمير محمد، الرياض", isDefault: true },
  { id: "a2", label: "العمل", address: "طريق الملك فهد، برج المملكة، الرياض", isDefault: false },
];

export function AddressProvider({ children }: { children: React.ReactNode }) {
  const [addresses, setAddresses] = useState<Address[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setAddresses(JSON.parse(stored));
        } else {
          setAddresses(DEFAULT_ADDRESSES);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ADDRESSES));
        }
      } catch {
        setAddresses(DEFAULT_ADDRESSES);
      }
    })();
  }, []);

  const persist = useCallback(async (updated: Address[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  const addAddress = useCallback(
    (label: string, address: string) => {
      const newAddr: Address = {
        id: `addr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        label,
        address,
        isDefault: addresses.length === 0,
      };
      const updated = [...addresses, newAddr];
      setAddresses(updated);
      persist(updated);
    },
    [addresses, persist]
  );

  const updateAddress = useCallback(
    (id: string, label: string, address: string) => {
      const updated = addresses.map((a) =>
        a.id === id ? { ...a, label, address } : a
      );
      setAddresses(updated);
      persist(updated);
    },
    [addresses, persist]
  );

  const deleteAddress = useCallback(
    (id: string) => {
      let updated = addresses.filter((a) => a.id !== id);
      if (updated.length > 0 && !updated.some((a) => a.isDefault)) {
        updated = updated.map((a, i) => (i === 0 ? { ...a, isDefault: true } : a));
      }
      setAddresses(updated);
      persist(updated);
    },
    [addresses, persist]
  );

  const setDefault = useCallback(
    (id: string) => {
      const updated = addresses.map((a) => ({ ...a, isDefault: a.id === id }));
      setAddresses(updated);
      persist(updated);
    },
    [addresses, persist]
  );

  return (
    <AddressContext.Provider
      value={{ addresses, defaultAddress, addAddress, updateAddress, deleteAddress, setDefault }}
    >
      {children}
    </AddressContext.Provider>
  );
}

export function useAddresses() {
  const ctx = useContext(AddressContext);
  if (!ctx) throw new Error("useAddresses must be used within AddressProvider");
  return ctx;
}
