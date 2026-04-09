import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Restaurant } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

interface FavoritesContextValue {
  favorites: Restaurant[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (restaurant: Restaurant) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);
const STORAGE_KEY = "@marsool_favorites";

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<Restaurant[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setFavorites(JSON.parse(stored));
      } catch {}
      try {
        const serverFavs = await customFetch("/api/favorites") as Restaurant[];
        setFavorites(serverFavs);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serverFavs));
      } catch {}
    })();
  }, [user]);

  const isFavorite = useCallback(
    (id: string) => favorites.some((r) => r.id === id),
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (restaurant: Restaurant) => {
      const exists = favorites.some((r) => r.id === restaurant.id);
      const updated = exists
        ? favorites.filter((r) => r.id !== restaurant.id)
        : [restaurant, ...favorites];

      setFavorites(updated);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});

      try {
        if (exists) {
          await customFetch(`/api/favorites/${restaurant.id}`, { method: "DELETE" });
        } else {
          await customFetch(`/api/favorites/${restaurant.id}`, { method: "POST" });
        }
      } catch {
        setFavorites(favorites);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)).catch(() => {});
      }
    },
    [favorites]
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
