import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CartItem {
  menuItemId: string;
  nameAr: string;
  price: number;
  originalPrice?: number;
  qty: number;
  image?: string;
  note?: string;
}

interface CartState {
  restaurantId: string | null;
  restaurantName: string | null;
  items: Record<string, CartItem>;
}

interface CartContextValue extends CartState {
  entries: CartItem[];
  totalItems: number;
  subtotal: number;
  addItem: (
    restaurantId: string,
    restaurantName: string,
    item: Omit<CartItem, "qty">,
  ) => void;
  incItem: (menuItemId: string) => void;
  decItem: (menuItemId: string) => void;
  removeItem: (menuItemId: string) => void;
  setItemNote: (menuItemId: string, note: string) => void;
  replaceCart: (
    restaurantId: string,
    restaurantName: string,
    items: CartItem[],
  ) => void;
  clear: () => void;
}

const STORAGE_KEY = "marsool_cart_v1";
const EMPTY: CartState = { restaurantId: null, restaurantName: null, items: {} };

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>(EMPTY);
  const hydrated = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CartState;
            if (parsed && typeof parsed === "object" && parsed.items) {
              setState(parsed);
            }
          } catch {
            // ignore corrupted cart
          }
        }
      })
      .finally(() => {
        hydrated.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const addItem = useCallback(
    (restaurantId: string, restaurantName: string, item: Omit<CartItem, "qty">) => {
      setState((prev) => {
        const sameRestaurant = prev.restaurantId === restaurantId;
        const base = sameRestaurant ? prev.items : {};
        const existing = base[item.menuItemId];
        return {
          restaurantId,
          restaurantName,
          items: {
            ...base,
            [item.menuItemId]: {
              ...item,
              originalPrice: item.originalPrice ?? existing?.originalPrice,
              qty: (existing?.qty ?? 0) + 1,
            },
          },
        };
      });
    },
    [],
  );

  const incItem = useCallback((menuItemId: string) => {
    setState((prev) => {
      const ex = prev.items[menuItemId];
      if (!ex) return prev;
      return {
        ...prev,
        items: { ...prev.items, [menuItemId]: { ...ex, qty: ex.qty + 1 } },
      };
    });
  }, []);

  const dropItem = useCallback((prev: CartState, menuItemId: string): CartState => {
    const next = { ...prev.items };
    delete next[menuItemId];
    const empty = Object.keys(next).length === 0;
    return {
      restaurantId: empty ? null : prev.restaurantId,
      restaurantName: empty ? null : prev.restaurantName,
      items: next,
    };
  }, []);

  const decItem = useCallback(
    (menuItemId: string) => {
      setState((prev) => {
        const ex = prev.items[menuItemId];
        if (!ex) return prev;
        if (ex.qty <= 1) return dropItem(prev, menuItemId);
        return {
          ...prev,
          items: { ...prev.items, [menuItemId]: { ...ex, qty: ex.qty - 1 } },
        };
      });
    },
    [dropItem],
  );

  const removeItem = useCallback(
    (menuItemId: string) => {
      setState((prev) => dropItem(prev, menuItemId));
    },
    [dropItem],
  );

  const setItemNote = useCallback((menuItemId: string, note: string) => {
    setState((prev) => {
      const ex = prev.items[menuItemId];
      if (!ex) return prev;
      return {
        ...prev,
        items: { ...prev.items, [menuItemId]: { ...ex, note: note.trim() || undefined } },
      };
    });
  }, []);

  const replaceCart = useCallback(
    (restaurantId: string, restaurantName: string, items: CartItem[]) => {
      const map: Record<string, CartItem> = {};
      for (const it of items) {
        if (!it.menuItemId) continue;
        map[it.menuItemId] = { ...it, qty: Math.max(1, it.qty) };
      }
      setState({ restaurantId, restaurantName, items: map });
    },
    [],
  );

  const clear = useCallback(() => setState(EMPTY), []);

  const entries = Object.values(state.items);
  const totalItems = entries.reduce((s, e) => s + e.qty, 0);
  const subtotal = entries.reduce((s, e) => s + (e.price || 0) * e.qty, 0);

  return (
    <CartContext.Provider
      value={{
        ...state,
        entries,
        totalItems,
        subtotal,
        addItem,
        incItem,
        decItem,
        removeItem,
        setItemNote,
        replaceCart,
        clear,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
