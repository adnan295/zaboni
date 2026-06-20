import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Animated,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useOrders } from "@/context/OrderContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useNotifications } from "@/context/NotificationsContext";
import { useRatings } from "@/context/RatingsContext";
import { customFetch } from "@workspace/api-client-react";

interface MenuItemDef {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: number;
  danger?: boolean;
}

type AppStatus = "none" | "pending" | "approved" | "rejected";

interface CourierApplication {
  id: string;
  status: AppStatus;
  adminNote: string;
}

interface CustomerStats {
  totalOrders: number;
  completedOrders: number;
  totalDeliveryFees: number;
  memberSince: string | null;
}

interface LoyaltyBalance {
  balance: number;
  redeemDiscount: number;
  earnRate: number;
}

interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

interface Achievement {
  key: string;
  icon: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  type: string;
  threshold: number;
  earned: boolean;
  earnedAt: string | null;
  progress: number;
}

interface AchievementsData {
  achievements: Achievement[];
}

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, signOut, isCourier, isCourierMode, setCourierMode, refreshRole, updateName } = useAuth();
  const { orders, setStatusChangeHandler } = useOrders();
  const { favorites } = useFavorites();
  const { unreadCount } = useNotifications();
  const { ratings } = useRatings();

  const [application, setApplication] = useState<CourierApplication | null>(null);
  const [appLoading, setAppLoading] = useState(false);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyBalance | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralStats, setReferralStats] = useState<{ totalReferrals: number; totalEarned: number } | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [achievementsData, setAchievementsData] = useState<AchievementsData | null>(null);
  const [celebrationAchievement, setCelebrationAchievement] = useState<Achievement | null>(null);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const knownEarnedKeys = useRef<Set<string>>(new Set());
  const celebrationScale = useRef(new Animated.Value(0)).current;

  const avgRating =
    ratings.length > 0
      ? (
          ratings.reduce(
            (sum, r) => sum + (r.restaurantStars + r.courierStars) / 2,
            0
          ) / ratings.length
        ).toFixed(1)
      : "—";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const displayPhone = user?.phone ?? "";

  const fetchApplication = useCallback(async () => {
    if (isCourier || !user) return;
    setAppLoading(true);
    try {
      const data = await customFetch("/api/courier/my-application");
      const app = data as CourierApplication | null;
      setApplication(app);
      if (app?.status === "approved") {
        await refreshRole();
        await setCourierMode(true);
      }
    } catch {
      setApplication(null);
    } finally {
      setAppLoading(false);
    }
  }, [isCourier, user?.id]);

  const fetchCustomerStats = useCallback(async () => {
    if (!user) return;
    setStatsLoading(true);
    try {
      const data = await customFetch("/api/me/stats") as CustomerStats;
      setCustomerStats(data);
    } catch {
      setCustomerStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id]);

  const fetchLoyalty = useCallback(async () => {
    if (!user || isCourier) return;
    try {
      const data = await customFetch("/api/users/me/loyalty") as LoyaltyBalance;
      setLoyaltyData(data);
    } catch {
      setLoyaltyData(null);
    }
  }, [user?.id, isCourier]);

  const fetchWallet = useCallback(async () => {
    if (!user || isCourier) return;
    try {
      const data = await customFetch("/api/wallet/transactions") as { balance: number; transactions: WalletTransaction[] };
      setWalletBalance(data.balance);
      setWalletTransactions(data.transactions ?? []);
    } catch {
      setWalletBalance(null);
    }
  }, [user?.id, isCourier]);

  const fetchReferral = useCallback(async () => {
    if (!user || isCourier) return;
    try {
      const data = await customFetch("/api/referrals/my-code") as { code: string; totalReferrals: number; totalEarned: number };
      setReferralCode(data.code);
      setReferralStats({ totalReferrals: data.totalReferrals, totalEarned: data.totalEarned });
    } catch {
      setReferralCode(null);
    }
  }, [user?.id, isCourier]);

  const fetchSubscriptionStatus = useCallback(async () => {
    if (!user || isCourier) return;
    try {
      const data = await customFetch("/api/subscriptions/status") as { isSubscribed: boolean };
      setIsSubscribed(data.isSubscribed);
    } catch {
      setIsSubscribed(false);
    }
  }, [user?.id, isCourier]);

  const fetchSupportUnread = useCallback(async () => {
    if (!user || isCourier) return;
    try {
      const data = await customFetch("/api/support/unread-count") as { count: number };
      setSupportUnreadCount(data.count);
    } catch {
      // ignore
    }
  }, [user?.id, isCourier]);

  const fetchAchievements = useCallback(async () => {
    if (!user || isCourier) return;
    try {
      const data = await customFetch("/api/users/me/achievements") as AchievementsData;
      setAchievementsData(data);
      for (const ach of data.achievements) {
        if (ach.earned && !knownEarnedKeys.current.has(ach.key)) {
          knownEarnedKeys.current.add(ach.key);
          if (knownEarnedKeys.current.size > data.achievements.filter((a) => a.earned).length) {
            continue;
          }
          if (ach.earnedAt) {
            const age = Date.now() - new Date(ach.earnedAt).getTime();
            if (age < 60_000) {
              setCelebrationAchievement(ach);
              celebrationScale.setValue(0);
              Animated.spring(celebrationScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }).start();
            }
          }
        } else if (ach.earned) {
          knownEarnedKeys.current.add(ach.key);
        }
      }
    } catch {
      setAchievementsData(null);
    }
  }, [user?.id, isCourier]);

  useFocusEffect(
    useCallback(() => {
      fetchApplication();
      fetchCustomerStats();
      fetchLoyalty();
      fetchAchievements();
      fetchSubscriptionStatus();
      void fetchSupportUnread();
      void fetchWallet();
      void fetchReferral();
    }, [fetchApplication, fetchCustomerStats, fetchLoyalty, fetchAchievements, fetchSubscriptionStatus, fetchSupportUnread, fetchWallet, fetchReferral])
  );

  useEffect(() => {
    setStatusChangeHandler((_order, newStatus) => {
      if (newStatus === "delivered") {
        void fetchLoyalty();
        void fetchCustomerStats();
      }
    });
  }, [setStatusChangeHandler, fetchLoyalty, fetchCustomerStats]);

  const handleSignOut = () => {
    Alert.alert(t("profile.signOutTitle"), t("profile.signOutMessage"), [
      { text: t("profile.signOutCancel"), style: "cancel" },
      {
        text: t("profile.signOutConfirm"),
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await signOut();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(t("profile.deleteAccountTitle"), t("profile.deleteAccountMessage"), [
      { text: t("profile.deleteAccountCancel"), style: "cancel" },
      {
        text: t("profile.deleteAccountConfirm"),
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          try {
            await customFetch("/api/auth/me", { method: "DELETE" });
            await signOut();
          } catch {
            Alert.alert(t("profile.deleteAccountTitle"), t("profile.deleteAccountError"));
          }
        },
      },
    ]);
  };

  const openEditName = () => {
    setEditNameValue(user?.name || "");
    setEditNameVisible(true);
  };

  const handleSaveName = async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      const updated = await customFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      }) as { name: string };
      updateName(updated.name ?? trimmed);
      setEditNameVisible(false);
    } catch {
      Alert.alert(t("profile.editName.errorTitle"), t("profile.editName.errorMsg"));
    } finally {
      setSavingName(false);
    }
  };

  const formatDate = (isoDate: string | null) => {
    if (!isoDate) return "—";
    return new Date(isoDate).toLocaleDateString("ar-SY", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const menuItems: MenuItemDef[] = [
    { icon: "receipt-long", label: t("profile.menu.orders"), onPress: () => router.push("/orders"), badge: orders.length > 0 ? orders.length : undefined },
    { icon: "favorite", label: t("profile.menu.favorites"), onPress: () => router.push("/favorites"), badge: favorites.length > 0 ? favorites.length : undefined },
    { icon: "location-on", label: t("profile.menu.addresses"), onPress: () => router.push("/addresses") },
    { icon: "stars", label: t("loyalty.viewHistory"), onPress: () => router.push("/loyalty-history") },
    { icon: "local-shipping", label: t("subscription.menuLabel"), onPress: () => router.push("/subscription") },
    { icon: "notifications", label: t("profile.menu.notifications"), onPress: () => router.push("/notifications"), badge: unreadCount > 0 ? unreadCount : undefined },
    { icon: "payment", label: t("profile.menu.payments"), onPress: () => router.push("/payment-info") },
    { icon: "help-outline", label: t("profile.menu.support"), onPress: () => router.push("/support"), badge: supportUnreadCount > 0 ? supportUnreadCount : undefined },
    { icon: "info-outline", label: t("profile.menu.about"), onPress: () => router.push("/about") },
  ];

  const appStatus: AppStatus = isCourier ? "approved" : (application?.status ?? "none");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity style={styles.avatarContainer} onPress={() => router.push("/edit-profile")} activeOpacity={0.8}>
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl.startsWith("/") ? `/api${user.avatarUrl}` : user.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {user?.name ? user.name.charAt(0) : "؟"}
              </Text>
            </View>
          )}
          <View style={styles.editAvatarOverlay}>
            <MaterialIcons name="photo-camera" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user?.name ?? t("profile.defaultUser")}</Text>
          <TouchableOpacity onPress={() => router.push("/edit-profile")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="edit" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
        <Text style={styles.phone}>{displayPhone}</Text>
        {isCourier && (
          <View style={styles.courierBadge}>
            <MaterialIcons name="verified" size={14} color="#DC2626" />
            <Text style={styles.courierBadgeText}>{t("profile.courier.badge")}</Text>
            {isCourierMode && (
              <View style={[styles.modeDot, { backgroundColor: "#4CAF50" }]} />
            )}
          </View>
        )}
        {isSubscribed && (
          <View style={styles.subscriberBadge}>
            <Text style={styles.subscriberBadgeText}>⭐ {t("subscription.subscriberBadge")}</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPadding + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.card }]}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {statsLoading ? "..." : (customerStats?.totalOrders ?? orders.length)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("profile.stats.orders")}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {statsLoading ? "..." : (customerStats?.completedOrders ?? 0)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("profile.stats.completed")}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>{favorites.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("profile.stats.favorites")}</Text>
          </View>
        </View>

        {/* Customer info card */}
        {customerStats !== null && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <MaterialIcons name="account-balance-wallet" size={18} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{t("profile.stats.deliveryFees")}</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {customerStats.totalDeliveryFees.toLocaleString("ar-SY")} ل.س
                </Text>
              </View>
            </View>
            {customerStats.memberSince && (
              <>
                <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                  <MaterialIcons name="calendar-today" size={18} color={colors.primary} />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{t("profile.stats.memberSince")}</Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>
                      {formatDate(customerStats.memberSince)}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {/* Loyalty card */}
        {!isCourier && loyaltyData !== null && (
          <TouchableOpacity
            style={[styles.loyaltyCard, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/loyalty-history")}
            activeOpacity={0.85}
          >
            <View style={styles.loyaltyLeft}>
              <MaterialIcons name="stars" size={28} color="#fff" />
              <View>
                <Text style={styles.loyaltyLabel}>{t("loyalty.balance")}</Text>
                <Text style={styles.loyaltyPoints}>
                  {loyaltyData.balance.toLocaleString()} {t("loyalty.points")}
                </Text>
                {loyaltyData.redeemDiscount > 0 && (
                  <Text style={styles.loyaltyValue}>
                    {t("loyalty.redeemValue", { amount: loyaltyData.redeemDiscount.toLocaleString() })}
                  </Text>
                )}
                {loyaltyData.balance === 0 && (
                  <Text style={styles.loyaltyValue}>{t("loyalty.noPointsHint")}</Text>
                )}
              </View>
            </View>
            <MaterialIcons name="chevron-left" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}

        {/* Wallet card */}
        {!isCourier && walletBalance !== null && (
          <View style={[styles.loyaltyCard, { backgroundColor: "#15803d" }]}>
            <View style={styles.loyaltyLeft}>
              <MaterialIcons name="account-balance-wallet" size={28} color="#fff" />
              <View>
                <Text style={styles.loyaltyLabel}>{t("wallet.balance")}</Text>
                <Text style={styles.loyaltyPoints}>
                  {walletBalance.toLocaleString()} {t("wallet.currency")}
                </Text>
                {walletBalance === 0 && (
                  <Text style={styles.loyaltyValue}>{t("wallet.noBalanceHint")}</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Wallet transactions */}
        {!isCourier && walletTransactions.length > 0 && (
          <View style={[styles.achievementsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.achievementsSectionTitle, { color: colors.foreground }]}>
              {t("wallet.transactionsTitle")}
            </Text>
            {walletTransactions.slice(0, 5).map((tx) => (
              <View key={tx.id} style={[styles.infoRow, { paddingVertical: 8 }]}>
                <MaterialIcons
                  name={tx.amount > 0 ? "add-circle-outline" : "remove-circle-outline"}
                  size={18}
                  color={tx.amount > 0 ? "#16a34a" : "#dc2626"}
                />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                    {tx.type === "referral_commission"
                      ? t("wallet.typeCommission")
                      : tx.type === "order_payment"
                      ? t("wallet.typePayment")
                      : t("wallet.typeAdjustment")}
                  </Text>
                  <Text style={[styles.infoValue, { color: tx.amount > 0 ? "#16a34a" : "#dc2626", fontWeight: "700" }]}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} {t("wallet.currency")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Referral card */}
        {!isCourier && referralCode !== null && (
          <View style={[styles.achievementsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.referralHeader}>
              <MaterialIcons name="card-giftcard" size={22} color={colors.primary} />
              <Text style={[styles.achievementsSectionTitle, { color: colors.foreground, marginBottom: 0, flex: 1, marginLeft: 8 }]}>
                {t("referral.title")}
              </Text>
            </View>

            <Text style={[styles.infoLabel, { color: colors.mutedForeground, marginTop: 12, marginBottom: 6 }]}>
              {t("referral.codeLabel")}
            </Text>
            <View style={styles.referralCodeRow}>
              <Text style={[styles.referralCode, { color: colors.primary, borderColor: colors.primary + "40", backgroundColor: colors.primary + "10" }]}>
                {referralCode}
              </Text>
              <TouchableOpacity
                style={[styles.referralBtn, { backgroundColor: colors.secondary }]}
                onPress={async () => {
                  await Clipboard.setStringAsync(referralCode);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
              >
                <MaterialIcons name={codeCopied ? "check" : "content-copy"} size={18} color={colors.primary} />
                <Text style={[styles.referralBtnText, { color: colors.primary }]}>
                  {codeCopied ? t("referral.copied") : t("referral.copy")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.referralBtn, { backgroundColor: colors.secondary }]}
                onPress={() => {
                  Share.share({ message: `${t("referral.codeLabel")}: ${referralCode}` });
                }}
              >
                <MaterialIcons name="share" size={18} color={colors.primary} />
                <Text style={[styles.referralBtnText, { color: colors.primary }]}>{t("referral.share")}</Text>
              </TouchableOpacity>
            </View>

            {referralStats !== null && (
              <View style={styles.referralStatsRow}>
                <View style={styles.referralStatItem}>
                  <Text style={[styles.referralStatValue, { color: colors.foreground }]}>
                    {referralStats.totalReferrals}
                  </Text>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{t("referral.totalReferrals")}</Text>
                </View>
                <View style={[styles.referralStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.referralStatItem}>
                  <Text style={[styles.referralStatValue, { color: "#16a34a" }]}>
                    {referralStats.totalEarned.toLocaleString()} {t("wallet.currency")}
                  </Text>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{t("referral.totalEarned")}</Text>
                </View>
              </View>
            )}

            <View style={[styles.referralSteps, { backgroundColor: colors.secondary, borderRadius: 12, padding: 12, marginTop: 12 }]}>
              <Text style={[styles.achievementsSectionTitle, { color: colors.foreground, marginBottom: 8, fontSize: 13 }]}>
                {t("referral.howItWorksTitle")}
              </Text>
              {[t("referral.step1"), t("referral.step2"), t("referral.step3")].map((step, i) => (
                <View key={i} style={styles.referralStep}>
                  <View style={[styles.referralStepNum, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{i + 1}</Text>
                  </View>
                  <Text style={[{ color: colors.foreground, fontSize: 13, flex: 1 }]}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Achievements */}
        {!isCourier && achievementsData !== null && (
          <View style={[styles.achievementsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.achievementsSectionTitle, { color: colors.foreground }]}>
              {t("achievements.sectionTitle")}
            </Text>
            <View style={styles.achievementsGrid}>
              {achievementsData.achievements.map((ach) => (
                <View
                  key={ach.key}
                  style={[
                    styles.achievementItem,
                    ach.earned
                      ? { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }
                      : { backgroundColor: colors.secondary, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.achievementIcon, { opacity: ach.earned ? 1 : 0.35 }]}>
                    {ach.icon}
                  </Text>
                  <Text
                    style={[
                      styles.achievementTitle,
                      { color: ach.earned ? colors.foreground : colors.mutedForeground },
                    ]}
                    numberOfLines={2}
                  >
                    {ach.titleAr}
                  </Text>
                  {ach.earned ? (
                    <View style={[styles.earnedBadge, { backgroundColor: colors.primary }]}>
                      <MaterialIcons name="check" size={10} color="#fff" />
                    </View>
                  ) : (
                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            backgroundColor: colors.primary,
                            width: `${Math.round((ach.progress / ach.threshold) * 100)}%` as unknown as number,
                          },
                        ]}
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Courier section */}
        {appLoading ? (
          <View style={[styles.courierCard, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : appStatus === "approved" ? (
          <View style={[styles.courierCard, { backgroundColor: "#F0FFF4", borderColor: "#B0E8C0" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="verified" size={28} color="#4CAF50" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#2E7D32" }]}>
                  {t("profile.courier.sectionTitle")}
                </Text>
                <Text style={[styles.courierCardBody, { color: "#388E3C" }]}>
                  {isCourierMode
                    ? t("profile.courier.badge")
                    : t("profile.courier.switchToCourier")}
                </Text>
              </View>
            </View>
          </View>
        ) : appStatus === "pending" ? (
          <View style={[styles.courierCard, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="hourglass-empty" size={28} color="#D97706" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#92400E" }]}>
                  {t("profile.courier.pendingTitle")}
                </Text>
                <Text style={[styles.courierCardBody, { color: "#78350F" }]}>
                  {t("profile.courier.pendingBody")}
                </Text>
              </View>
            </View>
          </View>
        ) : appStatus === "rejected" ? (
          <View style={[styles.courierCard, { backgroundColor: "#FFF1F2", borderColor: "#FECDD3" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="cancel" size={28} color="#E11D48" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#9F1239" }]}>
                  {t("profile.courier.rejectedTitle")}
                </Text>
                <Text style={[styles.courierCardBody, { color: "#881337" }]}>
                  {application?.adminNote
                    ? t("profile.courier.rejectedBody", { reason: application.adminNote })
                    : t("profile.courier.rejectedBodyNoReason")}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.courierActionBtn, { backgroundColor: "#DC2626" }]}
              onPress={() => router.push("/courier-apply")}
              activeOpacity={0.8}
            >
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.courierActionBtnText}>
                {t("profile.courier.reapplyBtn")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.courierCard, { backgroundColor: "#FFF7F0", borderColor: "#FFD5B0" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="delivery-dining" size={28} color="#DC2626" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#DC2626" }]}>
                  {t("profile.courier.registerTitle")}
                </Text>
                <Text style={[styles.courierCardBody, { color: "#995000" }]}>
                  {t("profile.courier.registerBody")}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.courierActionBtn, { backgroundColor: "#DC2626" }]}
              onPress={() => router.push("/courier-apply")}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add-circle" size={20} color="#fff" />
              <Text style={styles.courierActionBtnText}>
                {t("profile.courier.applyBtn")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu */}
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {menuItems.map((item, idx) => (
            <React.Fragment key={item.label}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIcon, { backgroundColor: item.danger ? "#fff0f0" : colors.secondary }]}>
                  <MaterialIcons
                    name={item.icon}
                    size={20}
                    color={item.danger ? colors.destructive : colors.primary}
                  />
                </View>
                <Text style={[styles.menuLabel, { color: item.danger ? colors.destructive : colors.foreground }]}>
                  {item.label}
                </Text>
                {item.badge !== undefined && (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
              {idx < menuItems.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <MaterialIcons name="logout" size={20} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>
            {t("profile.signOut")}
          </Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: colors.card, borderColor: "#fee2e2", marginTop: 8 }]}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
        >
          <MaterialIcons name="delete-forever" size={20} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>
            {t("profile.deleteAccount")}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          {t("profile.version")}
        </Text>
      </ScrollView>

      {/* Celebration Modal */}
      <Modal
        visible={celebrationAchievement !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCelebrationAchievement(null)}
      >
        <View style={styles.celebrationOverlay}>
          <Animated.View
            style={[
              styles.celebrationCard,
              { backgroundColor: colors.card, transform: [{ scale: celebrationScale }] },
            ]}
          >
            <Text style={styles.celebrationEmoji}>{celebrationAchievement?.icon ?? "🎉"}</Text>
            <Text style={[styles.celebrationTitle, { color: colors.foreground }]}>
              {t("achievements.celebrationTitle")}
            </Text>
            <Text style={[styles.celebrationAchTitle, { color: colors.primary }]}>
              {celebrationAchievement?.titleAr}
            </Text>
            <Text style={[styles.celebrationDesc, { color: colors.mutedForeground }]}>
              {celebrationAchievement?.descriptionAr}
            </Text>
            <TouchableOpacity
              style={[styles.celebrationBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setCelebrationAchievement(null);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.celebrationBtnText}>{t("achievements.close")}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* Edit Name Modal */}
      <Modal
        visible={editNameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditNameVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.editNameSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("profile.editName.title")}</Text>
              <TouchableOpacity onPress={() => setEditNameVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.nameInput, {
                backgroundColor: colors.secondary,
                color: colors.foreground,
                borderColor: colors.border,
              }]}
              value={editNameValue}
              onChangeText={setEditNameValue}
              placeholder={t("profile.editName.placeholder")}
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              maxLength={60}
              textAlign="left"
            />
            <View style={styles.editNameActions}>
              <TouchableOpacity
                style={[styles.editNameCancelBtn, { borderColor: colors.border }]}
                onPress={() => setEditNameVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.editNameCancelText, { color: colors.mutedForeground }]}>{t("profile.editName.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editNameSaveBtn, { backgroundColor: colors.primary, opacity: savingName ? 0.7 : 1 }]}
                onPress={handleSaveName}
                disabled={savingName || !editNameValue.trim()}
                activeOpacity={0.8}
              >
                {savingName
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.editNameSaveText}>{t("profile.editName.save")}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: "center",
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  avatarContainer: { marginBottom: 12, position: "relative" },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  editAvatarOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 32, fontWeight: "800", color: "#fff" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 20, fontWeight: "800", color: "#fff" },
  phone: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  courierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  courierBadgeText: { fontSize: 12, fontWeight: "700", color: "#DC2626" },
  subscriberBadge: {
    marginTop: 6,
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F9A825",
  },
  subscriberBadgeText: { fontSize: 12, fontWeight: "700", color: "#E65100" },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statNum: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 12 },
  statDivider: { width: 1, height: "100%" },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: "600" },
  infoDivider: { height: 1, marginHorizontal: 14 },
  loyaltyCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loyaltyLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  loyaltyLabel: { fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  loyaltyPoints: { fontSize: 20, fontWeight: "900", color: "#fff" },
  loyaltyValue: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  courierCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  courierCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  courierCardText: { flex: 1, gap: 4 },
  courierCardTitle: { fontSize: 15, fontWeight: "700" },
  courierCardBody: { fontSize: 13, lineHeight: 18 },
  courierActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  courierActionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  menuCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: "500", textAlign: "left" },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginRight: 4,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  divider: { height: 1, marginHorizontal: 16 },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  signOutText: { fontSize: 15, fontWeight: "700" },
  version: { textAlign: "center", fontSize: 12, marginTop: 24 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  editNameSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Tajawal_500Medium",
  },
  editNameActions: { flexDirection: "row", gap: 12 },
  editNameCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  editNameCancelText: { fontSize: 15, fontWeight: "600" },
  editNameSaveBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  editNameSaveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  achievementsCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  achievementsSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
  },
  achievementsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  achievementItem: {
    width: "30%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  achievementIcon: {
    fontSize: 26,
  },
  achievementTitle: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 15,
  },
  earnedBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBarBg: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
  },
  celebrationOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  celebrationCard: {
    width: "100%",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  celebrationEmoji: {
    fontSize: 64,
  },
  celebrationTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  celebrationAchTitle: {
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  celebrationDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  celebrationBtn: {
    marginTop: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
  },
  celebrationBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  referralHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  referralCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  referralCode: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 3,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  referralBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  referralBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  referralStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 0,
  },
  referralStatItem: {
    flex: 1,
    alignItems: "center",
  },
  referralStatDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 8,
  },
  referralStatValue: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
  },
  referralSteps: {},
  referralStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  referralStepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
});
