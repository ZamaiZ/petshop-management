export type ApplicationAudience = "panel" | "admin";

function parseApplicationUrl(value: string | undefined) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function getApplicationUrl(audience: ApplicationAudience) {
  if (audience === "admin") {
    return parseApplicationUrl(process.env.ADMIN_APP_URL);
  }

  const configuredPanelUrl = parseApplicationUrl(process.env.PANEL_APP_URL);
  if (configuredPanelUrl) return configuredPanelUrl;
  if (process.env.NODE_ENV === "production") return null;

  return parseApplicationUrl(process.env.NEXT_PUBLIC_SITE_URL)
    ?? parseApplicationUrl("http://localhost:3000");
}

export function getApplicationAudience(host: string | null | undefined): ApplicationAudience | null {
  if (!host) return null;
  const normalizedHost = host.trim().toLowerCase();
  const panelHost = getApplicationUrl("panel")?.host.toLowerCase();
  const adminHost = getApplicationUrl("admin")?.host.toLowerCase();

  if (!panelHost || (adminHost && adminHost === panelHost)) return null;
  if (adminHost && normalizedHost === adminHost) return "admin";
  if (normalizedHost === panelHost) return "panel";
  return null;
}

export function getRequestAudience(request: Request) {
  try {
    const requestHost = request.headers.get("host")?.trim();
    return getApplicationAudience(requestHost || new URL(request.url).host);
  } catch {
    return null;
  }
}

export function requireApplicationUrl(audience: ApplicationAudience) {
  const url = getApplicationUrl(audience);
  if (!url) throw new Error(`${audience === "admin" ? "ADMIN_APP_URL" : "PANEL_APP_URL"} is missing or invalid.`);
  return url;
}
