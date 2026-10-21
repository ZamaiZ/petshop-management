import type { Metadata } from "next";
import { CustomerLoadError, CustomerView } from "@/features/customers/components/customer-view";
import { getCustomers } from "@/features/customers/queries";
import { requireUserContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage() {
  const context = await requireUserContext();
  const result = await getCustomers(context.store.id);
  if (!result.data) return <CustomerLoadError message={result.error ?? "Tente novamente."} />;
  return <CustomerView customers={result.data} />;
}
