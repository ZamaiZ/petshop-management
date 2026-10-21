"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/context";
import { hasValidQuantityPrecision, parseQuantityForUnit, quantityPrecision } from "@/lib/business-rules";
import { parseMoneyToCents, parseQuantity } from "@/lib/inputs";
import { createClient } from "@/lib/supabase/server";

const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500),
  brand: z.string().trim().max(100),
  sku: z.string().trim().max(80),
  barcode: z.string().trim().max(80),
  categoryId: z.union([z.string().uuid(), z.literal("")]),
  unit: z.enum(["un", "kg", "g", "L", "ml", "pacote", "caixa"]),
  minimumStock: z.string().trim().max(40),
  trackLots: z.boolean(),
  salePrice: z.string().trim().min(1).max(40),
  averageCost: z.string().trim().min(1).max(40),
});

const receiptSchema = z.object({
  key: z.string().uuid(),
  supplierId: z.union([z.string().uuid(), z.literal("")]),
  dueOn: z.union([z.string().date(), z.literal("")]),
  payNow: z.boolean(),
  method: z.enum(["cash", "pix", "debit_card", "credit_card", "transfer"]),
  sessionId: z.string().uuid().nullable(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    packages: z.number().positive().max(100000),
    conversionFactor: z.number().positive().max(100000),
    totalCostCents: z.number().int().nonnegative().max(100000000000),
    lotCode: z.string().trim().max(120),
    expiresOn: z.union([z.string().date(), z.literal("")]),
  })).min(1).max(200),
});

function businessError(message: string) {
  if (message.includes("insufficient_cash")) return "O caixa não tem saldo suficiente para esse pagamento.";
  if (message.includes("lot_required")) return "Informe o código do lote para este produto.";
  if (message.includes("lot_expiration_mismatch")) return "Esse código de lote já existe com outra validade.";
  if (message.includes("inventory_changed_during_count")) return "O estoque mudou durante a contagem. Inicie uma nova contagem.";
  if (message.includes("insufficient_stock")) return "A quantidade informada excede o saldo disponível.";
  if (message.includes("idempotency_payload_mismatch")) return "Esta operação já foi enviada com outros dados. Atualize a tela e tente novamente.";
  if (message.includes("bulk_lot_tracking_mismatch")) return "Os dois produtos precisam usar o mesmo controle de lote para preservar a validade.";
  if (message.includes("bulk_lot_expiration_mismatch")) return "O produto a granel já possui um lote com código e validade diferentes.";
  if (message.includes("product_stock_not_empty")) return "Zere o estoque físico antes de arquivar este produto.";
  return "Não foi possível concluir a operação. Revise os dados e tente novamente.";
}

export async function createCategory(name: string) {
  const parsedName = z.string().trim().min(1).max(100).safeParse(name);
  if (!parsedName.success) return { ok: false, message: "Informe o nome da categoria." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({ store_id: context.store.id, name: parsedName.data });
  if (error) return { ok: false, message: "Não foi possível criar a categoria. Confira se já existe." };
  revalidatePath("/estoque");
  return { ok: true };
}

export async function updateCategory(input: unknown) {
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(100) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe o nome da categoria." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").update({ name: parsed.data.name }).eq("store_id", context.store.id).eq("id", parsed.data.id).select("id").maybeSingle();
  if (error) return { ok: false, message: error.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível atualizar a categoria." };
  if (!data) return { ok: false, message: "Categoria não encontrada." };
  revalidatePath("/estoque");
  return { ok: true };
}

export async function archiveCategory(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Categoria inválida." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").update({ archived_at: new Date().toISOString() }).eq("store_id", context.store.id).eq("id", parsed.data).is("archived_at", null).select("id").maybeSingle();
  if (error) return { ok: false, message: "Não foi possível arquivar a categoria." };
  if (!data) return { ok: false, message: "Categoria não encontrada ou já arquivada." };
  revalidatePath("/estoque");
  return { ok: true };
}

