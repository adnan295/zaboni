import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: api.getUsers,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "customer" | "courier" }) =>
      api.updateUserRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
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
      <h1 className="text-2xl font-bold">Users</h1>

      <div className="flex gap-4">
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-blue-600">{customers}</p>
          <p className="text-xs text-blue-600/70 font-medium">Customers</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-orange-600">{couriers}</p>
          <p className="text-xs text-orange-600/70 font-medium">Couriers</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          type="search"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="courier">Courier</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center">
          {filtered.length} users
        </span>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No users found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                <th className="text-right px-4 py-3 font-medium">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onRoleChange={(role) =>
                    roleMutation.mutate({ id: user.id, role })
                  }
                  loading={roleMutation.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  onRoleChange,
  loading,
}: {
  user: User;
  onRoleChange: (role: "customer" | "courier") => void;
  loading: boolean;
}) {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user.name ? user.name.charAt(0).toUpperCase() : "?"}
          </div>
          <span className="font-medium">{user.name || <span className="text-muted-foreground italic">No name</span>}</span>
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
          {user.role === "courier" ? "🚴 Courier" : "🛒 Customer"}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 justify-end">
          {user.role === "customer" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={loading}
              onClick={() => onRoleChange("courier")}
            >
              Make Courier
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={loading}
              onClick={() => onRoleChange("customer")}
            >
              Make Customer
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
