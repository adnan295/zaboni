import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Restaurant } from "@/data/restaurants";

interface FavoritesContextValue {
  favorites: Restaurant[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (restaurant: Restaurant) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);
const STORAGE_KEY = "@marsool_favorites";

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<Restaurant[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setFavorites(JSON.parse(stored));
      } catch {}
    })();
  }, []);

  const persist = useCallback(async (updated: Restaurant[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.some((r) => r.id === id),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (restaurant: Restaurant) => {
      setFavorites((prev) => {
        const exists = prev.some((r) => r.id === restaurant.id);
        const updated = exists
          ? prev.filter((r) => r.id !== restaurant.id)
          : [restaurant, ...prev];
        persist(updated);
        return updated;
      });
    },
    [persist]
  );

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
