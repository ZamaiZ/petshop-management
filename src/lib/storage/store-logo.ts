import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

function detectImage(bytes: Uint8Array) {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { mime: "image/png", extension: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === "VP8X") {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { mime: "image/webp", extension: "webp", width, height };
    }
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      return { mime: "image/webp", extension: "webp", width, height };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { mime: "image/webp", extension: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { mime: "image/jpeg", extension: "jpg", height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
      }
      offset += length;
    }
  }
  return null;
}

export async function uploadStoreLogoForTenant(
  supabase: SupabaseClient<Database>,
  storeId: string,
  file: File,
  previousPath: string | null,
) {
  if (file.size < 1 || file.size > 2 * 1024 * 1024) {
    return { ok: false as const, message: "Escolha uma imagem de até 2 MB." };
  }

  const fileBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(fileBuffer);
  const image = detectImage(bytes);
  if (
    !image ||
    (file.type && file.type !== image.mime) ||
    image.width < 1 || image.height < 1 ||
    image.width > 4096 || image.height > 4096 ||
    image.width * image.height > 16_777_216
  ) {
    return { ok: false as const, message: "Envie uma imagem PNG, JPEG ou WebP válida, com até 4096 px por lado." };
  }

  const path = `${storeId}/logos/${crypto.randomUUID()}.${image.extension}`;
  const { error: uploadError } = await supabase.storage
    .from("store-assets")
    .upload(path, fileBuffer, { contentType: image.mime, cacheControl: "3600", upsert: false });
  if (uploadError) console.error("[store-logo] Storage upload failed", uploadError.toJSON());
  if (uploadError) return { ok: false as const, message: "Não foi possível enviar a imagem. Confira o acesso da loja ao armazenamento." };

  const { error: updateError } = await supabase.from("stores").update({ logo_path: path }).eq("id", storeId);
  if (updateError) {
    await supabase.storage.from("store-assets").remove([path]);
    return { ok: false as const, message: "A imagem foi enviada, mas não foi possível associá-la à loja." };
  }

  if (previousPath) await supabase.storage.from("store-assets").remove([previousPath]);
  return { ok: true as const };
}
