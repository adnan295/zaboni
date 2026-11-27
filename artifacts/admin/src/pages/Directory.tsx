import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DirectoryPlace, type DirectoryPlaceInput } from "@/lib/api";
import { menuFromText, menuToText, parseLocation, parsePastedRows } from "@/lib/directoryText";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ImageUpload";
import LocationPicker from "@/components/LocationPicker";
import { useToast } from "@/hooks/use-toast";

const HOMS: [number, number] = [34.7324, 36.7137];
const CATEGORIES = ["مطعم", "لحّام", "بقالية", "خضرجي", "فرن", "حلويات", "صيدلية", "عطّار", "ألبان وأجبان", "سوبرماركت"];
const textarea = "w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm leading-6";

type Draft = {
  id?: string;
  nameAr: string;
  category: string;
  phone: string;
  district: string;
  lat: number | null;
  lon: number | null;
  logo: string | null;
  menuText: string;
  menuImages: string[];
  isPublished: boolean;
};

const empty: Draft = { nameAr: "", category: "", phone: "", district: "", lat: null, lon: null, logo: null, menuText: "", menuImages: [], isPublished: true };

const toDraft = (p: DirectoryPlace): Draft => ({
  id: p.id, nameAr: p.nameAr, category: p.category, phone: p.phone, district: p.district,
  lat: p.lat, lon: p.lon, logo: p.logo, menuText: menuToText(p.menu), menuImages: p.menuImages, isPublished: p.isPublished,
});

const itemCount = (p: DirectoryPlace) => p.menu.reduce((n, s) => n + s.items.length, 0);

/**
 * «دليل حمص»: the shops a customer can order from without a partner restaurant.
 * A place with a menu gets its menu page in the app; a place without one (a
 * butcher, a grocer…) gets a free-text order page with its pin fixed on the map.
 */
export default function Directory() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: places = [], isLoading } = useQuery({ queryKey: ["admin", "directory"], queryFn: api.getDirectoryPlaces });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "directory"] });
  const save = useMutation({
    mutationFn: (p: DirectoryPlaceInput) => api.saveDirectoryPlaces([p]),
    onSuccess: (r) => {
      if (r.saved) { toast({ title: "انحفظ المحل" }); setEditing(null); refresh(); }
      else toast({ title: "ما انحفظ: تأكد من الاسم والموقع", variant: "destructive" });
    },
    onError: () => toast({ title: "ما انحفظ، جرّب مرة تانية", variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: (p: DirectoryPlace) => api.saveDirectoryPlaces([{ ...p, isPublished: !p.isPublished }]),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDirectoryPlace(id),
    onSuccess: () => { toast({ title: "انحذف المحل" }); refresh(); },
  });

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of places) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [places]);

  const shown = places.filter((p) =>
    (!cat || p.category === cat) &&
    (!q.trim() || `${p.nameAr} ${p.district} ${p.phone}`.includes(q.trim())));

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">دليل حمص</h1>
          <p className="text-sm text-muted-foreground">
            {places.length} محل · {places.filter((p) => p.isPublished).length} ظاهر بالتطبيق
          </p>
        </div>
        <div className="flex gap-2 mr-auto">
          <Button variant="outline" onClick={() => setImportOpen(true)}>استيراد من إكسل</Button>
          <Button onClick={() => setEditing({ ...empty })}>+ محل جديد</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالاسم أو الحي أو الرقم…" className="max-w-xs" />
        <button type="button" onClick={() => setCat(null)} className={`rounded-full px-3 py-1 text-sm border ${!cat ? "bg-primary text-primary-foreground" : ""}`}>الكل</button>
        {categories.map(([c, n]) => (
          <button key={c} type="button" onClick={() => setCat(c === cat ? null : c)} className={`rounded-full px-3 py-1 text-sm border ${cat === c ? "bg-primary text-primary-foreground" : ""}`}>
            {c} ({n})
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-muted-foreground">عم نجيب المحلات…</p> : shown.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          {places.length === 0 ? "لسا ما في محلات. ضيف أول محل أو استورد قائمة من إكسل." : "ما في محلات بهالبحث."}
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {shown.map((p) => (
            <Card key={p.id} className="shadow-sm">
              <CardContent className="py-3 flex flex-wrap items-center gap-3">
                {p.logo
                  ? <img src={p.logo} alt="" className="h-10 w-10 rounded-full object-cover border" />
                  : <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">{p.nameAr.slice(0, 1)}</div>}
                <div className="flex-1 min-w-[180px]">
                  <div className="font-semibold">{p.nameAr}</div>
                  <div className="text-xs text-muted-foreground">
                    {[p.category, p.district, p.phone].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <Badge variant="secondary">{itemCount(p) > 0 ? `منيو: ${itemCount(p)} صنف` : "كتابة حرة"}</Badge>
                <div className="flex items-center gap-1 text-xs">
                  <Switch checked={p.isPublished} onCheckedChange={() => toggle.mutate(p)} />
                  {p.isPublished ? "ظاهر" : "مخفي"}
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(toDraft(p))}>تعديل</Button>
                <Button size="sm" variant="ghost" className="text-red-600"
                  onClick={() => { if (confirm(`تحذف «${p.nameAr}» من الدليل؟`)) remove.mutate(p.id); }}>حذف</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <PlaceForm
          draft={editing}
          busy={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(d) => {
            if (d.lat == null || d.lon == null) { toast({ title: "حدّد موقع المحل عالخريطة", variant: "destructive" }); return; }
            save.mutate({
              id: d.id, nameAr: d.nameAr.trim(), category: d.category.trim(), phone: d.phone.trim(), district: d.district.trim(),
              lat: d.lat, lon: d.lon, logo: d.logo, menu: menuFromText(d.menuText), menuImages: d.menuImages, isPublished: d.isPublished,
            });
          }}
        />
      )}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); refresh(); }} />}
    </div>
  );
}

