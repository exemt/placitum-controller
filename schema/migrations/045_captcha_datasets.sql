-- Активные списки капчи: быстрый путь (cap_cleared) и отмена снаружи
-- (cap_banned). Те же роли, что у auth_sessions / auth_banned; в nginx.conf
-- стенда им соответствуют waf_local_dataset с теми же именами.

insert into datasets (http_space_id, name, subject, type, max_entries, kind, active, description)
select s.id, v.name, 'waf.data.' || v.name, 'string', v.max, 'list', true, v.descr
  from http_spaces s,
       (values
          ('cap_cleared', 50000, 'Прошедшие капчу: waf_cid для быстрого пути'),
          ('cap_banned',   8192, 'Бан капчи: waf_cid, отмена снаружи')
       ) as v(name, max, descr)
 where not exists (
           select 1 from datasets d
            where d.http_space_id = s.id and d.name = v.name
       );
