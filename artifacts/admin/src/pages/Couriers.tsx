import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Courier } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-muted-foreground text-xs">—</span>;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="flex items-center gap-0.5 text-xs">
      {[...Array(5)].map((_, i) => (
        <span
          key={i}
          className={
            i < full
              ? "text-yellow-400"
              : i === full && half
                ? "text-yellow-300"
                : "text-gray-300"
          }
        >
          ★
        </span>
      ))}
      <span className="ml-1 text-muted-foreground">{rating.toFixed(1)}</span>
    </span>
  );
}

export default function Couriers() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data: couriers = [], isLoading } = useQuery({
    queryKey: ["admin", "couriers"],
    queryFn: api.getCouriers,
    refetchInterval: 30_000,
  });

  const roleMutation = useMutation({
    mutationFn: (id: string) => api.updateUserRole(id, "customer"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "couriers"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const filtered = couriers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search),
  );

  const totalDeliveries = couriers.reduce(
    (sum, c) => sum + (c.deliveredCount ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Couriers</h1>

      <div className="flex gap-4 flex-wrap">
        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-orange-600">{couriers.length}</p>
          <p className="text-xs text-orange-600/70 font-medium">Total Couriers</p>
        </div>
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/40 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-green-600">{totalDeliveries}</p>
          <p className="text-xs text-green-600/70 font-medium">Total Deliveries</p>
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
        <span className="text-sm text-muted-foreground self-center">
          {filtered.length} couriers
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-muted rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/4" />
                    <div className="h-3 bg-muted rounded w-1/6" />
                  </div>
                  <div className="h-4 bg-muted rounded w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No couriers found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Courier</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Delivered</th>
                <th className="text-left px-4 py-3 font-medium">Assigned</th>
                <th className="text-left px-4 py-3 font-medium">Rating</th>
                <th className="text-left px-4 py-3 font-medium">Last Delivery</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((courier) => (
                <CourierRow
                  key={courier.id}
                  courier={courier}
                  onConvert={() => {
                    if (
                      confirm(
                        `Convert "${courier.name || courier.phone}" to customer? They will lose courier access.`,
                      )
                    ) {
                      roleMutation.mutate(courier.id);
                    }
                  }}
                  converting={roleMutation.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CourierRow({
  courier,
  onConvert,
  converting,
}: {
  courier: Courier;
  onConvert: () => void;
  converting: boolean;
}) {
  const successRate =
    courier.totalAssigned > 0
      ? Math.round((courier.deliveredCount / courier.totalAssigned) * 100)
      : null;

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {courier.name ? courier.name.charAt(0).toUpperCase() : "?"}
          </div>
          <span className="font-medium">
            {courier.name || (
              <span className="text-muted-foreground italic">No name</span>
            )}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs">{courier.phone}</td>
      <td className="px-4 py-3">
        <span className="font-bold text-green-600">
          {courier.deliveredCount ?? 0}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span>{courier.totalAssigned ?? 0}</span>
          {successRate !== null && (
            <span className="text-xs text-muted-foreground">({successRate}%)</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <StarRating rating={courier.avgRating} />
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {courier.lastDelivery
          ? new Date(courier.lastDelivery).toLocaleDateString()
          : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(courier.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={converting}
            onClick={onConvert}
          >
            Make Customer
          </Button>
        </div>
      </td>
    </tr>
  );
}
