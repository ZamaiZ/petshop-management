import { NextResponse, type NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth/context";
import { getRequestAudience } from "@/lib/platform-access/hosts";
import { createClient } from "@/lib/supabase/server";

const contentTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function notFound() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(request: NextRequest) {
  if (getRequestAudience(request) !== "panel") return notFound();

  const context = await getUserContext();
  if (!context?.store.logo_path) return notFound();
  const path = context.store.logo_path;
  if (!path.startsWith(`${context.store.id}/logos/`) || path.includes("..")) return notFound();

  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  const contentType = contentTypes[extension];
  if (!contentType) return notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("store-assets").download(path);
  if (error || !data) return notFound();

  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="petshop-logo.${extension}"`,
    },
  });
}
