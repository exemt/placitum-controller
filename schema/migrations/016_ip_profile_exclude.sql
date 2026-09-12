-- Исключения стороны: вычитаются из набора выше, inverse — после вычитания.
-- Списки — те же ip_profile_lists, флаг exclude. Страны и ASN — массивы на профиле.

alter table ip_profiles
    add column if not exists whitelist_exclude_countries text[] not null default '{}',
    add column if not exists blacklist_exclude_countries text[] not null default '{}',
    add column if not exists whitelist_exclude_asns bigint[] not null default '{}',
    add column if not exists blacklist_exclude_asns bigint[] not null default '{}';

alter table ip_profile_lists
    add column if not exists exclude boolean not null default false;

alter table ip_profile_lists
    drop constraint if exists ip_profile_lists_ip_profile_id_dataset_id_side_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ip_profile_lists_member'
  ) then
    alter table ip_profile_lists
      add constraint ip_profile_lists_member
      unique (ip_profile_id, dataset_id, side, exclude);
  end if;
end $$;
