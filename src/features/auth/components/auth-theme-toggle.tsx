"use client";

import { useState } from "react";
import { LuMoon, LuSun } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { parseTheme, THEME_COOKIE_MAX_AGE, THEME_COOKIE_NAME, writeBrowserPreferenceCookie } from "@/lib/ui-preferences";

function readTheme() {
  const value = document.cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE_NAME}=(system|light|dark)(?:;|$)`))?.[1];
  return parseTheme(value);
}

export function AuthThemeToggle() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && (readTheme() === "dark" || (readTheme() === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)));

  function toggleTheme() {
    const nextDark = !dark;
    const nextTheme = nextDark ? "dark" : "light";
    setDark(nextDark);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.classList.toggle("dark", nextDark);
    writeBrowserPreferenceCookie(THEME_COOKIE_NAME, nextTheme, THEME_COOKIE_MAX_AGE);
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Ativar tema ${dark ? "claro" : "escuro"}`} onClick={toggleTheme}>
      {dark ? <LuSun aria-hidden="true" /> : <LuMoon aria-hidden="true" />}
    </Button>
  );
}
