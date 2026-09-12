-- Каталог инспекторов: текст inspector.conf процесса и метки времени.
-- Директивы nginx (subject, phase, needs…) уже в таблице с 001.
-- conf — очередь процесса, не опция waf_inspector и не SecLang-профиль.

alter table inspectors
    add column if not exists conf text not null default '',
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

comment on column inspectors.conf is
    'Текст inspector.conf: queue_max / queue_full / queue_expand. Не уезжает в nginx.conf.';
comment on column inspectors.subject is
    'Тема шины процесса: waf.req.modsec. Имя в каталоге совпадает с процессом.';

update inspectors i
set conf = v.conf,
    updated_at = now()
from (
    values
        ('modsec', $conf$# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
$conf$),
        ('ip',     $conf$# inspector.conf — локальная очередь процесса
queue_max     16;
queue_full    drop;
queue_expand  off;
$conf$),
        ('vlai',   $conf$# inspector.conf — локальная очередь процесса
queue_max     8;
queue_full    drop;
queue_expand  off;
$conf$),
        ('pii',    $conf$# inspector.conf — локальная очередь процесса
queue_max     8;
queue_full    drop;
queue_expand  off;
$conf$)
) as v(name, conf)
where i.name = v.name
  and i.conf = '';