function PlaceForm({ draft, busy, onClose, onSave }: { draft: Draft; busy: boolean; onClose: () => void; onSave: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [link, setLink] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const linkLoc = link.trim() ? parseLocation(link) : null;
  const sections = menuFromText(d.menuText);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>{d.id ? `تعديل «${draft.nameAr}»` : "محل جديد بالدليل"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>اسم المحل *</Label>
            <Input value={d.nameAr} onChange={(e) => set("nameAr", e.target.value)} placeholder="مثال: لحمة أبو علي" />
          </div>
          <div className="space-y-1">
            <Label>النوع</Label>
            <Input value={d.category} onChange={(e) => set("category", e.target.value)} list="dir-categories" placeholder="لحّام، بقالية، مطعم…" />
            <datalist id="dir-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="space-y-1">
            <Label>الحي</Label>
            <Input value={d.district} onChange={(e) => set("district", e.target.value)} placeholder="الحمرا، الإنشاءات…" />
          </div>
          <div className="space-y-1">
            <Label>رقم المحل</Label>
            <Input value={d.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" placeholder="0944 123 456" />
          </div>
          <div className="space-y-1 flex flex-col justify-end">
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={d.isPublished} onCheckedChange={(v) => set("isPublished", v)} />
              {d.isPublished ? "ظاهر بالتطبيق" : "مخفي (بتكمّلو بعدين)"}
            </div>
          </div>
          <div className="col-span-2">
            <ImageUpload value={d.logo ?? ""} onChange={(url) => set("logo", url || null)} label="لوغو المحل (اختياري)" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>موقع المحل *</Label>
            <div className="flex gap-2">
              <Input value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" placeholder="الصق رابط غوغل ماب أو إحداثيات: 34.7324, 36.7137" />
              <Button type="button" variant="outline" disabled={!linkLoc} onClick={() => { if (linkLoc) { set("lat", linkLoc.lat); set("lon", linkLoc.lon); setLink(""); } }}>
                حطّ الدبوس
              </Button>
            </div>
            {link.trim() && !linkLoc && (
              <p className="text-xs text-amber-700">ما فهمنا الموقع من هالرابط. الروابط القصيرة (maps.app.goo.gl) افتحها أول وانسخ الرابط الطويل، أو كبس عالخريطة تحت.</p>
            )}
            <LocationPicker lat={d.lat} lon={d.lon} center={HOMS} onChange={(lat, lon) => { set("lat", lat); set("lon", lon); }} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>المنيو</Label>
            <textarea className={textarea} dir="rtl" value={d.menuText} onChange={(e) => set("menuText", e.target.value)}
              placeholder={"# مشاوي\nشيش طاووق\nكباب\n\n# مقبلات\nحمص\nمتبل"} />
            <p className="text-xs text-muted-foreground">
              سطر بيبلّش بـ # هو اسم قسم، وكل سطر تحتو صنف. إذا تركتو فاضي، بيطلع للزبون صفحة يكتب فيها طلبو بنفسو (للّحام والبقالية والخضرجي).
              {sections.length > 0 && ` · ${sections.length} قسم، ${sections.reduce((n, s) => n + s.items.length, 0)} صنف`}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={busy || !d.nameAr.trim()} onClick={() => onSave(d)}>{busy ? "عم نحفظ…" : "حفظ"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const rows = useMemo(() => parsePastedRows(text), [text]);
  const good = rows.filter((r) => r.place).map((r) => r.place!);
  const bad = rows.filter((r) => r.error);
  const run = useMutation({
    mutationFn: () => api.saveDirectoryPlaces(good),
    onSuccess: (r) => { toast({ title: `انضاف ${r.saved} محل للدليل` }); onDone(); },
    onError: () => toast({ title: "ما زبط الاستيراد، جرّب مرة تانية", variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader><DialogTitle>استيراد محلات من إكسل</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            اعمل جدول بإكسل أو Google Sheets بهالأعمدة <b>بهالترتيب</b>، حدّد الصفوف كلها وانسخها (Ctrl+C)، والصقها تحت:
          </p>
          <div className="rounded-md bg-muted p-2 font-mono text-xs" dir="rtl">
            الاسم · النوع · الرقم · الحي · الموقع (رابط غوغل ماب أو 34.73, 36.71)
          </div>
          <textarea className={textarea} dir="rtl" value={text} onChange={(e) => setText(e.target.value)} placeholder="الصق الصفوف هون…" />
          {rows.length > 0 && (
            <div className="space-y-1">
              <p><b className="text-green-700">{good.length} جاهز</b>{bad.length > 0 && <> · <b className="text-amber-700">{bad.length} فيه مشكلة</b></>}</p>
              {bad.slice(0, 8).map((r) => <p key={r.line} className="text-xs text-amber-700">السطر {r.line}: {r.error}</p>)}
              <p className="text-xs text-muted-foreground">المحلات بتنضاف بلا منيو (كتابة حرة). المنيو واللوغو بتضيفهن بعدين من «تعديل».</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={good.length === 0 || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "عم نضيف…" : `ضيف ${good.length} محل`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
