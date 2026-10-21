import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "PLATFORM_ADMIN_EMAIL",
  "PLATFORM_ADMIN_PASSWORD",
  "PLATFORM_ADMIN_BOOTSTRAP_TOKEN",
];

function safeAuthDiagnostic(error) {
  const details = [];
  if (Number.isInteger(error?.status)) details.push(`HTTP ${error.status}`);
  if (typeof error?.code === "string" && /^[a-z0-9_-]{1,80}$/i.test(error.code)) {
    details.push(`code=${error.code}`);
  }
  return details.length ? details.join(", ") : "sem status/código disponível";
}

if (required.some((name) => !process.env[name])) {
  console.error("Defina as credenciais temporárias do bootstrap no ambiente seguro desta execução.");
  process.exitCode = 1;
} else {
  const email = process.env.PLATFORM_ADMIN_EMAIL.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const token = process.env.PLATFORM_ADMIN_BOOTSTRAP_TOKEN;

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    Buffer.byteLength(password, "utf8") < 12 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    !/^[0-9a-f]{64}$/.test(token)
  ) {
    console.error("Os dados temporários de bootstrap estão inválidos.");
    process.exitCode = 1;
  } else {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    try {
      const { error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { platform_admin_bootstrap_token: token },
      });

      if (error) {
        console.error(`Não foi possível criar a conta administrativa (${safeAuthDiagnostic(error)}). Confira a autorização de bootstrap no banco.`);
        process.exitCode = 1;
      } else {
        console.info("Conta administrativa criada. Confirme o vínculo em private.platform_admins antes do primeiro login.");
      }
    } catch {
      console.error("Não foi possível concluir o bootstrap administrativo.");
      process.exitCode = 1;
    }
  }
}
