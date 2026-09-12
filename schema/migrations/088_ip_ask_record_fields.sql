-- Полная форма просьбы у строк IP фильтра.
--
-- Словарь глаголов канала один на всех отправителей, и с 088 фильтр говорит на
-- нём целиком: управляющие (`active`, `passive`, `off`) и глаголы записи
-- (`audit`, `archive`) ему больше не заказаны. Раньше их не пускала своя копия
-- словаря в контроллере -- она отстала от реестра, и панель предлагала строку,
-- которую этот же контроллер отвергал четырёхсоткой.
--
-- Глаголам записи нужны поля, которых у строки не было: сторона (писать или
-- нет), срок архива, исходы маршрута и набор объектов. У инициаторов они
-- ложатся в тот же jsonb, у правил -- колонками.
alter table ip_profile_rules
    add column if not exists ask_set     text        not null default '',
    add column if not exists ask_ttl_s   integer     not null default 0,
    add column if not exists ask_when    text[]      not null default '{}',
    add column if not exists ask_objects jsonb       not null default '{}'::jsonb;

comment on column ip_profile_rules.ask_set is
    'Сторона просьбы записи: on -- писать, off -- не писать. Пусто у остальных глаголов.';

comment on column ip_profile_rules.ask_ttl_s is
    'Срок объектов в архиве, сек. Только у archive с ask_set on; 0 -- как на маршруте.';

comment on column ip_profile_rules.ask_when is
    'Исходы маршрута, на которых исполнять archive. Пусто -- любой.';

comment on column ip_profile_rules.ask_objects is
    'Объекты просьбы записи: headers, args, body -- каждый со своей стороной, пределом и источником.';
