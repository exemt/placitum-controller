--
-- Тестовое гео стенда: страны «Тестовая выгрузка» по фикстуре
-- deploy/ip/data/geo.
--
-- Нужно только базе без выгрузки MaxMind. Если 03-geo.sh нашёл дампы в
-- schema/seed, этот файл катать не надо и нельзя: страна с тем же кодом уже
-- заведена настоящая, вставка пройдёт мимо, а префиксы упадут на внешнем ключе.
--
-- Кода 'en' в ISO нет, и в выгрузке MaxMind его тоже нет: на стенде с полным
-- гео эта страна остаётся единственной тестовой.
--

-- ip_countries: 6
INSERT INTO public.ip_countries (id, http_space_id, code, type, description, created_at, updated_at) VALUES ('141faf91-9a71-4d62-9bd6-3792efb8ed19', (select id from public.http_spaces where name = 'default'), 'en', 'v4', 'Тестовая выгрузка en', '2026-09-12 15:27:33.454767+00', '2026-09-12 15:27:33.454767+00') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_countries (id, http_space_id, code, type, description, created_at, updated_at) VALUES ('17651c44-368a-4c09-b669-e19c067e77b0', (select id from public.http_spaces where name = 'default'), 'en', 'v6', 'Тестовая выгрузка en', '2026-09-12 15:27:33.454767+00', '2026-09-12 15:27:33.454767+00') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_countries (id, http_space_id, code, type, description, created_at, updated_at) VALUES ('32243c9c-1fad-4029-9898-882775d62512', (select id from public.http_spaces where name = 'default'), 'ru', 'v6', 'Тестовая выгрузка ru', '2026-09-12 15:27:33.454767+00', '2026-09-12 15:27:33.454767+00') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_countries (id, http_space_id, code, type, description, created_at, updated_at) VALUES ('9e2f8b58-af23-442f-a55a-3c56087f3faf', (select id from public.http_spaces where name = 'default'), 'jp', 'v6', 'Тестовая выгрузка jp', '2026-09-12 15:27:33.454767+00', '2026-09-12 15:27:33.454767+00') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_countries (id, http_space_id, code, type, description, created_at, updated_at) VALUES ('bc5fb6e5-bebe-4180-8040-ecd37ac2436d', (select id from public.http_spaces where name = 'default'), 'jp', 'v4', 'Тестовая выгрузка jp', '2026-09-12 15:27:33.454767+00', '2026-09-12 15:27:33.454767+00') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_countries (id, http_space_id, code, type, description, created_at, updated_at) VALUES ('c6511579-8722-4756-973e-19fc979dab44', (select id from public.http_spaces where name = 'default'), 'ru', 'v4', 'Тестовая выгрузка ru', '2026-09-12 15:27:33.454767+00', '2026-09-12 15:27:33.454767+00') ON CONFLICT DO NOTHING;

-- ip_country_addresses: 9
INSERT INTO public.ip_country_addresses (id, country_id, address) VALUES ('10606dbd-8410-49d7-91d2-127fcdb4a941', 'c6511579-8722-4756-973e-19fc979dab44', '5.8.8.0/24') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_country_addresses (id, country_id, address) VALUES ('4ee535b9-c190-4ece-a0e0-39cf58eec7c9', '141faf91-9a71-4d62-9bd6-3792efb8ed19', '8.8.8.0/24') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_country_addresses (id, country_id, address) VALUES ('4ff71233-c22f-4cc3-9e40-d47d0d4a31dd', 'c6511579-8722-4756-973e-19fc979dab44', '95.24.0.0/16') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_country_addresses (id, country_id, address) VALUES ('5c0a675a-69fd-4db4-b091-1b4404c19c1c', '32243c9c-1fad-4029-9898-882775d62512', '2a02:6b8::/32') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_country_addresses (id, country_id, address) VALUES ('7a657d7a-6f5e-4006-bcec-086bba7ab25f', 'bc5fb6e5-bebe-4180-8040-ecd37ac2436d', '210.173.160.0/19') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_country_addresses (id, country_id, address) VALUES ('995f3031-6cbb-4269-ba71-6171c53f30ed', '141faf91-9a71-4d62-9bd6-3792efb8ed19', '1.1.1.0/24') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_country_addresses (id, country_id, address) VALUES ('be4bd1b9-0427-4f95-98ff-52f6d55a9ef3', '17651c44-368a-4c09-b669-e19c067e77b0', '2606:4700:4700::/48') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_country_addresses (id, country_id, address) VALUES ('c88f8052-04dc-44cd-bf31-0f0f7522c228', 'bc5fb6e5-bebe-4180-8040-ecd37ac2436d', '133.0.0.0/8') ON CONFLICT DO NOTHING;
INSERT INTO public.ip_country_addresses (id, country_id, address) VALUES ('ed1c6c77-738a-46e8-a5fb-c2b840a35872', '9e2f8b58-af23-442f-a55a-3c56087f3faf', '2400:2200::/24') ON CONFLICT DO NOTHING;

