-- Инициаторы по исходу у профиля адреса: решённый правилом вердикт вносит
-- адрес в живой набор (on: deny | allow | score>=at → list, ttl, code).
-- Документ jsonb, а не таблица: форма повторяет profile.yaml инспектора и
-- меняется вместе с ним, колонка на поле заставляла бы мигрировать базу на
-- каждое новое поле.

alter table ip_profiles
  add column if not exists outcomes jsonb not null default '[]'::jsonb;
