import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type HomeSectionItem, type Restaurant } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Section = "popular" | "deals";

const SECTION_LABELS: Record<Section, { label: string; icon: string }> = {
  popular: { label: "مشهور عندنا", icon: "⭐" },
  deals: { label: "خصومات حصرية", icon: "🏷️" },
};

function SortableRow({
  item,
  index,
  onRemove,
}: {
  item: HomeSectionItem;
  index: number;
  onRemove: (restaurantId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.restaurantId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-white dark:bg-zinc-900 border rounded-lg px-3 py-2 mb-2"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-zinc-400 hover:text-zinc-600 text-lg px-1 cursor-grab active:cursor-grabbing select-none"
      >
        ⠿
      </span>
      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
        {index + 1}
      </span>
      {item.restaurantImage ? (
        <img
          src={item.restaurantImage}
          alt=""
          className="w-9 h-9 rounded-md object-cover shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="w-9 h-9 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-base shrink-0">
          🍽️
        </div>
      )}
      <span className="flex-1 text-sm font-medium text-right">{item.restaurantNameAr}</span>
      <span className="text-xs text-zinc-400 shrink-0">{item.restaurantName}</span>
      <button
        onClick={() => onRemove(item.restaurantId)}
        className="text-red-500 hover:text-red-700 text-sm px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950 transition-colors shrink-0"
        title="حذف"
      >
        ✕
      </button>
    </div>
  );
}

function AddRestaurantModal({
  section,
  existingIds,
  onClose,
  onAdd,
}: {
  section: Section;
  existingIds: Set<string>;
  onClose: () => void;
  onAdd: (restaurantId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: restaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ["admin", "restaurants"],
    queryFn: api.getRestaurants,
    staleTime: 60_000,
  });

  const filtered = restaurants.filter(
    (r) =>
      !existingIds.has(r.id) &&
      (r.nameAr.includes(search) || r.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-base text-right">
            إضافة مطعم — {SECTION_LABELS[section].label}
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg">✕</button>
        </div>
        <div className="px-4 py-3 border-b">
          <input
            type="text"
            placeholder="بحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm text-right bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
            dir="rtl"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-zinc-400 py-8">لا توجد مطاعم</p>
          )}
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => { onAdd(r.id); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors mb-1 text-right"
            >
              {r.image ? (
                <img
                  src={r.image}
                  alt=""
                  className="w-9 h-9 rounded-md object-cover shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-9 h-9 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-base shrink-0">
                  🍽️
                </div>
              )}
              <div className="flex-1 text-right">
                <p className="text-sm font-medium">{r.nameAr}</p>
                <p className="text-xs text-zinc-400">{r.name}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionTab({ section }: { section: Section }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery<HomeSectionItem[]>({
    queryKey: ["admin", "home-sections", section],
    queryFn: () => api.getHomeSectionItems(section),
    staleTime: 30_000,
  });

  const [localItems, setLocalItems] = useState<HomeSectionItem[] | null>(null);
  const displayItems = localItems ?? items;

  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const addMutation = useMutation({
    mutationFn: (restaurantId: string) => api.addHomeSectionItem(section, restaurantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "home-sections", section] });
      setLocalItems(null);
      toast({ title: "تمت الإضافة" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (restaurantId: string) => api.removeHomeSectionItem(section, restaurantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "home-sections", section] });
      setLocalItems(null);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const handleRemove = useCallback(
    (restaurantId: string) => {
      setLocalItems((prev) => (prev ?? items).filter((i) => i.restaurantId !== restaurantId));
      removeMutation.mutate(restaurantId);
    },
    [items, removeMutation]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const current = localItems ?? items;
      const oldIdx = current.findIndex((i) => i.restaurantId === active.id);
      const newIdx = current.findIndex((i) => i.restaurantId === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      setLocalItems(arrayMove(current, oldIdx, newIdx));
    },
    [localItems, items]
  );

  const handleSaveOrder = useCallback(async () => {
    if (!localItems) return;
    setSaving(true);
    try {
      await api.reorderHomeSectionItems(
        section,
        localItems.map((item, idx) => ({ restaurantId: item.restaurantId, sortOrder: idx }))
      );
      qc.invalidateQueries({ queryKey: ["admin", "home-sections", section] });
      setLocalItems(null);
      toast({ title: "تم حفظ الترتيب" });
    } catch (e) {
      toast({ title: "خطأ في الحفظ", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [localItems, section, qc, toast]);

  const existingIds = new Set(displayItems.map((i) => i.restaurantId));
  const hasChanges = localItems !== null;

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-zinc-500">{displayItems.length} مطعم</span>
        <div className="flex gap-2">
          {hasChanges && (
            <Button size="sm" onClick={handleSaveOrder} disabled={saving}>
              {saving ? "جاري الحفظ..." : "💾 حفظ الترتيب"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            + إضافة مطعم
          </Button>
        </div>
      </div>

      {displayItems.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          <p className="text-4xl mb-3">{SECTION_LABELS[section].icon}</p>
          <p className="text-sm">لا توجد مطاعم في هذا القسم بعد</p>
          <p className="text-xs mt-1">اضغط «إضافة مطعم» للبدء</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={displayItems.map((i) => i.restaurantId)}
            strategy={verticalListSortingStrategy}
          >
            {displayItems.map((item, idx) => (
              <SortableRow
                key={item.restaurantId}
                item={item}
                index={idx}
                onRemove={handleRemove}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {showAdd && (
        <AddRestaurantModal
          section={section}
          existingIds={existingIds}
          onClose={() => setShowAdd(false)}
          onAdd={(id) => addMutation.mutate(id)}
        />
      )}
    </div>
  );
}

export default function HomeSections() {
  const [activeSection, setActiveSection] = useState<Section>("popular");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 text-right">أقسام الصفحة الرئيسية</h1>
      <p className="text-sm text-zinc-500 mb-6 text-right">
        أضف المطاعم لكل قسم واسحب لإعادة الترتيب — التغييرات تظهر فوراً في التطبيق
      </p>

      <div className="flex gap-2 mb-2">
        {(Object.entries(SECTION_LABELS) as [Section, { label: string; icon: string }][]).map(
          ([key, { label, icon }]) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                activeSection === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          )
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border p-4 min-h-64">
        <SectionTab key={activeSection} section={activeSection} />
      </div>
    </div>
  );
}
