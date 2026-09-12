-- Поиск префиксов гео/ASN: address остаётся text (дамп, compile, LIKE '192.16%').
-- Вхождение хоста и пересечение CIDR — через address::cidr, без второй колонки.

create index if not exists ip_country_addresses_net
    on ip_country_addresses using gist ((address::cidr) inet_ops);

create index if not exists ip_asn_addresses_net
    on ip_asn_addresses using gist ((address::cidr) inet_ops);

create index if not exists ip_country_addresses_prefix
    on ip_country_addresses (country_id, address text_pattern_ops);

create index if not exists ip_asn_addresses_prefix
    on ip_asn_addresses (asn_id, address text_pattern_ops);
