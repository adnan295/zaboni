import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type User } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Users() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: api.getUsers,
  });

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const customers = users.filter((u) => u.role === "customer").length;
  const couriers = users.filter((u) => u.role === "courier").length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">المستخدمون</h1>

      <div className="flex gap-4">
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-blue-600">{customers}</p>
          <p className="text-xs text-blue-600/70 font-medium">العملاء</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-orange-600">{couriers}</p>
          <p className="text-xs text-orange-600/70 font-medium">المندوبون</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        تُدار صلاحية المندوب عبر صفحة <span className="font-medium">طلبات الانضمام</span>. استخدم تلك الصفحة للموافقة أو الرفض.
      </p>

      <div className="flex gap-3 flex-wrap">
        <Input
          type="search"
          placeholder="ابحث بالاسم أو الهاتف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="كل الأدوار" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأدوار</SelectItem>
            <SelectItem value="customer">عميل</SelectItem>
            <SelectItem value="courier">مندوب</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center">
          {filtered.length} مستخدم
        </span>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">جاري التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">لا يوجد مستخدمون.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-right px-4 py-3 font-medium">الاسم</th>
                <th className="text-right px-4 py-3 font-medium">الهاتف</th>
                <th className="text-right px-4 py-3 font-medium">الدور</th>
                <th className="text-right px-4 py-3 font-medium">تاريخ الانضمام</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserRow({ user }: { user: User }) {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user.name ? user.name.charAt(0).toUpperCase() : "?"}
          </div>
          <span className="font-medium">{user.name || <span className="text-muted-foreground italic">بدون اسم</span>}</span>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs">{user.phone}</td>
      <td className="px-4 py-3">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            user.role === "courier"
              ? "bg-orange-100 text-orange-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {user.role === "courier" ? "🚴 مندوب" : "🛒 عميل"}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(user.createdAt).toLocaleDateString("ar-SY")}
      </td>
    </tr>
  );
}
