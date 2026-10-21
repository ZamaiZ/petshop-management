# Recuperação operacional do owner

Não há transferência de ownership na interface nesta versão. Não excluir a loja, os dados ou a conta Auth durante uma recuperação.

## Recuperar a mesma conta

Priorize restaurar acesso à conta Auth que já possui a membership owner. O fluxo normal de redefinição usa o serviço de e-mail do Supabase; se esse serviço não estiver configurado, um operador autorizado deve usar o procedimento de recuperação de conta disponível no Supabase Dashboard, sem compartilhar senha ou token em canal público.

## Transferir para um employee existente

Use transferência somente após identificar o pet shop e confirmar a identidade do employee que assumirá a gestão. Execute em transação como operador confiável. Substitua os dois UUIDs pelos valores conferidos antes de executar:

```sql
begin;

-- Confirme que os UUIDs apontam para memberships da mesma loja e papéis esperados.
select store_id, user_id, role, active
from public.store_memberships
where store_id = 'SUBSTITUA_UUID_DA_LOJA'::uuid
  and user_id in ('SUBSTITUA_UUID_OWNER_ATUAL'::uuid, 'SUBSTITUA_UUID_EMPLOYEE'::uuid)
for update;

-- Desativa o acesso do owner anterior e promove o employee existente.
update public.store_memberships
set active = false, role = 'employee'
where store_id = 'SUBSTITUA_UUID_DA_LOJA'::uuid
  and user_id = 'SUBSTITUA_UUID_OWNER_ATUAL'::uuid
  and role = 'owner'
  and active;

update public.store_memberships
set active = true, role = 'owner'
where store_id = 'SUBSTITUA_UUID_DA_LOJA'::uuid
  and user_id = 'SUBSTITUA_UUID_EMPLOYEE'::uuid
  and role = 'employee'
  and active;

-- Não confirme a transação se esta consulta não retornar exatamente 1.
select count(*) as active_owner_count
from public.store_memberships
where store_id = 'SUBSTITUA_UUID_DA_LOJA'::uuid
  and role = 'owner'
  and active;

commit;
```

Se as linhas, papéis ou contagem final forem diferentes do esperado, execute `rollback` em vez de `commit`. Registre loja, IDs, motivo, operador e horário no registro operacional interno.

Se não houver employee ativo para assumir e não for possível recuperar a conta existente, interrompa a operação e encaminhe ao mantenedor da plataforma. Não insira Auth users manualmente, não crie convite por SQL improvisado e não altere `user_metadata` para contornar os triggers.
