import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";

export interface Coupon {
  code: string;
  label: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minOrder: number;
  description: string;
  firstOrderOnly?: boolean;
}

interface CouponsContextValue {
  appliedCoupon: Coupon | null;
  couponError: string | null;
  discountAmount: (subtotal: number) => number;
  applyCoupon: (code: string, subtotal: number, completedOrderCount: number) => void;
  removeCoupon: () => void;
}

const COUPONS: Coupon[] = [
  {
    code: "MARSOOL10",
    label: "خصم 10%",
    discountType: "percent",
    discountValue: 10,
    minOrder: 0,
    description: "خصم 10% على أي طلب",
  },
  {
    code: "FIRST",
    label: "خصم 20% للطلب الأول",
    discountType: "percent",
    discountValue: 20,
    minOrder: 0,
    firstOrderOnly: true,
    description: "خصم خاص للمستخدمين الجدد فقط (أول طلب)",
  },
  {
    code: "FREE15",
    label: "خصم 15 ريال",
    discountType: "fixed",
    discountValue: 15,
    minOrder: 50,
    description: "خصم 15 ريال على الطلبات فوق 50 ريال",
  },
  {
    code: "WELCOME",
    label: "خصم 25%",
    discountType: "percent",
    discountValue: 25,
    minOrder: 30,
    description: "خصم ترحيبي 25% على الطلبات فوق 30 ريال",
  },
];

const CouponsContext = createContext<CouponsContextValue | null>(null);

export function CouponsProvider({ children }: { children: React.ReactNode }) {
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const discountAmount = useCallback(
    (subtotal: number): number => {
      if (!appliedCoupon) return 0;
      if (appliedCoupon.discountType === "percent") {
        return Math.round((subtotal * appliedCoupon.discountValue) / 100);
      }
      return Math.min(appliedCoupon.discountValue, subtotal);
    },
    [appliedCoupon]
  );

  const applyCoupon = useCallback(
    (code: string, subtotal: number, completedOrderCount: number) => {
      const trimmed = code.trim().toUpperCase();
      const found = COUPONS.find((c) => c.code === trimmed);
      if (!found) {
        setCouponError("كود الخصم غير صالح");
        setAppliedCoupon(null);
        return;
      }
      if (found.firstOrderOnly && completedOrderCount > 0) {
        setCouponError("هذا الكوبون متاح للمستخدمين الجدد فقط (أول طلب)");
        setAppliedCoupon(null);
        return;
      }
      if (subtotal < found.minOrder) {
        setCouponError(`الحد الأدنى للطلب ${found.minOrder} ريال لاستخدام هذا الكوبون`);
        setAppliedCoupon(null);
        return;
      }
      setCouponError(null);
      setAppliedCoupon(found);
    },
    []
  );

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponError(null);
  }, []);

  return (
    <CouponsContext.Provider
      value={{ appliedCoupon, couponError, discountAmount, applyCoupon, removeCoupon }}
    >
      {children}
    </CouponsContext.Provider>
  );
}

export function useCoupons() {
  const ctx = useContext(CouponsContext);
  if (!ctx) throw new Error("useCoupons must be used within CouponsProvider");
  return ctx;
}

export { COUPONS };
