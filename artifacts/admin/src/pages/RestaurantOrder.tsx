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

type RestaurantOrderItem = {
  id: string;
  nameAr: string;
  name: string;
  image: string;
  sortOrder: number | null;
  categorySortOrder: number | null;
};

function SortableRow({ item, index }: { item: RestaurantOrderItem; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-white dark:bg-zinc-900 border rounded-lg px-3 py-2 mb-2 cursor-grab active:cursor-grabbing select-none"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-zinc-400 hover:text-zinc-600 text-lg px-1"
      >
        ⠿
      </span>
      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
        {index + 1}
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
      <span className="flex-1 text-sm font-medium text-right">{item.nameAr}</span>
      {item.categorySortOrder === null && (
        <span className="text-xs text-zinc-400 shrink-0">غير مرتّب</span>
      )}
    </div>
  );
}

export default function RestaurantOrderPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [items, setItems] = useState<RestaurantOrderItem[]>([]);
  const [dirty, setDirty] = useState(false);

  const { data: categories = [] } = useQuery<RestaurantCategory[]>({
    queryKey: ["admin", "categories"],
    queryFn: api.getAdminCategories,
  });

  const { data: fetchedItems, isLoading } = useQuery<RestaurantOrderItem[]>({
    queryKey: ["admin", "restaurant-category-order", selectedCategoryId],
    queryFn: () => api.getRestaurantCategoryOrder(selectedCategoryId),
    enabled: !!selectedCategoryId,
  });

  useEffect(() => {
    if (fetchedItems) {
      setItems(fetchedItems);
      setDirty(false);
    }
  }, [fetchedItems]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.saveRestaurantCategoryOrder(
        selectedCategoryId,
        items.map((item, i) => ({ restaurantId: item.id, sortOrder: i }))
      ),
    onSuccess: () => {
      toast({ title: "تم الحفظ", description: "تم حفظ الترتيب بنجاح" });
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "restaurant-category-order", selectedCategoryId] });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

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

  const handleCategoryChange = (id: string) => {
    if (dirty && !confirm("لديك تغييرات غير محفوظة. هل تريد المتابعة؟")) return;
    setSelectedCategoryId(id);
    setItems([]);
    setDirty(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">ترتيب المطاعم حسب التصنيف</h1>
          <p className="text-sm text-zinc-500 mt-1">اسحب المطاعم لتحديد ترتيب ظهورها في كل تصنيف</p>
        </div>
        {dirty && (
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "جاري الحفظ..." : "حفظ الترتيب"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryChange(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
              selectedCategoryId === cat.id
                ? "bg-primary text-white border-primary"
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-primary"
            }`}
          >
            {cat.nameAr}
          </button>
        ))}
      </div>

      {!selectedCategoryId && (
        <div className="text-center py-16 text-zinc-400">
          <div className="text-4xl mb-3">🏷️</div>
          <p>اختر تصنيفاً لترتيب مطاعمه</p>
        </div>
      )}

      {selectedCategoryId && isLoading && (
        <div className="text-center py-16 text-zinc-400">جاري التحميل...</div>
      )}

      {selectedCategoryId && !isLoading && items.length > 0 && (
        <>
          <p className="text-xs text-zinc-400 mb-3">
            {items.length} مطعم · المطاعم غير المرتّبة تظهر بعد المرتّبة
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, index) => (
                <SortableRow key={item.id} item={item} index={index} />
              ))}
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}
