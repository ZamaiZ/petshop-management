import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";

export const metadata: Metadata = { title: "Redefinir senha | petshop." };

export default function UpdatePasswordPage() {
  return <UpdatePasswordForm />;
}
