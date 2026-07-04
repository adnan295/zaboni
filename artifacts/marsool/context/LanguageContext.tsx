import React, { createContext, useContext, useState, useEffect } from "react";
import { I18nManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "@/i18n";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export type AppLanguage = "ar";

const LANG_KEY = "@marsool_language";

interface LanguageContextValue {
  language: AppLanguage;
  isRTL: boolean;
  isReady: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "ar",
  isRTL: true,
  isReady: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem(LANG_KEY, "ar");
        await i18n.changeLanguage("ar");
        if (!I18nManager.isRTL) {
          I18nManager.allowRTL(true);
          I18nManager.forceRTL(true);
        }
      } catch {}
      setIsReady(true);
    })();
  }, []);

  return (
    <LanguageContext.Provider value={{ language: "ar", isRTL: true, isReady }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