export async function restoreCategory(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Categoria inválida." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").update({ archived_at: null }).eq("store_id", context.store.id).eq("id", parsed.data).not("archived_at", "is", null).select("id").maybeSingle();
  if (error) return { ok: false, message: error.code === "23505" ? "Já existe uma categoria ativa com esse nome." : "Não foi possível reativar a categoria." };
  if (!data) return { ok: false, message: "Categoria não encontrada ou já ativa." };
  revalidatePath("/estoque");
  return { ok: true };
}

export async function createProduct(input: unknown) {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira os dados do produto." };
  const salePriceCents = parseMoneyToCents(parsed.data.salePrice);
  const averageCostCents = parseMoneyToCents(parsed.data.averageCost);
  const minimumStock = parseQuantityForUnit(parsed.data.minimumStock || "0", parsed.data.unit);
  if (salePriceCents === null || averageCostCents === null || minimumStock === null) {
    return { ok: false, message: "Informe preços e estoque mínimo válidos." };
  }
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    store_id: context.store.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    brand: parsed.data.brand || null,
    sku: parsed.data.sku || null,
    barcode: parsed.data.barcode || null,
    category_id: parsed.data.categoryId || null,
    unit: parsed.data.unit,
    unit_precision: quantityPrecision(parsed.data.unit),
    sale_price_cents: salePriceCents,
    average_cost_cents: averageCostCents,
    minimum_stock: minimumStock,
    track_lots: parsed.data.trackLots,
  });
  if (error) return { ok: false, message: error.code === "23505" ? "SKU ou código de barras já cadastrado." : "Não foi possível salvar o produto." };
  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateProduct(input: unknown) {
  const parsed = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500),
    brand: z.string().trim().max(100),
    sku: z.string().trim().max(80),
    barcode: z.string().trim().max(80),
    categoryId: z.union([z.string().uuid(), z.literal("")]),
    salePrice: z.string().trim().min(1).max(40),
    minimumStock: z.string().trim().max(40),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira os dados do produto." };
  const salePriceCents = parseMoneyToCents(parsed.data.salePrice);
  if (salePriceCents === null) return { ok: false, message: "Informe valores válidos para o preço." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const productResult = await supabase.from("products").select("id, unit").eq("store_id", context.store.id).eq("id", parsed.data.id).is("archived_at", null).maybeSingle();
  if (productResult.error || !productResult.data) return { ok: false, message: "Produto não encontrado." };
  const minimumStock = parseQuantityForUnit(parsed.data.minimumStock || "0", productResult.data.unit);
  if (minimumStock === null) return { ok: false, message: `O estoque mínimo precisa respeitar a unidade ${productResult.data.unit}.` };
  const { data, error } = await supabase.from("products").update({
    name: parsed.data.name,
    description: parsed.data.description || null,
    brand: parsed.data.brand || null,
    sku: parsed.data.sku || null,
    barcode: parsed.data.barcode || null,
    category_id: parsed.data.categoryId || null,
    sale_price_cents: salePriceCents,
    minimum_stock: minimumStock,
  }).eq("store_id", context.store.id).eq("id", parsed.data.id).is("archived_at", null).select("id").maybeSingle();
  if (error) return { ok: false, message: error.code === "23505" ? "SKU ou código de barras já cadastrado." : "Não foi possível atualizar o produto." };
  if (!data) return { ok: false, message: "Produto não encontrado." };
  for (const path of ["/estoque", "/dashboard", "/vendas"]) revalidatePath(path);
  return { ok: true };
}

