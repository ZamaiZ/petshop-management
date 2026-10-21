-- EXECUTAR MANUALMENTE NO SQL EDITOR DO SUPABASE COMO postgres.
-- Substitua somente o texto abaixo por uma senha de 16 a 72 bytes (UTF-8).
-- A função gera um hash bcrypt com salt novo e invalida tickets ainda não usados.
-- A senha pessoal das contas existentes NÃO é alterada.
-- Não coloque a senha real em git, prints, logs ou tickets de suporte.
begin;
select private.set_signup_password('SUBSTITUA_POR_UMA_SENHA_FORTE');
commit;
-- O placeholder é rejeitado de propósito. Execute este arquivo após as migrations.
-- Não há senha padrão embutida na aplicação ou no SQL.
