import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { MutationFeedbackProvider } from "@/components/feedback/mutation-feedback";
import { THEME_COOKIE_NAME } from "@/lib/ui-preferences";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "petshop. | Gestão", template: "%s · petshop." },
  description: "Gestão de vendas, estoque, agenda e financeiro para pet shops.",
};

const themeScript = `(()=>{const e=document.documentElement;const m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE_NAME}=(system|light|dark)(?:;|$)/);const t=m?.[1]||"system";e.dataset.theme=t;const q=matchMedia("(prefers-color-scheme: dark)");const a=()=>e.classList.toggle("dark",t==="dark"||(t==="system"&&q.matches));a();if(t==="system")q.addEventListener("change",a)})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="system" className={`${inter.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans"><MutationFeedbackProvider>{children}</MutationFeedbackProvider></body>
    </html>
  );
}
