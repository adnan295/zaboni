import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Restaurant, type MenuItem, type RestaurantHour } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type RestaurantForm = Omit<Restaurant, "id">;
type MenuItemForm = Omit<MenuItem, "id" | "restaurantId">;

const emptyRestaurant: RestaurantForm = {
  name: "",
  nameAr: "",
  category: "",
  categoryAr: "",
  rating: 0,
  reviewCount: 0,
  deliveryTime: "30-45 دقيقة",
  deliveryFee: 0,
  minOrder: 0,
  image: "",
  tags: [],
  isOpen: true,
  discount: null,
  lat: null,
  lon: null,
};

const emptyMenuItem: MenuItemForm = {
  name: "",
  nameAr: "",
  description: "",
  descriptionAr: "",
  price: 0,
  image: "",
  category: "",
  categoryAr: "",
  isPopular: false,
};

function RestaurantFormDialog({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: RestaurantForm;
  onSave: (data: RestaurantForm) => void;
  saving?: boolean;
}) {
  const [form, setForm] = useState<RestaurantForm>(initial);

  const set = <K extends keyof RestaurantForm>(
    k: K,
    v: RestaurantForm[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial.name ? "Edit Restaurant" : "New Restaurant"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1">
            <Label>Name (EN)</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Restaurant name"
            />
          </div>
          <div className="space-y-1">
            <Label>Name (AR)</Label>
            <Input
              dir="rtl"
              value={form.nameAr}
              onChange={(e) => set("nameAr", e.target.value)}
              placeholder="اسم المطعم"
            />
          </div>
          <div className="space-y-1">
            <Label>Category (EN)</Label>
            <Input
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="e.g. Fast Food"
            />
          </div>
          <div className="space-y-1">
            <Label>Category (AR)</Label>
            <Input
              dir="rtl"
              value={form.categoryAr}
              onChange={(e) => set("categoryAr", e.target.value)}
              placeholder="مثلاً: وجبات سريعة"
            />
          </div>
          <div className="space-y-1">
            <Label>Rating (0–5)</Label>
            <Input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={form.rating}
              onChange={(e) => set("rating", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Review Count</Label>
            <Input
              type="number"
              min={0}
              value={form.reviewCount}
              onChange={(e) => set("reviewCount", parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>Delivery Time</Label>
            <Input
              value={form.deliveryTime}
              onChange={(e) => set("deliveryTime", e.target.value)}
              placeholder="30-45 دقيقة"
            />
          </div>
          <div className="space-y-1">
            <Label>Delivery Fee (ل.س)</Label>
            <Input
              type="number"
              min={0}
              value={form.deliveryFee}
              onChange={(e) =>
                set("deliveryFee", parseFloat(e.target.value) || 0)
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Min Order (ل.س)</Label>
            <Input
              type="number"
              min={0}
              value={form.minOrder}
              onChange={(e) =>
                set("minOrder", parseFloat(e.target.value) || 0)
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Discount (optional)</Label>
            <Input
              value={form.discount ?? ""}
              onChange={(e) => set("discount", e.target.value || null)}
              placeholder="e.g. 20%"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Image URL</Label>
            <Input
              value={form.image}
              onChange={(e) => set("image", e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1">
            <Label>Latitude (خط العرض)</Label>
            <Input
              type="number"
              step="any"
              value={form.lat ?? ""}
              onChange={(e) => set("lat", e.target.value === "" ? null : parseFloat(e.target.value))}
              placeholder="33.5138"
            />
          </div>
          <div className="space-y-1">
            <Label>Longitude (خط الطول)</Label>
            <Input
              type="number"
              step="any"
              value={form.lon ?? ""}
              onChange={(e) => set("lon", e.target.value === "" ? null : parseFloat(e.target.value))}
              placeholder="36.2765"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Tags (comma-separated)</Label>
            <Input
              value={form.tags.join(", ")}
              onChange={(e) => {
                const raw = e.target.value;
                set("tags", raw.split(",").map((t) => t.trim()).filter(Boolean));
              }}
              placeholder="برجر, شاورما, ..."
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              id="isOpen"
              type="checkbox"
              checked={form.isOpen}
              onChange={(e) => set("isOpen", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <Label htmlFor="isOpen">Open for orders</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => onSave(form)}
            disabled={!form.name || !form.nameAr || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MenuDialog({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<MenuItemForm>(emptyMenuItem);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin", "menu", restaurant.id],
    queryFn: () => api.getMenu(restaurant.id),
  });

  const createMutation = useMutation({
    mutationFn: (data: MenuItemForm) =>
      api.createMenuItem(restaurant.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant.id] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setShowForm(false);
      setForm(emptyMenuItem);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ item, data }: { item: MenuItem; data: MenuItemForm }) =>
      api.updateMenuItem(item.restaurantId, item.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant.id] });
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (item: MenuItem) =>
      api.deleteMenuItem(item.restaurantId, item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant.id] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const activeForm = editItem
    ? {
        name: editItem.name,
        nameAr: editItem.nameAr,
        description: editItem.description,
        descriptionAr: editItem.descriptionAr,
        price: editItem.price,
        image: editItem.image,
        category: editItem.category,
        categoryAr: editItem.categoryAr,
        isPopular: editItem.isPopular,
      }
    : form;

  const setActiveForm = (updater: (f: MenuItemForm) => MenuItemForm) => {
    if (editItem) setEditItem((i) => i && { ...i, ...updater(i) });
    else setForm(updater);
  };

  const setField = <K extends keyof MenuItemForm>(k: K, v: MenuItemForm[K]) =>
    setActiveForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Menu —{" "}
            <span dir="rtl" className="font-bold">
              {restaurant.nameAr}
            </span>
          </DialogTitle>
        </DialogHeader>

        {!showForm && !editItem && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 w-fit"
            onClick={() => setShowForm(true)}
          >
            + Add Item
          </Button>
        )}

        {(showForm || editItem) && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/40">
            <h3 className="font-semibold text-sm">
              {editItem ? "Edit Item" : "New Menu Item"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name (EN)</Label>
                <Input
                  value={activeForm.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Name (AR)</Label>
                <Input
                  dir="rtl"
                  value={activeForm.nameAr}
                  onChange={(e) => setField("nameAr", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Category (EN)</Label>
                <Input
                  value={activeForm.category}
                  onChange={(e) => setField("category", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Category (AR)</Label>
                <Input
                  dir="rtl"
                  value={activeForm.categoryAr}
                  onChange={(e) => setField("categoryAr", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Price (ل.س)</Label>
                <Input
                  type="number"
                  min={0}
                  value={activeForm.price}
                  onChange={(e) =>
                    setField("price", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Image URL</Label>
                <Input
                  value={activeForm.image}
                  onChange={(e) => setField("image", e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPopular"
                  checked={activeForm.isPopular}
                  onChange={(e) => setField("isPopular", e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <Label htmlFor="isPopular">Popular item</Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  if (editItem) {
                    updateMutation.mutate({ item: editItem, data: activeForm });
                  } else {
                    createMutation.mutate(form);
                  }
                }}
                disabled={
                  createMutation.isPending ||
                  updateMutation.isPending ||
                  !activeForm.name ||
                  !activeForm.nameAr
                }
              >
                {editItem ? "Update" : "Create"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditItem(null);
                  setForm(emptyMenuItem);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Loading menu...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">
            No menu items yet.
          </p>
        ) : (
          <div className="space-y-2 mt-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 border rounded-lg p-3 bg-card"
              >
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <p
                    className="text-xs text-muted-foreground"
                    dir="rtl"
                  >
                    {item.nameAr} · {item.price.toLocaleString("ar-SY")} ل.س
                  </p>
                </div>
                {item.isPopular && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex-shrink-0">
                    Popular
                  </span>
                )}
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setEditItem(item);
                      setShowForm(false);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${item.name}"?`))
                        deleteMutation.mutate(item);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function HoursDialog({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: initialHours, isLoading } = useQuery({
    queryKey: ["admin", "restaurant-hours", restaurant.id],
    queryFn: () => api.getRestaurantHours(restaurant.id),
  });

  const [hours, setHours] = useState<Omit<RestaurantHour, "id" | "restaurantId">[] | null>(null);

  const normalizeTime = (t: string) => t.slice(0, 5);
  const displayHours = hours ?? (initialHours ? initialHours.map((h) => ({
    dayOfWeek: h.dayOfWeek,
    openTime: normalizeTime(h.openTime),
    closeTime: normalizeTime(h.closeTime),
    isClosed: h.isClosed,
  })) : DAY_NAMES.map((_, i) => ({ dayOfWeek: i, openTime: "09:00", closeTime: "22:00", isClosed: false })));

  const updateHour = (dayOfWeek: number, field: string, value: unknown) => {
    setHours(displayHours.map((h) =>
      h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
    ));
  };

  const saveMutation = useMutation({
    mutationFn: (h: Omit<RestaurantHour, "id" | "restaurantId">[]) =>
      api.updateRestaurantHours(restaurant.id, h),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurant-hours", restaurant.id] });
      qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Working Hours — <span dir="rtl">{restaurant.nameAr}</span>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : (
          <div className="space-y-3 py-2">
            {displayHours.map((h) => (
              <div key={h.dayOfWeek} className="flex items-center gap-3">
                <div className="w-20 text-sm font-medium text-right" dir="rtl">{DAY_NAMES[h.dayOfWeek]}</div>
                <input
                  type="checkbox"
                  checked={h.isClosed}
                  onChange={(e) => updateHour(h.dayOfWeek, "isClosed", e.target.checked)}
                  className="w-4 h-4 accent-red-500"
                  title="Closed all day"
                />
                <span className="text-xs text-muted-foreground w-12">مغلق</span>
                <Input
                  type="time"
                  value={h.openTime}
                  onChange={(e) => updateHour(h.dayOfWeek, "openTime", e.target.value)}
                  disabled={h.isClosed}
                  className="h-8 text-xs w-28"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <Input
                  type="time"
                  value={h.closeTime}
                  onChange={(e) => updateHour(h.dayOfWeek, "closeTime", e.target.value)}
                  disabled={h.isClosed}
                  className="h-8 text-xs w-28"
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => saveMutation.mutate(displayHours)}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending ? "Saving..." : "Save Hours"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Restaurants() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editRestaurant, setEditRestaurant] = useState<Restaurant | null>(null);
  const [menuRestaurant, setMenuRestaurant] = useState<Restaurant | null>(null);
  const [hoursRestaurant, setHoursRestaurant] = useState<Restaurant | null>(null);
  const [search, setSearch] = useState("");

  const { data: restaurants = [], isLoading } = useQuery({
    queryKey: ["admin", "restaurants"],
    queryFn: api.getRestaurants,
  });

  const createMutation = useMutation({
    mutationFn: api.createRestaurant,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Restaurant> }) =>
      api.updateRestaurant(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      setEditRestaurant(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteRestaurant,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const filtered = restaurants.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.nameAr.includes(search),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Restaurants</h1>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setShowForm(true)}
        >
          + Add Restaurant
        </Button>
      </div>

      <Input
        type="search"
        placeholder="Search restaurants..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No restaurants found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Rating</th>
                <th className="text-left px-4 py-3 font-medium">Avg Courier Rating</th>
                <th className="text-left px-4 py-3 font-medium">Fee (ل.س)</th>
                <th className="text-left px-4 py-3 font-medium">Orders</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground" dir="rtl">
                      {r.nameAr}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{r.category}</p>
                    <p className="text-xs text-muted-foreground" dir="rtl">
                      {r.categoryAr}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    ⭐ {r.rating.toFixed(1)}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({r.reviewCount})
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.avgCourierRating != null ? (
                      <span className="flex items-center gap-1 text-xs">
                        {[...Array(5)].map((_, i) => (
                          <span
                            key={i}
                            className={i < Math.floor(r.avgCourierRating!) ? "text-yellow-400" : "text-gray-300"}
                          >★</span>
                        ))}
                        <span className="ml-1 text-muted-foreground">{(r.avgCourierRating as number).toFixed(1)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.deliveryFee === 0
                      ? "Free"
                      : `${r.deliveryFee.toLocaleString("ar-SY")} ل.س`}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-orange-600">
                      {Number(r.ordersCount ?? 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.isOpen ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      {r.isOpen ? "Open" : "Closed"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setMenuRestaurant(r)}
                      >
                        Menu
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setHoursRestaurant(r)}
                      >
                        Hours
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setEditRestaurant(r)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete "${r.name}"? This will also delete all menu items.`,
                            )
                          ) {
                            deleteMutation.mutate(r.id);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <RestaurantFormDialog
          open
          onClose={() => setShowForm(false)}
          initial={emptyRestaurant}
          onSave={(data) => createMutation.mutate(data)}
          saving={createMutation.isPending}
        />
      )}

      {editRestaurant && (
        <RestaurantFormDialog
          open
          onClose={() => setEditRestaurant(null)}
          initial={editRestaurant}
          onSave={(data) =>
            updateMutation.mutate({ id: editRestaurant.id, data })
          }
          saving={updateMutation.isPending}
        />
      )}

      {menuRestaurant && (
        <MenuDialog
          restaurant={menuRestaurant}
          onClose={() => setMenuRestaurant(null)}
        />
      )}

      {hoursRestaurant && (
        <HoursDialog
          restaurant={hoursRestaurant}
          onClose={() => setHoursRestaurant(null)}
        />
      )}
    </div>
  );
}
