import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  getAddresses,
  createAddress as apiCreateAddress,
  updateAddress as apiUpdateAddress,
  deleteAddress as apiDeleteAddress,
  setDefaultAddress as apiSetDefaultAddress,
} from "@workspace/api-client-react";

export interface Address {
  id: string;
  label: string;
  address: string;
  isDefault: boolean;
}

interface AddressContextValue {
  addresses: Address[];
  defaultAddress: Address | null;
  isLoading: boolean;
  addAddress: (label: string, address: string) => Promise<void>;
  updateAddress: (id: string, label: string, address: string) => Promise<void>;
  deleteAddress: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
}

const AddressContext = createContext<AddressContextValue | null>(null);

const DEFAULT_ADDRESSES: Address[] = [
  { id: "a1", label: "المنزل", address: "حي النخيل، شارع الأمير محمد، الرياض", isDefault: true },
  { id: "a2", label: "العمل", address: "طريق الملك فهد، برج المملكة، الرياض", isDefault: false },
];

const USER_ID = "guest";

function apiToLocal(a: { id: string; label: string; address: string; isDefault: boolean }): Address {
  return { id: a.id, label: a.label, address: a.address, isDefault: a.isDefault };
}

export function AddressProvider({ children }: { children: React.ReactNode }) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getAddresses({ userId: USER_ID });
        if (data.length === 0) {
          for (const addr of DEFAULT_ADDRESSES) {
            await apiCreateAddress(
              { label: addr.label, address: addr.address, isDefault: addr.isDefault },
              { userId: USER_ID }
            );
          }
          const seeded = await getAddresses({ userId: USER_ID });
          setAddresses(seeded.map(apiToLocal));
        } else {
          setAddresses(data.map(apiToLocal));
        }
      } catch {
        setAddresses(DEFAULT_ADDRESSES);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  const addAddress = useCallback(async (label: string, address: string): Promise<void> => {
    try {
      const result = await apiCreateAddress(
        { label, address, isDefault: false },
        { userId: USER_ID }
      );
      setAddresses((prev) => [...prev, apiToLocal(result)]);
    } catch {
      const newAddr: Address = {
        id: `addr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        label,
        address,
        isDefault: addresses.length === 0,
      };
      setAddresses((prev) => [...prev, newAddr]);
    }
  }, [addresses.length]);

  const updateAddress = useCallback(async (id: string, label: string, address: string): Promise<void> => {
    try {
      const result = await apiUpdateAddress(
        id,
        { label, address },
        { userId: USER_ID }
      );
      setAddresses((prev) => prev.map((a) => (a.id === id ? apiToLocal(result) : a)));
    } catch {
      setAddresses((prev) =>
        prev.map((a) => (a.id === id ? { ...a, label, address } : a))
      );
    }
  }, []);

  const deleteAddress = useCallback(async (id: string): Promise<void> => {
    try {
      await apiDeleteAddress(id, { userId: USER_ID });
    } catch {}
    setAddresses((prev) => {
      let updated = prev.filter((a) => a.id !== id);
      if (updated.length > 0 && !updated.some((a) => a.isDefault)) {
        updated = updated.map((a, i) => (i === 0 ? { ...a, isDefault: true } : a));
      }
      return updated;
    });
  }, []);

  const setDefault = useCallback(async (id: string): Promise<void> => {
    try {
      await apiSetDefaultAddress(id, { userId: USER_ID });
    } catch {}
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
  }, []);

  return (
    <AddressContext.Provider
      value={{ addresses, defaultAddress, isLoading, addAddress, updateAddress, deleteAddress, setDefault }}
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
