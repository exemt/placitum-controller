-- Один профиль калитки -- один провайдер.
--
-- Раньше профиль нёс список factors и проводил их цепочкой в одной форме.
-- Теперь способ входа у профиля один, а «пароль плюс TOTP» собирается
-- набором инспекторов на маршруте: две калитки на двух волнах. Вторая
-- (provider code, kind totp) узнаёт личность из сессии первой через
-- identity.from и берёт секрет из того же набора пользователей.
--
-- Миграция разносит старые документы:
--   factors: [X]        -> provider: X
--   factors: [X, code]  -> provider: X  +  новый профиль <имя>-totp
--                          (provider code, identity.from = <имя>,
--                           login.uri = <uri>-totp, тот же сервер,
--                           активный список переезжает ко второй калитке)
-- Ключ factors из документа убирается: контроллер его больше не читает.

do $$
declare
    row     record;
    factors jsonb;
    first   text;
    second  text;
    ndoc    jsonb;
    totp    jsonb;
    users   text;
begin
    for row in select * from auth_profiles loop
        factors := coalesce(row.doc -> 'factors', '[]'::jsonb);

        if jsonb_typeof(factors) <> 'array' or jsonb_array_length(factors) = 0 then
            continue;
        end if;

        first  := factors ->> 0;
        second := case when jsonb_array_length(factors) > 1 then factors ->> 1 else null end;
        ndoc   := (row.doc - 'factors') || jsonb_build_object('provider', first);

        if second = 'code' then
            users := coalesce(ndoc -> 'providers' -> 'local' ->> 'users', '');

            totp := jsonb_build_object(
                'mode',     ndoc -> 'mode',
                'login',    jsonb_build_object(
                                'uri',   coalesce(ndoc -> 'login' ->> 'uri', '') || '-totp',
                                'title', 'Второй фактор',
                                'note',  'Введите код из приложения-аутентификатора.',
                                'page',  ''),
                'gate',     ndoc -> 'gate',
                'session',  ndoc -> 'session',
                'ticket',   ndoc -> 'ticket',
                'list',     coalesce(ndoc -> 'list', '{}'::jsonb),
                'upstream', ndoc -> 'upstream',
                'provider', 'code',
                'identity', jsonb_build_object('from', row.name),
                'providers', jsonb_build_object(
                                'local', null, 'ldap', null, 'ntlm', null,
                                'code', coalesce(ndoc -> 'providers' -> 'code', '{}'::jsonb)
                                        || jsonb_build_object('users', users)),
                'lockout',  ndoc -> 'lockout',
                'roster',   ndoc -> 'roster');

            -- Cookie второй калитки отличаются суффиксом, иначе второй вход
            -- стирал бы сессию первого.
            totp := jsonb_set(totp, '{session,cookie}',
                        to_jsonb(coalesce(ndoc -> 'session' ->> 'cookie', 'waf_sid') || '_totp'));
            totp := jsonb_set(totp, '{ticket,cookie}',
                        to_jsonb(coalesce(ndoc -> 'ticket' ->> 'cookie', 'waf_lgn') || '_totp'));

            -- Активный список означает полный вход, поэтому объявляет его
            -- последняя калитка; у первой он снимается.
            ndoc := ndoc || jsonb_build_object('list', jsonb_build_object(
                        'sessions', '', 'subject', '', 'cookie', 'waf_sess', 'ttlS', 0,
                        'origin', 'auth'));

            if not exists (select 1 from auth_profiles p
                            where p.http_space_id = row.http_space_id
                              and p.name = row.name || '-totp') then
                insert into auth_profiles (http_space_id, server_id, name, description, doc)
                values (row.http_space_id, row.server_id, row.name || '-totp',
                        'Второй фактор (TOTP) после ' || row.name, totp);
            end if;
        end if;

        update auth_profiles set doc = ndoc, updated_at = now() where id = row.id;
    end loop;
end $$;
