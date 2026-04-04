import { useLanguage } from "@/context/LanguageContext";

export type FontWeight = "regular" | "medium" | "bold" | "extrabold";

const TAJAWAL: Record<FontWeight, string> = {
  regular: "Tajawal_400Regular",
  medium: "Tajawal_500Medium",
  bold: "Tajawal_700Bold",
  extrabold: "Tajawal_800ExtraBold",
};

const INTER: Record<FontWeight, string> = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  bold: "Inter_700Bold",
  extrabold: "Inter_700Bold",
};

export function useTypography() {
  const { language } = useLanguage();
  const fonts = language === "ar" ? TAJAWAL : INTER;

  return {
    fontRegular: fonts.regular,
    fontMedium: fonts.medium,
    fontBold: fonts.bold,
    fontExtraBold: fonts.extrabold,
    ff: (weight: FontWeight = "regular") => fonts[weight],
  };
}
