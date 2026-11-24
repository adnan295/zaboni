import React, { useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import PlaceLogo from "@/components/PlaceLogo";

export interface BookletSection {
  title: string;
  items: string[];
}

interface Props {
  name: string;
  logo?: string | null;
  subtitle?: string;
  menu: BookletSection[];
  /** Tapping a dish adds it to the order. */
  onAddItem: (item: string) => void;
  height?: number;
}

/** Long sections continue on the next page instead of overflowing one. */
const ITEMS_PER_PAGE = 9;

type Page =
  | { kind: "cover" }
  | { kind: "section"; title: string; items: string[]; part: number; parts: number };

export function paginateMenu(menu: BookletSection[], perPage = ITEMS_PER_PAGE): Page[] {
  const pages: Page[] = [{ kind: "cover" }];
  for (const s of menu) {
    const parts = Math.max(1, Math.ceil(s.items.length / perPage));
    for (let i = 0; i < parts; i++) {
      pages.push({ kind: "section", title: s.title, items: s.items.slice(i * perPage, (i + 1) * perPage), part: i + 1, parts });
    }
  }
  return pages;
}

const PAPER = "#fffaf0";
const INK = "#3b2f2f";
const ACCENT = "#b91c1c";
const RULE = "#e7d8bd";

/**
 * The place's menu as a little booklet: a cover with its logo, then one page per
 * section, flipped with a swipe or the arrows. Built from the menu photo the
 * field team took — so every place reads the same way, however its paper menu
 * looked.
 */
export default function MenuBooklet({ name, logo, subtitle, menu, onAddItem, height = 440 }: Props) {
  const pages = useMemo(() => paginateMenu(menu), [menu]);
  const [page, setPage] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const pageRef = useRef(0);
  pageRef.current = page;

  // One page at a time, slid in from the side it comes from. A horizontal
  // ScrollView pages the wrong way in right-to-left layouts on some platforms.
  const goTo = (target: number) => {
    const next = Math.min(Math.max(target, 0), pages.length - 1);
    if (next === pageRef.current) return;
    const forward = next > pageRef.current;
    // Arabic books turn to the left: the next page comes in from the left.
    slide.setValue(forward ? -60 : 60);
    setPage(next);
    Animated.spring(slide, { toValue: 0, useNativeDriver: Platform.OS !== "web", speed: 18, bounciness: 4 }).start();
  };
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_e, g) => {
      if (g.dx > 50) goToRef.current(pageRef.current + 1);      // swipe right → next (Arabic page turn)
      else if (g.dx < -50) goToRef.current(pageRef.current - 1);
    },
  })).current;

  const add = (item: string) => {
    onAddItem(item);
    setFlash(item);
    setTimeout(() => setFlash((f) => (f === item ? null : f)), 900);
  };

  const p = pages[Math.min(page, pages.length - 1)];

  return (
    <View style={{ gap: 10 }}>
      <View style={{ height, padding: 4 }} {...swipe.panHandlers}>
        <Animated.View style={[styles.paper, { transform: [{ translateX: slide }] }]}>
          <View style={styles.frame}>
            {p.kind === "cover" ? (
              <View style={styles.cover}>
                <PlaceLogo logo={logo} name={name} size={96} />
                <Text style={styles.coverName}>{name}</Text>
                {subtitle ? <Text style={styles.coverSub}>{subtitle}</Text> : null}
                <View style={styles.ornament}>
                  <View style={styles.ornLine} />
                  <Text style={styles.ornText}>المنيو</Text>
                  <View style={styles.ornLine} />
                </View>
                {pages.length > 1 ? (
                  <TouchableOpacity onPress={() => goTo(1)} style={styles.openBtn}>
                    <Text style={styles.openText}>افتح المنيو</Text>
                    <MaterialIcons name="chevron-left" size={18} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.coverHint}>ما في أصناف مكتوبة لهالمحل</Text>
                )}
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <View style={styles.pageHead}>
                  <View style={styles.ornLine} />
                  <Text style={styles.pageTitle} numberOfLines={1}>
                    {p.title || "أصناف"}{p.parts > 1 ? ` (${p.part}/${p.parts})` : ""}
                  </Text>
                  <View style={styles.ornLine} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  {p.items.map((item, ii) => (
                    <TouchableOpacity
                      key={`${page}-${ii}-${item}`}
                      onPress={() => add(item)}
                      activeOpacity={0.6}
                      style={[styles.row, flash === item && styles.rowFlash]}
                      accessibilityLabel={`أضف ${item}`}
                    >
                      <Text style={styles.item} numberOfLines={2}>{item}</Text>
                      <View style={styles.dots} />
                      <View style={styles.addBtn}>
                        <MaterialIcons name={flash === item ? "check" : "add"} size={16} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <Text style={styles.pageNo}>{page + 1} / {pages.length}</Text>
          </View>
        </Animated.View>
      </View>

      {pages.length > 1 && (
        <View style={styles.nav}>
          <TouchableOpacity onPress={() => goTo(page - 1)} disabled={page === 0} style={[styles.navBtn, page === 0 && styles.navOff]} accessibilityLabel="الصفحة السابقة">
            <MaterialIcons name="chevron-right" size={22} color={INK} />
          </TouchableOpacity>
          <View style={styles.dotsRow}>
            {pages.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => goTo(i)} hitSlop={6}>
                <View style={[styles.dot, i === page && styles.dotOn]} />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => goTo(page + 1)} disabled={page === pages.length - 1} style={[styles.navBtn, page === pages.length - 1 && styles.navOff]} accessibilityLabel="الصفحة التالية">
            <MaterialIcons name="chevron-left" size={22} color={INK} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    flex: 1, overflow: "hidden", backgroundColor: PAPER, borderRadius: 16, padding: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
    borderWidth: 1, borderColor: RULE,
  },
  frame: { flex: 1, borderWidth: 1.5, borderColor: RULE, borderRadius: 10, padding: 16, paddingBottom: 26 },
  cover: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  coverName: { fontSize: 24, fontWeight: "800", color: INK, textAlign: "center" },
  coverSub: { fontSize: 13, color: "#7c6a58", textAlign: "center" },
  coverHint: { fontSize: 12, color: "#9c8b77", marginTop: 6 },
  openBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: ACCENT, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginTop: 8 },
  openText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  ornament: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, alignSelf: "stretch" },
  ornLine: { flex: 1, height: 1, backgroundColor: RULE },
  ornText: { fontSize: 15, fontWeight: "800", color: ACCENT, letterSpacing: 1 },
  pageHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  pageTitle: { fontSize: 18, fontWeight: "800", color: ACCENT, maxWidth: "70%", textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8 },
  rowFlash: { backgroundColor: "#fde7c7" },
  item: { fontSize: 15, color: INK, flexShrink: 1 },
  dots: { flex: 1, borderBottomWidth: 1.5, borderStyle: "dotted", borderColor: "#d6c4a3", marginTop: 8, minWidth: 12 },
  addBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  pageNo: { position: "absolute", bottom: 6, alignSelf: "center", fontSize: 11, color: "#9c8b77" },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: PAPER, borderWidth: 1, borderColor: RULE },
  navOff: { opacity: 0.35 },
  dotsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center", flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: RULE },
  dotOn: { backgroundColor: ACCENT, width: 18 },
});
