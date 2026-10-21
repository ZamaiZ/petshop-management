import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getPostLoginDestination } from "@/lib/auth/destination";
import { getAccessContext } from "@/lib/auth/context";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return <Suspense fallback={<div className="h-48" aria-busy="true" />}><ResolvedLoginPage /></Suspense>;
}

async function ResolvedLoginPage() {
  const access = await getAccessContext();
  const destination = access ? getPostLoginDestination(access, "panel") : null;
  if (destination) redirect(destination);
  return <LoginForm audience="panel" />;
}
