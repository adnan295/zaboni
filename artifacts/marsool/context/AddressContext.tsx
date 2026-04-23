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
import { useAuth } from "@/context/AuthContext";

export interface Address {
  id: string;
  label: string;
  address: string;
  isDefault: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

interface AddressContextValue {
  addresses: Address[];
  defaultAddress: Address | null;
  isLoading: boolean;
  addAddress: (label: string, address: string, coords?: { latitude: number; longitude: number } | null) => Promise<void>;
  updateAddress: (id: string, label: string, address: string, coords?: { latitude: number; longitude: number } | null) => Promise<void>;
  deleteAddress: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
}

const AddressContext = createContext<AddressContextValue | null>(null);


function apiToLocal(a: {
  id: string;
  label: string;
  address: string;
  isDefault: boolean;
  latitude?: number | null;
  longitude?: number | null;
}): Address {
  return {
    id: a.id,
    label: a.label,
    address: a.address,
    isDefault: a.isDefault,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}

export function AddressProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAddresses([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const data = await getAddresses({});
        if (cancelled) return;
        if (!cancelled) setAddresses(data.map(apiToLocal));
      } catch {
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, authLoading]);

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  const addAddress = useCallback(async (
    label: string,
    address: string,
    coords?: { latitude: number; longitude: number } | null
  ): Promise<void> => {
    try {
      const result = await apiCreateAddress(
        {
          label,
          address,
          isDefault: false,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
        },
        {}
      );
      setAddresses((prev) => [...prev, apiToLocal(result)]);
    } catch {
      const newAddr: Address = {
        id: `addr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        label,
        address,
        isDefault: addresses.length === 0,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      };
      setAddresses((prev) => [...prev, newAddr]);
    }
  }, [addresses.length]);

  const updateAddress = useCallback(async (
    id: string,
    label: string,
    address: string,
    coords?: { latitude: number; longitude: number } | null
  ): Promise<void> => {
    try {
      const result = await apiUpdateAddress(
        id,
        {
          label,
          address,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
        },
        {}
      );
      setAddresses((prev) => prev.map((a) => (a.id === id ? apiToLocal(result) : a)));
    } catch {
      setAddresses((prev) =>
        prev.map((a) => (a.id === id ? {
          ...a,
          label,
          address,
          latitude: coords?.latitude ?? a.latitude,
          longitude: coords?.longitude ?? a.longitude,
        } : a))
      );
    }
  }, []);

  const deleteAddress = useCallback(async (id: string): Promise<void> => {
    try {
      await apiDeleteAddress(id, {});
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
      await apiSetDefaultAddress(id, {});
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
