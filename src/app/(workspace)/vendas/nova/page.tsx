import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  redirect(params.entrega === "1" ? "/vendas?nova=1&entrega=1" : "/vendas?nova=1");
}
