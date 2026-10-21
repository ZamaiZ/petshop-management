import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import AuthLayout from "@/app/(auth)/layout";
import { getPostLoginDestination } from "@/lib/auth/destination";
import { getAccessContext } from "@/lib/auth/context";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Administração · Entrar", robots: { index: false, follow: false } };

export default function PlatformAdminLoginPage() {
  return <Suspense fallback={<div className="h-48" aria-busy="true" />}><ResolvedPlatformAdminLoginPage /></Suspense>;
}

async function ResolvedPlatformAdminLoginPage() {
  const access = await getAccessContext();
  const destination = access ? getPostLoginDestination(access, "admin") : null;
  if (destination) redirect(destination);
  return <AuthLayout audience="admin"><LoginForm audience="admin" /></AuthLayout>;
}
