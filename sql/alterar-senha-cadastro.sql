-- Execute no SQL Editor do Supabase como postgres, depois das migrations.
-- Substitua somente o texto entre os delimitadores por 16 a 72 bytes UTF-8.
-- Se a senha contiver $petshop$, use outro delimitador nos dois lados.
-- A função grava somente o hash da senha de autorização e invalida tickets pendentes.
-- Não altera senhas de contas existentes. Mantenha o segredo real fora deste arquivo e do Git.
begin;
select private.set_signup_password($petshop$SUBSTITUA_POR_UMA_SENHA_FORTE$petshop$);
commit;
