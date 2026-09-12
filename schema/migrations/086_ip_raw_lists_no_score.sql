-- Инспектор адреса: сырые списки для условий, и никакого счёта.
--
-- Две правки одного решения.
--
-- 1. Условие строки зависит от того, что строка делает. Терминальная (allow,
--    deny) выносит вердикт -- ей нужно выражение над сырьём, то есть составной
--    набор. Накопительная (request, list) вердикта не выносит -- ей нужен
--    состав, то есть сырой список. Списки для условий профиль перечисляет сам
--    (ip_profile_datasets): только перечисленные едут на ноду, и только они
--    предлагаются в форме. Так пак перестаёт возить все наборы пространства с
--    телами -- едет отобранное.
--
-- 2. Счёта у инспектора нет. Белый даёт allow, чёрный -- deny, «иначе» -- одно
--    из этих двух и выбирается явно. Числом чужую политику двигают соседи,
--    получившие просьбу; вердикт-счёт здесь был третьим языком без своего
--    вопроса.

-- --- списки, которые профиль просит упаковать -------------------------------
create table if not exists ip_profile_datasets (
    ip_profile_id uuid not null references ip_profiles(id) on delete cascade,
    dataset_id    uuid not null references datasets(id) on delete restrict,
    position      integer not null default 0,
    primary key (ip_profile_id, dataset_id)
);

create index if not exists ip_profile_datasets_dataset
    on ip_profile_datasets (dataset_id);

comment on table ip_profile_datasets is
    'Сырые списки, которые профиль просит упаковать: логики не несут, их только везут. Условие накопительной строки выбирается из них.';

-- --- условие накопительной строки -------------------------------------------
alter table ip_profile_rules
    add column if not exists dataset_id uuid references datasets(id) on delete restrict;

comment on column ip_profile_rules.dataset_id is
    'Условие накопительной строки: сырой список. У терминальной пусто -- она спрашивает ip_set_id.';

-- Набор остаётся только у терминальных строк, поэтому обязательным он больше
-- не бывает.
alter table ip_profile_rules alter column ip_set_id drop not null;

/*
 * Перевод накопительных строк с набора на список. Набор из ровно одного списка
 * без вычитания, стран, ASN и inverse -- это и есть список, завёрнутый в
 * набор: у такого перевод точный. Всё прочее выражение сырым списком не
 * выражается, и такие строки снимаются: молча подставить «похожий» состав
 * значило бы поменять политику за оператора.
 */
with plain as (
    select s.id as set_id, (array_agg(l.dataset_id))[1] as dataset_id
      from ip_sets s
      join ip_set_lists l on l.ip_set_id = s.id and not l.exclude
     where not s.inverse
       and coalesce(array_length(s.countries, 1), 0) = 0
       and coalesce(array_length(s.asns, 1), 0) = 0
       and coalesce(array_length(s.exclude_countries, 1), 0) = 0
       and coalesce(array_length(s.exclude_asns, 1), 0) = 0
       and not exists (
             select 1 from ip_set_lists e
              where e.ip_set_id = s.id and e.exclude
           )
     group by s.id
    having count(*) = 1
)
update ip_profile_rules r
   set dataset_id = plain.dataset_id,
       ip_set_id  = null
  from plain
 where r.action in ('request', 'list')
   and r.ip_set_id = plain.set_id;

-- Перечисляем переведённые списки: условие обязано ссылаться на объявленный.
insert into ip_profile_datasets (ip_profile_id, dataset_id, position)
select r.ip_profile_id, r.dataset_id, 0
  from ip_profile_rules r
 where r.dataset_id is not null
on conflict do nothing;

-- Непереводимые накопительные строки: набор им больше не условие.
delete from ip_profile_rules
 where action in ('request', 'list') and dataset_id is null;

-- --- счёт -------------------------------------------------------------------
delete from ip_profile_rules where action = 'score';

update ip_profiles set default_action = 'allow' where default_action = 'score';

alter table ip_profile_rules drop constraint if exists ip_profile_rules_action_check;

alter table ip_profile_rules
    add constraint ip_profile_rules_action_check
    check (action in ('allow', 'deny', 'request', 'list'));

/*
 * Условие ровно одно, и какое -- решает действие. Проверка здесь, а не только
 * в приложении: строка без условия не совпадает никогда, и увидеть это по
 * трафику нельзя.
 */
alter table ip_profile_rules drop constraint if exists ip_profile_rules_condition;

alter table ip_profile_rules
    add constraint ip_profile_rules_condition
    check (
      case when action in ('allow', 'deny')
           then ip_set_id is not null and dataset_id is null and not set_not
           else dataset_id is not null and ip_set_id is null
      end
    );

alter table ip_profile_rules drop column if exists score;

alter table ip_profiles drop column if exists default_score;

alter table ip_profiles drop constraint if exists ip_profiles_default_action_check;

alter table ip_profiles
    add constraint ip_profiles_default_action_check
    check (default_action in ('allow', 'deny'));
