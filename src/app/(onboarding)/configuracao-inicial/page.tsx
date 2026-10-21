import type { Metadata } from "next";
import { Suspense } from "react";
import { StoreSetupForm } from "@/features/onboarding/components/store-setup-form";
import { requirePendingStoreSetupContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Configuração inicial", robots: { index: false, follow: false } };

export default function StoreSetupPage() {
  return <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}><PendingStoreSetupPage /></Suspense>;
}

async function PendingStoreSetupPage() {
  await requirePendingStoreSetupContext();
  return <StoreSetupForm />;
}
