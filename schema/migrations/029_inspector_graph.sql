-- Граф waf_inspector переехал из колонок inspectors в http_spaces.waf.inspectors.
-- Каталог остаётся реестром (имя, subject, фаза). На живом томе 024 уже
-- применён: дописываем ключ, не трогая остальные поля waf.

update http_spaces
set waf = waf || jsonb_build_object(
    'inspectors', jsonb_build_object(
        'ip', jsonb_build_object(
            'timeoutMs', 20,
            'needs', 'none'
        ),
        'modsec', jsonb_build_object(
            'timeoutMs', 500,
            'needs', 'headers,args,body',
            'body', 'full',
            'after', jsonb_build_array('ip')
        ),
        'vlai', jsonb_build_object(
            'timeoutMs', 200,
            'needs', 'headers,args,body',
            'after', jsonb_build_array('ip', 'modsec')
        ),
        'pii', jsonb_build_object(
            'timeoutMs', 500,
            'needs', 'headers,args,body'
        )
    )
),
    updated_at = now()
where name = 'default'
  and coalesce(waf->'inspectors', 'null'::jsonb) = 'null'::jsonb;
