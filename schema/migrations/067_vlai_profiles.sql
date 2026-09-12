-- Профили инспектора vlai (inspectors/vlai).
--
-- Тот же приём, что у действий (054): профиль -- документ jsonb, форма его
-- описана в Python (inspectors/vlai/src/profiles.py) и в контроллере
-- (vlai-profile-doc.ts), колонки на поле разъехались бы с ними на первом
-- новом ключе.
--
-- Профиль короткий намеренно: режим, поведение при полной очереди
-- (overload: allow | wait | deny), правила приёма чужих просьб
-- (trigger.prior: threshold и skip) и инициаторы по исходу (outcomes:
-- on score | overload -> просьба соседу). Модель и шкалу счёта профиль
-- не трогает -- это свойство процесса.

create table if not exists vlai_profiles (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    name            text not null,
    description     text not null default '',
    -- Документ профиля: mode, overload, trigger.prior[], outcomes[].
    -- Схема -- docs/inspectors/vlai/README.md.
    doc             jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists vlai_profiles_space on vlai_profiles (http_space_id);

comment on column vlai_profiles.doc is
    'Документ профиля vlai. Валидация -- в контроллере и в инспекторе, не в типах.';

-- Профиль default. mode off -- инертная точка опоры, как у остальных
-- подсистем (060_default_profiles.sql): поколение без default инспектор
-- отвергает целиком, поэтому он заводится миграцией, а не оператором.
-- До первой рассылки инспектор работает на встроенном умолчании
-- (enforce, правила приёма из WAF_VLAI_PRIOR), и это не этот профиль.
insert into vlai_profiles (http_space_id, name, description, doc)
select s.id, 'default', 'Профиль по умолчанию, выключен', '{"mode":"off"}'::jsonb
  from http_spaces s
 where not exists (
         select 1 from vlai_profiles p
          where p.http_space_id = s.id and p.name = 'default');
