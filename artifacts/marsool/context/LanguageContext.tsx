import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { I18nManager, Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "@/i18n";

export type AppLanguage = "ar" | "en";

const LANG_KEY = "@marsool_language";

interface LanguageContextValue {
  language: AppLanguage;
  isRTL: boolean;
  setLanguage: (lang: AppLanguage) => void;
  isReady: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "ar",
  isRTL: true,
  setLanguage: () => {},
  isReady: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("ar");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANG_KEY);
        const lang: AppLanguage = stored === "en" ? "en" : "ar";
        setLanguageState(lang);
        await i18n.changeLanguage(lang);
        const shouldBeRTL = lang === "ar";
        if (I18nManager.isRTL !== shouldBeRTL) {
          I18nManager.allowRTL(shouldBeRTL);
          I18nManager.forceRTL(shouldBeRTL);
        }
      } catch {}
      setIsReady(true);
    })();
  }, []);

  const setLanguage = useCallback(
    (lang: AppLanguage) => {
      if (lang === language) return;
      const shouldBeRTL = lang === "ar";
      const needsRTLChange = I18nManager.isRTL !== shouldBeRTL;

      const apply = async () => {
        await AsyncStorage.setItem(LANG_KEY, lang);
        await i18n.changeLanguage(lang);
        setLanguageState(lang);

        if (needsRTLChange) {
          I18nManager.allowRTL(shouldBeRTL);
          I18nManager.forceRTL(shouldBeRTL);
          if (Platform.OS !== "web") {
            try {
              const Updates = require("expo-updates");
              await Updates.reloadAsync();
            } catch {}
          }
        }
      };

      if (needsRTLChange && Platform.OS !== "web") {
        const targetT = i18n.getFixedT(lang);
        Alert.alert(
          targetT("profile.language.title"),
          targetT("profile.language.restartMsg"),
          [
            {
              text: targetT("profile.language.cancel"),
              style: "cancel",
            },
            {
              text: targetT("profile.language.restartBtn"),
              onPress: apply,
            },
          ]
        );
      } else {
        apply();
      }
    },
    [language]
  );

  const isRTL = language === "ar";

  return (
    <LanguageContext.Provider value={{ language, isRTL, setLanguage, isReady }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
