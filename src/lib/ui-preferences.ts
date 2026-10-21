export type Theme = "system" | "light" | "dark";

export const THEME_COOKIE_NAME = "petshop-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === "false";
}

export function writeBrowserPreferenceCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}
