# Bootstrap do administrador da plataforma

Este procedimento autoriza manualmente contas de admin no Supabase. O painel não cria nem promove administradores.

## Primeiro administrador

1. Execute `sql/preflight-platform-access.sql` em modo somente leitura. Revise as lojas sem exatamente uma membership ativa, usuários vinculados a mais de uma loja e contas Auth sem loja. Corrija a ambiguidade de ownership antes da migration; contas Auth sem loja permanecem sem acesso até serem promovidas explicitamente como admin ou tratadas pelo operador.
2. Aplique a migration de acesso à plataforma em uma janela coordenada com a publicação do app. Ela mantém locks sobre Auth, lojas e memberships até concluir, pausando novos cadastros/provisionamentos nesse intervalo; também interrompe se uma loja não tiver exatamente uma membership ativa ou se uma conta estiver em mais de uma loja.
3. Gere 32 bytes aleatórios fora do repositório e represente-os como 64 caracteres hexadecimais minúsculos. Guarde o token temporariamente em um gerenciador seguro e calcule seu SHA-256 em hexadecimal. Não use uma senha humana nem reutilize credenciais; a autorização expira em 30 minutos.
4. No Supabase SQL Editor, como operador confiável, autorize o e-mail exato e registre somente o hash do segredo. Use um endereço controlado pela equipe e não coloque e-mail pessoal ou segredo no repositório:

   ```sql
   insert into private.platform_admin_bootstrap_emails (email, token_hash, expires_at)
   values (
     lower(trim('SUBSTITUA_PELO_EMAIL_ADMIN')),
     lower('COLE_AQUI_O_SHA256_DO_SEGREDO'),
     now() + interval '30 minutes'
   )
   on conflict (email) do update set
     token_hash = excluded.token_hash,
     expires_at = excluded.expires_at,
     created_at = now();
   ```

5. Em um terminal controlado, injete temporariamente `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` e `PLATFORM_ADMIN_BOOTSTRAP_TOKEN` pelo gerenciador seguro usado pela equipe. Execute `node scripts/bootstrap-platform-admin.mjs`. O script usa o Supabase Auth Admin API e envia `platform_admin_bootstrap_token` como metadado temporário. O trigger compara o hash, consome a autorização e remove a chave antes de persistir o usuário. Não coloque os valores em argumentos de comando, arquivo versionado ou log, e não faça signup público para esse bootstrap.
6. Confirme a associação:

   ```sql
   select a.user_id, u.email, a.created_at
   from private.platform_admins a
   join auth.users u on u.id = a.user_id
   where lower(trim(u.email)) = lower(trim('SUBSTITUA_PELO_EMAIL_ADMIN'));
   ```

7. Configure `PANEL_APP_URL` e `ADMIN_APP_URL` no ambiente. No desenvolvimento, use `http://localhost:PORT` e `http://admin.localhost:PORT`; em produção, use os hosts canônicos do painel e do admin. Mantenha `NEXT_PUBLIC_SITE_URL` alinhada com o painel.
8. Nas URLs permitidas de callback do Supabase Auth, inclua `{PANEL_APP_URL}/auth/callback` e `{ADMIN_APP_URL}/auth/callback`. Entre em `ADMIN_APP_URL` com essa conta.
9. Remova as variáveis temporárias de bootstrap do ambiente e apague o segredo guardado temporariamente assim que a consulta confirmar a associação.

Configure também `SIGNUP_RATE_LIMIT_SECRET` com pelo menos 32 bytes aleatórios; o nome permanece por compatibilidade, mas agora protege tentativas de aceitação de convite. Em produção, `TRUSTED_CLIENT_IP_HEADER` é obrigatório: escolha um cabeçalho de IP que a infraestrutura de entrada sobrescreva e impeça o cliente de escolher. Sem IP confiável, o fluxo falha fechado. Em desenvolvimento, o limite é aplicado por token de convite.

O trigger só aceita e-mail e segredo correspondentes uma vez. Se a conta Auth for criada com e-mail diferente, não tente contornar o gate: corrija a autorização no SQL Editor antes de criar a conta. O arquivo `sql/alterar-senha-cadastro.sql` está aposentado e não deve ser executado.

## Adicionar ou remover outro administrador

Não há tela para essa operação. Para uma conta Auth que já existe, promova somente o usuário conferido:

```sql
insert into private.platform_admins (user_id)
select id
from auth.users
where lower(trim(email)) = lower(trim('SUBSTITUA_PELO_EMAIL'));
```

Para remover a autorização administrativa, confira primeiro que outro admin ativo continuará disponível e remova somente a linha correspondente:

```sql
delete from private.platform_admins
where user_id = (
  select id from auth.users
  where lower(trim(email)) = lower(trim('SUBSTITUA_PELO_EMAIL'))
);
```

Para criar uma conta Auth nova, use o fluxo de bootstrap acima, que autoriza o e-mail por 30 minutos e cria o vínculo administrativo no trigger. O cadastro pelo Dashboard sem essa autorização é bloqueado pelo trigger. Não exclua a conta Auth como forma de desativar admin. Não use `user_metadata`, alteração no browser ou hostname para conceder acesso. Guarde o resultado da operação no registro operacional interno da equipe, fora deste repositório.
