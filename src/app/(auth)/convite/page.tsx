import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitationAcceptanceForm } from "@/features/auth/components/invitation-acceptance-form";

export const metadata: Metadata = {
  title: "Aceitar convite",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  return <Suspense fallback={<div className="h-56" aria-busy="true" />}><ResolvedInvitationPage searchParams={searchParams} /></Suspense>;
}

async function ResolvedInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const invitationToken = typeof token === "string" && /^[0-9a-f]{64}$/.test(token) ? token : "";
  return <InvitationAcceptanceForm token={invitationToken} />;
}
