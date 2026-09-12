-- Порт узла в поставке. Образ ноды слушает 8080 (снаружи -- PLC_HTTP_PORT из
-- .env установки), а поставка 1.0 портов не везла: сервер без привязки уходил
-- на nginx-овский :80, недостижимый через сопоставление портов контейнера.
-- Порт TLS (8443) не заводится: без сертификата он валит nginx -t, его заводят
-- вместе с сертификатом.
insert into public.ports (http_space_id, name, address, port, ssl, http2, proxy_protocol)
select s.id, 'http-8080', '0.0.0.0', 8080, false, false, false
  from public.http_spaces s
 where not exists (
    select 1 from public.ports p where p.http_space_id = s.id and p.port = 8080
 )
on conflict do nothing;