export async function archiveProduct(productId: string) {
  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { ok: false, message: "Produto inválido." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_product", { p_store: context.store.id, p_product: parsed.data });
  if (error) return { ok: false, message: businessError(error.message) };
  for (const path of ["/estoque", "/dashboard", "/vendas"]) revalidatePath(path);
  return { ok: true };
}

export async function saveProductPackaging(input: unknown) {
  const parsed = z.object({
    packagingId: z.string().uuid().nullable(),
    productId: z.string().uuid(),
    label: z.string().trim().min(1).max(80),
    barcode: z.string().trim().max(128),
    baseQuantity: z.string().trim().min(1).max(40),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira o nome, a conversão e o código de barras." };
  const baseQuantity = parseQuantity(parsed.data.baseQuantity);
  if (baseQuantity === null || baseQuantity <= 0) return { ok: false, message: "Informe uma conversão maior que zero." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data: product, error: productError } = await supabase.from("products").select("id, unit").eq("store_id", context.store.id).eq("id", parsed.data.productId).is("archived_at", null).maybeSingle();
  if (productError || !product) return { ok: false, message: "O produto não está disponível." };
  const precision = quantityPrecision(product.unit);
  if (!hasValidQuantityPrecision(baseQuantity, product.unit)) return { ok: false, message: `A conversão precisa respeitar a precisão da unidade ${product.unit} (${precision} casas decimais).` };
  const values = { label: parsed.data.label, barcode: parsed.data.barcode || null, base_quantity: baseQuantity };
  const { error } = parsed.data.packagingId
    ? await supabase.from("product_packagings").update(values).eq("store_id", context.store.id).eq("product_id", product.id).eq("id", parsed.data.packagingId)
    : await supabase.from("product_packagings").insert({ ...values, store_id: context.store.id, product_id: product.id });
  if (error) return { ok: false, message: error.code === "23505" ? "Esse código de barras já está cadastrado no catálogo." : "Não foi possível cadastrar a embalagem." };
  revalidatePath("/estoque");
  revalidatePath("/vendas");
  return { ok: true };
}

export async function deleteProductPackaging(productId: string, packagingId: string) {
  const parsed = z.object({ productId: z.string().uuid(), packagingId: z.string().uuid() }).safeParse({ productId, packagingId });
  if (!parsed.success) return { ok: false, message: "Embalagem inválida." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.from("product_packagings").delete().eq("store_id", context.store.id).eq("product_id", parsed.data.productId).eq("id", parsed.data.packagingId);
  if (error) return { ok: false, message: "Não foi possível remover a embalagem." };
  revalidatePath("/estoque");
  revalidatePath("/vendas");
  return { ok: true };
}

export async function adjustStock(input: { productId: string; counted: string; reason: string; lotId: string | null; key: string }) {
  const parsed = z.object({
    productId: z.string().uuid(),
    counted: z.string().trim().min(1).max(40),
    reason: z.string().trim().min(1).max(500),
    lotId: z.string().uuid().nullable(),
    key: z.string().uuid(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Informe uma quantidade e um motivo." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data: product, error: productError } = await supabase.from("products").select("id, unit").eq("store_id", context.store.id).eq("id", parsed.data.productId).is("archived_at", null).maybeSingle();
  if (productError || !product) return { ok: false, message: "O produto não está disponível." };
  const counted = parseQuantityForUnit(parsed.data.counted, product.unit);
  if (counted === null) return { ok: false, message: `Informe uma quantidade válida para a unidade ${product.unit}.` };
  const { error } = await supabase.rpc("adjust_stock", {
    p_store: context.store.id,
    p_product: parsed.data.productId,
    p_counted: counted,
    p_reason: parsed.data.reason,
    p_key: parsed.data.key,
    p_lot: parsed.data.lotId,
  });
  if (error) return { ok: false, message: businessError(error.message) };
  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function convertToBulk(input: unknown) {
  const parsed = z.object({
    sourceProductId: z.string().uuid(),
    targetProductId: z.string().uuid(),
    sourceQuantity: z.string().trim().min(1).max(40),
    targetPerSource: z.string().trim().min(1).max(40),
    reason: z.string().trim().min(1).max(500),
    key: z.string().uuid(),
  }).safeParse(input);
  if (!parsed.success || parsed.data.sourceProductId === parsed.data.targetProductId) return { ok: false, message: "Selecione dois produtos diferentes e confira a conversão." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data: products, error: productsError } = await supabase.from("products").select("id, unit").eq("store_id", context.store.id).in("id", [parsed.data.sourceProductId, parsed.data.targetProductId]).is("archived_at", null);
  if (productsError || products?.length !== 2) return { ok: false, message: "Os produtos da conversão não estão disponíveis." };
  const sourceProduct = products.find((product) => product.id === parsed.data.sourceProductId);
  const targetProduct = products.find((product) => product.id === parsed.data.targetProductId);
  const sourceQuantity = sourceProduct ? parseQuantityForUnit(parsed.data.sourceQuantity, sourceProduct.unit) : null;
  const targetPerSource = targetProduct ? parseQuantityForUnit(parsed.data.targetPerSource, targetProduct.unit) : null;
  if (sourceQuantity === null || sourceQuantity <= 0 || targetPerSource === null || targetPerSource <= 0
    || !hasValidQuantityPrecision(sourceQuantity * targetPerSource, targetProduct?.unit ?? "un")) {
    return { ok: false, message: "Informe quantidades válidas para as unidades dos produtos." };
  }
  const { error } = await supabase.rpc("convert_to_bulk", {
    p_store: context.store.id,
    p_source_product: parsed.data.sourceProductId,
    p_target_product: parsed.data.targetProductId,
    p_source_quantity: sourceQuantity,
    p_target_per_source: targetPerSource,
    p_reason: parsed.data.reason,
    p_key: parsed.data.key,
  });
  if (error) return { ok: false, message: businessError(error.message) };
  for (const path of ["/estoque", "/dashboard", "/vendas"]) revalidatePath(path);
  return { ok: true };
}

export async function startInventoryCount(notes = "") {
  const context = await getUserContext();
  if (!context) return { ok: false as const, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { data: countId, error } = await supabase.rpc("start_inventory_count", {
    p_store: context.store.id,
    p_notes: notes.slice(0, 1000),
  });
  if (error || !countId) return { ok: false as const, message: "Não foi possível iniciar a contagem." };

  const { data: items, error: itemsError } = await supabase
    .from("inventory_count_items")
    .select("id, product_id, lot_id, expected_quantity, counted_quantity, balance_version")
    .eq("store_id", context.store.id)
    .eq("count_id", countId)
    .order("product_id", { ascending: true });
  if (itemsError) return { ok: false as const, message: "A contagem foi iniciada, mas não foi possível carregar seus itens." };

  const productIds = [...new Set(items.map((item) => item.product_id))];
  const lotIds = [...new Set(items.map((item) => item.lot_id).filter((id): id is string => Boolean(id)))];
  const [productsResult, lotsResult] = await Promise.all([
    supabase.from("products").select("id, name, unit").eq("store_id", context.store.id).in("id", productIds),
    lotIds.length ? supabase.from("inventory_lots").select("id, code").eq("store_id", context.store.id).in("id", lotIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsResult.error || lotsResult.error) return { ok: false as const, message: "A contagem foi iniciada, mas não foi possível carregar os itens." };
  const products = new Map(productsResult.data.map((product) => [product.id, product]));
  const lots = new Map(lotsResult.data.map((lot) => [lot.id, lot.code]));
  return {
    ok: true as const,
    countId,
    lines: items.map((item) => ({
      itemId: item.id,
      productId: item.product_id,
      product: products.get(item.product_id)?.name ?? "Produto",
      unit: products.get(item.product_id)?.unit ?? "un",
      precision: quantityPrecision(products.get(item.product_id)?.unit ?? "un"),
      lotId: item.lot_id,
      lotCode: item.lot_id ? lots.get(item.lot_id) ?? "Lote" : null,
      expected: item.expected_quantity,
      counted: item.counted_quantity,
      balanceVersion: item.balance_version,
    })),
  };
}

export async function completeInventoryCount(countId: string, lines: { itemId: string; counted: number }[], key: string) {
  const parsed = z.object({
    countId: z.string().uuid(),
    key: z.string().uuid(),
    lines: z.array(z.object({ itemId: z.string().uuid(), counted: z.number().finite().nonnegative().max(100000000) })).max(5000),
  }).safeParse({ countId, lines, key });
  if (!parsed.success || new Set(lines.map((line) => line.itemId)).size !== lines.length) {
    return { ok: false, message: "Confira as quantidades da contagem." };
  }
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const itemIds = parsed.data.lines.map((line) => line.itemId);
  const { data: countItems, error: countItemsError } = await supabase.from("inventory_count_items")
    .select("id, product_id").eq("store_id", context.store.id).eq("count_id", parsed.data.countId).in("id", itemIds);
  if (countItemsError || countItems?.length !== itemIds.length) return { ok: false, message: "A contagem mudou. Atualize os itens antes de salvar." };
  const productIds = [...new Set(countItems.map((item) => item.product_id))];
  const { data: products, error: productsError } = await supabase.from("products").select("id, unit").eq("store_id", context.store.id).in("id", productIds);
  if (productsError || !products) return { ok: false, message: "Não foi possível conferir as unidades dos produtos." };
  const unitByProduct = new Map(products.map((product) => [product.id, product.unit]));
  const productByItem = new Map(countItems.map((item) => [item.id, item.product_id]));
  if (parsed.data.lines.some((line) => {
    const unit = unitByProduct.get(productByItem.get(line.itemId) ?? "");
    return !unit || !hasValidQuantityPrecision(line.counted, unit);
  })) return { ok: false, message: "Há quantidades que não respeitam a precisão da unidade do produto." };
  const { error: saveError } = await supabase.rpc("save_inventory_count", {
    p_store: context.store.id,
    p_count: parsed.data.countId,
    p_lines: parsed.data.lines.map((line) => ({ item_id: line.itemId, counted_quantity: line.counted })),
  });
  if (saveError) return { ok: false, message: businessError(saveError.message) };
  const { error: applyError } = await supabase.rpc("apply_inventory_count", {
    p_store: context.store.id,
    p_count: parsed.data.countId,
    p_key: parsed.data.key,
  });
  if (applyError) return { ok: false, message: businessError(applyError.message) };
  revalidatePath("/estoque");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function receiveGoods(input: unknown) {
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira os dados do recebimento." };
  if (parsed.data.payNow && parsed.data.method === "cash" && !parsed.data.sessionId) {
    return { ok: false, message: "Abra o caixa antes de pagar em dinheiro." };
  }
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const productIds = [...new Set(parsed.data.items.map((item) => item.productId))];
  const { data: products, error: productsError } = await supabase.from("products").select("id, unit").eq("store_id", context.store.id).in("id", productIds).is("archived_at", null);
  if (productsError || products?.length !== productIds.length) return { ok: false, message: "Há produtos indisponíveis neste recebimento." };
  const unitByProduct = new Map(products.map((product) => [product.id, product.unit]));
  if (parsed.data.items.some((item) => {
    const unit = unitByProduct.get(item.productId);
    const quantity = item.packages * item.conversionFactor;
    return !unit || !hasValidQuantityPrecision(item.packages, "un")
      || !hasValidQuantityPrecision(item.conversionFactor, unit)
      || !hasValidQuantityPrecision(quantity, unit);
  })) return { ok: false, message: "Confira as unidades e quantidades dos itens recebidos." };
  const { error } = await supabase.rpc("receive_goods", {
    p_store: context.store.id,
    p_supplier: parsed.data.supplierId || null,
    p_items: parsed.data.items.map((item) => ({
      product_id: item.productId,
      packages: item.packages,
      conversion_factor: item.conversionFactor,
      total_cost_cents: item.totalCostCents,
      lot_code: item.lotCode || null,
      expires_on: item.expiresOn || null,
    })),
    p_key: parsed.data.key,
    p_due: parsed.data.dueOn || null,
    p_pay_now: parsed.data.payNow,
    p_method: parsed.data.method,
    p_session: parsed.data.sessionId,
  });
  if (error) return { ok: false, message: businessError(error.message) };
  revalidatePath("/estoque");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}
