-- Поставочный пример: сервер, путь и схема, на которых профили default капчи и json
-- проходят собственные проверки, а их каналы издаются с первой установки.
--
-- Файл применяет накатчик (src/migrate.ts) один раз — сразу после 02-shipped.sql и
-- только на пустой базе. Живые установки его не получают: это часть первой
-- инициализации, а не миграция. Сборщик поставки (build/baseline.mjs) файл не трогает.
-- Писать его под структуру поставки 1.0: миграции новее поставки идут после него и
-- доводят его данные вместе с остальными.
--
-- Без примера пустая установка не издаёт два канала:
--   captcha/send -> 400 invalid_profile default: path is empty. Путь виджета обязателен,
--     а непустой путь при записи профиля должен совпасть с prefix- или exact-путём
--     сервера профиля; серверов в поставке нет;
--   json/send    -> 400 invalid_profile default: schema.source is required. Источник —
--     uuid объекта-содержимого; схем в поставке нет.
--
-- Что заводится:
--   сервер example (example.local), выключен: nginx его не собирает, слушателей у него
--     нет, порт и default_server оператора он не занимает;
--   путь /example/ на нём, return 204: на него указывает профиль капчи default;
--   объект example-openapi.json — OpenAPI 3.0 с одной операцией GET /example/ для
--     профиля json default. Без операций документ отвергает сам json-инспектор
--     («document declares no operation»), хотя контроллер его пропускает. Запрос вне
--     схемы профиль по умолчанию пропускает (unknown_operation: allow). Не встроенный:
--     оператор удалит его, назначив профилю свою схему.
--
-- Идентификаторы постоянные: по ним пример узнаётся в поддержке и в e2e.

INSERT INTO public.servers (id, http_space_id, name, server_names, enabled)
VALUES (
    'c3000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.http_spaces WHERE name = 'default'),
    'example',
    '{example.local}',
    false
);

INSERT INTO public.locations (id, server_id, match, path, "position", enabled, handler, return_status)
VALUES (
    'c3000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000001',
    'prefix',
    '/example/',
    10,
    true,
    'return',
    204
);

-- Тип содержимого json: постоянный id из 02-shipped.sql.
INSERT INTO public.datasets (id, http_space_id, name, type, kind, content_type_id, description, builtin)
VALUES (
    'c3000000-0000-4000-8000-000000000003',
    (SELECT id FROM public.http_spaces WHERE name = 'default'),
    'example-openapi.json',
    'string',
    'content',
    'c1000000-0000-4000-8000-000000000003',
    'Пример схемы OpenAPI для профиля json default',
    false
);

INSERT INTO public.dataset_contents (dataset_id, name, body)
VALUES (
    'c3000000-0000-4000-8000-000000000003',
    'example-openapi.json',
    convert_to(
        '{"openapi": "3.0.3", "info": {"title": "example", "version": "1.0.0"}, "paths": {"/example/": {"get": {"responses": {"204": {"description": "Пусто"}}}}}}',
        'UTF8'
    )
);

UPDATE public.captcha_profiles
   SET server_id = 'c3000000-0000-4000-8000-000000000001',
       doc = '{"path": "/example/"}'
 WHERE name = 'default'
   AND http_space_id = (SELECT id FROM public.http_spaces WHERE name = 'default');

UPDATE public.json_profiles
   SET doc = '{"schema": {"kind": "openapi", "source": "c3000000-0000-4000-8000-000000000003"}}'
 WHERE name = 'default'
   AND http_space_id = (SELECT id FROM public.http_spaces WHERE name = 'default');
