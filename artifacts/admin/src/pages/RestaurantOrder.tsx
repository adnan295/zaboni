import { useState, useCallback, useEffect } from "react";
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
import { api, type RestaurantCategory } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const ALL_TAB = "__all__";

type BaseItem = {
  id: string;
  nameAr: string;
  name: string;
  image: string;
  sortOrder: number | null;
};

type CategoryItem = BaseItem & { categorySortOrder: number | null };

function SortableRow({
  item,
  index,
  isAll,
  excluded,
  onToggleExclusion,
  togglingId,
}: {
  item: BaseItem | CategoryItem;
  index: number;
  isAll: boolean;
  excluded: boolean;
  onToggleExclusion: (id: string, excluded: boolean) => void;
  togglingId: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const unsorted = isAll
    ? item.sortOrder === null
    : (item as CategoryItem).categorySortOrder === null;

  const isToggling = togglingId === item.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 border rounded-lg px-3 py-2 mb-2 select-none transition-colors ${
        excluded
          ? "bg-zinc-50 dark:bg-zinc-900/40 opacity-60 border-dashed"
          : "bg-white dark:bg-zinc-900 cursor-grab active:cursor-grabbing"
      }`}
    >
      <span
        {...(excluded ? {} : { ...attributes, ...listeners })}
        className={`text-zinc-400 hover:text-zinc-600 text-lg px-1 ${excluded ? "cursor-default" : ""}`}
      >
        ⠿
      </span>
      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
        {excluded ? "—" : index + 1}
      </span>
      {item.image ? (
        <img
          src={item.image}
          alt=""
          className="w-8 h-8 rounded-md object-cover shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="w-8 h-8 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-base shrink-0">
          🍽️
        </div>
      )}
      <span className={`flex-1 text-sm font-medium text-right ${excluded ? "line-through text-zinc-400" : ""}`}>
        {item.nameAr}
      </span>
      {!isAll && (
        <button
          onClick={() => onToggleExclusion(item.id, excluded)}
          disabled={isToggling}
          title={excluded ? "إظهار في هذا التصنيف" : "إخفاء من هذا التصنيف"}
          className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full border transition-colors text-base ${
            excluded
              ? "border-green-300 bg-green-50 hover:bg-green-100 text-green-600"
              : "border-zinc-200 hover:border-red-300 hover:bg-red-50 text-zinc-400 hover:text-red-500"
          } ${isToggling ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
        >
          {excluded ? "👁" : "🚫"}
        </button>
      )}
      {!excluded && unsorted && (
        <span className="text-xs text-zinc-400 shrink-0">غير مرتّب</span>
      )}
    </div>
  );
}

export default function RestaurantOrderPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<string>(ALL_TAB);
  const [items, setItems] = useState<(BaseItem | CategoryItem)[]>([]);
  const [dirty, setDirty] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isAllTab = selectedTab === ALL_TAB;

  const { data: categories = [] } = useQuery<RestaurantCategory[]>({
    queryKey: ["admin", "categories"],
    queryFn: api.getAdminCategories,
  });

  const { data: globalItems, isLoading: globalLoading } = useQuery<BaseItem[]>({
    queryKey: ["admin", "restaurant-global-order"],
    queryFn: api.getRestaurantGlobalOrder,
    enabled: isAllTab,
  });

  const { data: categoryItems, isLoading: categoryLoading } = useQuery<CategoryItem[]>({
    queryKey: ["admin", "restaurant-category-order", selectedTab],
    queryFn: () => api.getRestaurantCategoryOrder(selectedTab),
    enabled: !isAllTab && !!selectedTab,
  });

  const { data: exclusions = [] } = useQuery<string[]>({
    queryKey: ["admin", "category-exclusions", selectedTab],
    queryFn: () => api.getCategoryExclusions(selectedTab),
    enabled: !isAllTab && !!selectedTab,
  });

  const isLoading = isAllTab ? globalLoading : categoryLoading;

  useEffect(() => {
    const data = isAllTab ? globalItems : categoryItems;
    if (data) {
      setItems(data);
      setDirty(false);
    }
  }, [globalItems, categoryItems, isAllTab]);

  const saveGlobalMutation = useMutation({
    mutationFn: () =>
      api.saveRestaurantGlobalOrder(
        items.map((item, i) => ({ restaurantId: item.id, sortOrder: i }))
      ),
    onSuccess: () => {
      toast({ title: "تم الحفظ", description: "تم حفظ الترتيب العام بنجاح" });
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "restaurant-global-order"] });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: () =>
      api.saveRestaurantCategoryOrder(
        selectedTab,
        items
          .filter((item) => !exclusions.includes(item.id))
          .map((item, i) => ({ restaurantId: item.id, sortOrder: i }))
      ),
    onSuccess: () => {
      toast({ title: "تم الحفظ", description: "تم حفظ الترتيب بنجاح" });
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "restaurant-category-order", selectedTab] });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const isPending = isAllTab ? saveGlobalMutation.isPending : saveCategoryMutation.isPending;

  const handleSave = () => {
    if (isAllTab) saveGlobalMutation.mutate();
    else saveCategoryMutation.mutate();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setDirty(true);
  }, []);

  const handleTabChange = (id: string) => {
    if (dirty && !confirm("لديك تغييرات غير محفوظة. هل تريد المتابعة؟")) return;
    setSelectedTab(id);
    setItems([]);
    setDirty(false);
  };

  const handleToggleExclusion = async (restaurantId: string, isExcluded: boolean) => {
    setTogglingId(restaurantId);
    try {
      if (isExcluded) {
        await api.removeCategoryExclusion(selectedTab, restaurantId);
        toast({ title: "تم الإظهار", description: "المطعم سيظهر في هذا التصنيف" });
      } else {
        await api.addCategoryExclusion(selectedTab, restaurantId);
        toast({ title: "تم الإخفاء", description: "المطعم لن يظهر في هذا التصنيف" });
      }
      qc.invalidateQueries({ queryKey: ["admin", "category-exclusions", selectedTab] });
    } catch (e) {
      toast({ title: "خطأ", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const visibleItems = isAllTab ? items : items.filter((i) => !exclusions.includes(i.id));
  const hiddenItems = isAllTab ? [] : items.filter((i) => exclusions.includes(i.id));
  const hiddenCount = hiddenItems.length;

  return (
    <div className="p-6 max-w-2xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">ترتيب المطاعم</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {isAllTab
              ? "اسحب المطاعم لتحديد ترتيب ظهورها"
              : "اسحب لترتيب المطاعم · اضغط 🚫 لإخفاء مطعم من هذا التصنيف"}
          </p>
        </div>
        {dirty && (
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "جاري الحفظ..." : "حفظ الترتيب"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => handleTabChange(ALL_TAB)}
          className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
            selectedTab === ALL_TAB
              ? "bg-primary text-white border-primary"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-primary"
          }`}
        >
          الكل (الترتيب العام)
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleTabChange(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              selectedTab === cat.id
                ? "bg-primary text-white border-primary"
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-primary"
            }`}
          >
            {cat.nameAr}
          </button>
        ))}
      </div>

      {isAllTab && !isLoading && items.length === 0 && (
        <div className="text-center py-16 text-zinc-400">
          <div className="text-4xl mb-3">↕️</div>
          <p>جاري التحميل...</p>
        </div>
      )}

      {!isAllTab && !selectedTab && (
        <div className="text-center py-16 text-zinc-400">
          <div className="text-4xl mb-3">🏷️</div>
          <p>اختر تصنيفاً لترتيب مطاعمه</p>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-16 text-zinc-400">جاري التحميل...</div>
      )}

      {!isLoading && items.length > 0 && (
        <>
          <p className="text-xs text-zinc-400 mb-3">
            {visibleItems.length} مطعم ظاهر
            {hiddenCount > 0 && ` · ${hiddenCount} مخفي`}
            {isAllTab
              ? " · الترتيب العام يُطبّق على تبويب الكل في التطبيق"
              : " · المطاعم غير المرتّبة تظهر بعد المرتّبة (ثم حسب الترتيب العام)"}
          </p>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {visibleItems.map((item, index) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  index={index}
                  isAll={isAllTab}
                  excluded={false}
                  onToggleExclusion={handleToggleExclusion}
                  togglingId={togglingId}
                />
              ))}
            </SortableContext>
          </DndContext>

          {hiddenItems.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-2">
                <span>مخفية من هذا التصنيف</span>
                <span className="bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">{hiddenCount}</span>
              </p>
              {hiddenItems.map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  index={-1}
                  isAll={false}
                  excluded={true}
                  onToggleExclusion={handleToggleExclusion}
                  togglingId={togglingId}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
