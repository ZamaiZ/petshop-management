import "server-only";

import { quantityPrecision } from "@/lib/business-rules";
import { createClient } from "@/lib/supabase/server";

export type InventoryProduct = {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  category: string | null;
  unit: string;
  unit_precision: number;
  sale_price_cents: number;
  average_cost_cents: number;
  minimum_stock: number;
  track_lots: boolean;
  quantity: number;
  packagings: { id: string; label: string; barcode: string | null; base_quantity: number }[];
  lots: { id: string; code: string; expires_on: string | null; quantity: number }[];
};

export type InventoryMovement = {
  id: string;
  product_id: string;
  product: string;
  lot_id: string | null;
  quantity_delta: number;
  kind: string;
  reason: string;
  created_at: string;
};

export type InventoryOverview = {
  products: InventoryProduct[];
  movements: InventoryMovement[];
  movementCount: number;
  categories: { id: string; name: string; archived_at: string | null }[];
  suppliers: { id: string; name: string; cnpj: string | null }[];
  openCashSession: string | null;
};

export async function getInventoryOverview(storeId: string) {
  const supabase = await createClient();
  const [productsResult, categoriesResult, suppliersResult, cashResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, brand, sku, barcode, category_id, unit, sale_price_cents, average_cost_cents, minimum_stock, track_lots")
      .eq("store_id", storeId)
      .is("archived_at", null)
      .order("name", { ascending: true })
      .limit(500),
    supabase.from("categories").select("id, name, archived_at").eq("store_id", storeId).order("name"),
    supabase.from("suppliers").select("id, name, cnpj").eq("store_id", storeId).is("archived_at", null).order("name"),
    supabase.from("cash_sessions").select("id").eq("store_id", storeId).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (productsResult.error || categoriesResult.error || suppliersResult.error || cashResult.error) {
    return { data: null, error: "Não foi possível carregar o estoque da loja." };
  }

  const productIds = productsResult.data.map((product) => product.id);
  const [balancesResult, lotsResult, packagingsResult] = productIds.length
    ? await Promise.all([
        supabase.from("inventory_balances").select("product_id, quantity").eq("store_id", storeId).in("product_id", productIds),
        supabase.from("inventory_lots").select("id, product_id, code, expires_on, quantity").eq("store_id", storeId).in("product_id", productIds).order("expires_on", { ascending: true, nullsFirst: false }),
        supabase.from("product_packagings").select("id, product_id, label, barcode, base_quantity").eq("store_id", storeId).in("product_id", productIds).order("label"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const movementsResult = await supabase
    .from("inventory_movements")
    .select("id, product_id, lot_id, quantity_delta, kind, reason, created_at", { count: "exact" })
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(250);

  if (balancesResult.error || lotsResult.error || packagingsResult.error || movementsResult.error) {
    return { data: null, error: "Não foi possível carregar os saldos e movimentações." };
  }

  const categoriesById = new Map(categoriesResult.data.map((category) => [category.id, category]));
  const balances = new Map(balancesResult.data.map((balance) => [balance.product_id, balance.quantity]));
  const lotsByProduct = new Map<string, InventoryProduct["lots"]>();
  const packagingsByProduct = new Map<string, InventoryProduct["packagings"]>();
  for (const packaging of packagingsResult.data) {
    const rows = packagingsByProduct.get(packaging.product_id) ?? [];
    rows.push({ id: packaging.id, label: packaging.label, barcode: packaging.barcode, base_quantity: packaging.base_quantity });
    packagingsByProduct.set(packaging.product_id, rows);
  }
  for (const lot of lotsResult.data) {
    const rows = lotsByProduct.get(lot.product_id) ?? [];
    rows.push({ id: lot.id, code: lot.code, expires_on: lot.expires_on, quantity: lot.quantity });
    lotsByProduct.set(lot.product_id, rows);
  }
  const productNames = new Map(productsResult.data.map((product) => [product.id, product.name]));

  return {
    data: {
      products: productsResult.data.map((product) => ({
        ...product,
        unit_precision: quantityPrecision(product.unit),
        category: product.category_id ? (() => {
          const category = categoriesById.get(product.category_id);
          return category ? `${category.name}${category.archived_at ? " (arquivada)" : ""}` : null;
        })() : null,
        quantity: balances.get(product.id) ?? 0,
        packagings: packagingsByProduct.get(product.id) ?? [],
        lots: lotsByProduct.get(product.id) ?? [],
      })),
      movements: movementsResult.data.map((movement) => ({
        ...movement,
        product: productNames.get(movement.product_id) ?? "Produto arquivado",
      })),
      movementCount: movementsResult.count ?? movementsResult.data.length,
      categories: categoriesResult.data,
      suppliers: suppliersResult.data,
      openCashSession: cashResult.data?.id ?? null,
    } satisfies InventoryOverview,
    error: null,
  };
}
