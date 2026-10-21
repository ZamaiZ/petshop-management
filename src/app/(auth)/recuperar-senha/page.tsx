import type { Metadata } from "next";
import { RecoverForm } from "@/features/auth/components/recover-form";

export const metadata: Metadata = { title: "Recuperar senha | petshop." };

export default function RecoverPasswordPage() {
  return <RecoverForm />;
}
