"use client";

import { useState } from "react";
import { LuMoon, LuSun } from "react-icons/lu";
import { Button } from "@/components/ui/button";

function readTheme() {
  return document.cookie.match(/(?:^|;\s*)petshop-theme=(system|light|dark)(?:;|$)/)?.[1] ?? "system";
}

export function AuthThemeToggle() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && (readTheme() === "dark" || (readTheme() === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)));

  function toggleTheme() {
    const nextDark = !dark;
    const nextTheme = nextDark ? "dark" : "light";
    setDark(nextDark);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.classList.toggle("dark", nextDark);
    document.cookie = `petshop-theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Ativar tema ${dark ? "claro" : "escuro"}`} onClick={toggleTheme}>
      {dark ? <LuSun aria-hidden="true" /> : <LuMoon aria-hidden="true" />}
    </Button>
  );
}
