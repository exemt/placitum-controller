/**
 * Расширенные подсказки по действиям.
 *
 * Действия делятся на разрушающие, потоковые, метаданные и неразрушающие;
 * ошибка почти всегда в том, что действие поставили не в то правило цепочки,
 * не в ту фазу или рядом с тем, что его отменяет.
 */

import { l, type DetailsMap } from './types';

export const ACTION_DETAILS: DetailsMap = {
  /* --- Разрушающие ------------------------------------------------- */

  deny: {
    summary: l(
      'Stops processing the transaction and returns an error to the client. The status code comes from the status action, from SecDefaultAction, or defaults to 403.',
      'Останавливает обработку транзакции и возвращает клиенту ошибку. Код берётся из действия status, из SecDefaultAction, а по умолчанию — 403.',
    ),
    syntax: 'deny,status:403',
    tech: {
      scope: l(
        'Works in phases 1-4. In phase 5 there is nothing left to block — the response is already sent.',
        'Работает в фазах 1–4. В фазе 5 блокировать уже нечего: ответ отправлен.',
      ),
    },
    gotchas: [
      l(
        'deny together with nolog blocks the user silently and leaves no trace of why — the hardest kind of incident to investigate.',
        'deny вместе с nolog блокирует пользователя молча и не оставляет следа о причине — такой инцидент разбирать тяжелее всего.',
      ),
      l(
        'In a chain the disruptive action belongs to the first rule, even though it fires only when the whole chain matches.',
        'В цепочке разрушающее действие принадлежит первому правилу, хотя выполняется только при совпадении всей цепочки.',
      ),
    ],
    seeAlso: ['status', 'block', 'drop', 'redirect', 'log'],
  },

  block: {
    summary: l(
      'A placeholder for "whatever the default disruptive action is". The rule does not decide how to block — SecDefaultAction does, which is what makes a rule set retunable without editing every rule.',
      'Заглушка со смыслом «то разрушающее действие, которое назначено по умолчанию». Правило не решает, как блокировать, — это решает SecDefaultAction, и именно поэтому набор правил можно перенастроить, не правя каждое правило.',
    ),
    syntax: 'block',
    tech: {
      fallback: l(
        'If SecDefaultAction says pass, block does nothing at all.',
        'Если в SecDefaultAction стоит pass, block не делает ровно ничего.',
      ),
    },
    seeAlso: ['deny', 'SecDefaultAction', 'ctl', 'pass'],
  },

  drop: {
    summary: l(
      'Closes the connection immediately without sending any response. The client sees a broken connection, not an error page, which is why it is used against brute force and floods.',
      'Немедленно закрывает соединение, не отправляя никакого ответа. Клиент видит обрыв, а не страницу ошибки, — поэтому применяется против перебора и флуда.',
    ),
    syntax: 'drop',
    tech: {
      cost: l(
        'Saves the cost of generating a response, but a shared NAT address takes everyone down with it.',
        'Экономит генерацию ответа, но общий NAT-адрес утаскивает с собой всех, кто за ним.',
      ),
    },
    gotchas: [
      l(
        'A dropped connection looks like a network failure to monitoring, so log the rule explicitly.',
        'Для мониторинга оборванное соединение выглядит как сетевой сбой, поэтому логируйте такое правило явно.',
      ),
    ],
    seeAlso: ['deny', 'pause', 'initcol'],
  },

  redirect: {
    summary: l(
      'Sends the client to another URL instead of serving the request. Used for soft blocking: a captcha, a warning page, a login form.',
      'Отправляет клиента на другой URL вместо обслуживания запроса. Применяется для мягкой блокировки: капча, страница предупреждения, форма входа.',
    ),
    syntax: "redirect:'https://example.com/blocked'",
    tech: {
      argument: l(
        'A URL; macros are expanded, so %{REQUEST_URI} can be carried over.',
        'URL; макросы раскрываются, поэтому можно перенести %{REQUEST_URI}.',
      ),
      fallback: l(
        'Status 302 unless status:301 or status:307 says otherwise.',
        'Код 302, если status:301 или status:307 не говорит иначе.',
      ),
    },
    gotchas: [
      l(
        'Putting an unfiltered request value into the redirect target turns the rule into an open redirect.',
        'Подстановка неотфильтрованного значения запроса в цель редиректа превращает правило в открытый редирект.',
      ),
    ],
    seeAlso: ['deny', 'status', 'proxy'],
  },

  proxy: {
    summary: l(
      'Forwards the request to another server transparently — the client never learns about it. Used to route suspicious traffic to a honeypot or a sandbox.',
      'Прозрачно перенаправляет запрос на другой сервер — клиент об этом не узнаёт. Применяется, чтобы увести подозрительный трафик на ханипот или в песочницу.',
    ),
    syntax: "proxy:'http://honeypot.internal/'",
    tech: {
      availability: l(
        'ModSecurity v2 with mod_proxy loaded in Apache; not available in libmodsecurity (v3).',
        'ModSecurity v2 с загруженным mod_proxy в Apache; в libmodsecurity (v3) недоступно.',
      ),
    },
    seeAlso: ['redirect', 'deny'],
  },

  pause: {
    summary: l(
      'Delays the transaction for the given number of milliseconds before continuing. Meant to slow down brute force, but it holds a worker while it waits.',
      'Задерживает транзакцию на заданное число миллисекунд, прежде чем продолжить. Задумано как замедление перебора, но всё это время занят рабочий процесс.',
    ),
    syntax: 'pause:2000',
    gotchas: [
      l(
        'This is a self-inflicted denial of service: an attacker with a thousand connections buys a thousand blocked workers for free. Prefer drop or a counter in an IP collection.',
        'Это отказ в обслуживании самому себе: атакующий с тысячей соединений бесплатно занимает тысячу процессов. Лучше drop или счётчик в IP-коллекции.',
      ),
    ],
    seeAlso: ['drop', 'deny', 'initcol'],
  },

  allow: {
    summary: l(
      'Stops rule processing and lets the transaction through. The scope is chosen by the argument: allow on its own ends all inspection, allow:phase ends the current phase, allow:request ends request-side inspection but keeps the response phases.',
      'Останавливает обработку правил и пропускает транзакцию. Область задаётся аргументом: одиночный allow прекращает всю проверку, allow:phase — текущую фазу, allow:request — проверку запроса, оставляя фазы ответа.',
    ),
    syntax: 'allow  |  allow:phase  |  allow:request',
    gotchas: [
      l(
        'A bare allow high in phase 1 disables the entire rule set for that request — the most common way to punch an accidental hole through a WAF.',
        'Голый allow в начале фазы 1 выключает для этого запроса весь набор правил — самый частый способ случайно пробить дыру в WAF.',
      ),
      l(
        'Whitelisting by a client-controlled value (a header, a cookie, a user agent) means the client decides when to switch the WAF off.',
        'Белый список по значению, которым управляет клиент (заголовок, cookie, user-agent), означает, что клиент сам решает, когда выключить WAF.',
      ),
    ],
    seeAlso: ['pass', 'skipAfter', 'ctl', 'SecRuleRemoveById'],
  },

  pass: {
    summary: l(
      'Lets processing continue to the next rule. Not "do nothing": with pass the rule keeps iterating over the remaining target values, which is what makes counting and scoring rules work.',
      'Позволяет обработке перейти к следующему правилу. Это не «ничего не делать»: с pass правило продолжает обходить оставшиеся значения целей, и именно на этом держатся правила-счётчики и скоринг.',
    ),
    syntax: 'pass,nolog,setvar:tx.score=+5',
    gotchas: [
      l(
        'pass and deny in the same action list is a contradiction — the first disruptive action wins and the intent becomes unreadable.',
        'pass и deny в одном списке действий — противоречие: побеждает первое разрушающее действие, а замысел становится нечитаемым.',
      ),
    ],
    seeAlso: ['allow', 'setvar', 'block', 'nolog'],
  },

  /* --- Поток выполнения --------------------------------------------- */

  chain: {
    summary: l(
      'Joins this rule with the next one by a logical AND: the actions run only if every link matches. This is how ModSecurity expresses "this argument AND that header" without a single monstrous regex.',
      'Связывает это правило со следующим логическим И: действия выполняются, только если совпали все звенья. Так ModSecurity выражает «этот аргумент И тот заголовок» без одной чудовищной регулярки.',
    ),
    syntax: 'SecRule ... "id:1,phase:2,deny,chain"\n    SecRule ... "chain"\n        SecRule ...',
    tech: {
      scope: l(
        'Metadata (id, phase, msg, tag) and disruptive actions belong to the first rule only; the links inherit the phase and may carry non-disruptive actions of their own.',
        'Метаданные (id, phase, msg, tag) и разрушающие действия ставятся только в первом правиле; звенья наследуют фазу и могут нести собственные неразрушающие действия.',
      ),
      cost: l(
        'Links are evaluated left to right and stop at the first failure — put the cheapest and most selective condition first.',
        'Звенья вычисляются слева направо и обрываются на первом несовпадении — ставьте первым самое дешёвое и отсекающее условие.',
      ),
    },
    gotchas: [
      l(
        'A trailing chain with no rule after it is a configuration error; a chain that is broken by a blank line or a comment silently loses its tail.',
        'Висящий chain без следующего правила — ошибка конфигурации; цепочка, разорванная пустой строкой или комментарием, молча теряет хвост.',
      ),
      l(
        'An id on a chained link is rejected: identity belongs to the chain as a whole.',
        'id у звена цепочки не принимается: идентичность принадлежит цепочке целиком.',
      ),
    ],
    seeAlso: ['skipAfter', 'id', 'multiMatch', 'SecRule'],
  },

  skip: {
    summary: l(
      'Skips the given number of rules that follow. Counting rules by hand is fragile, so in practice skipAfter with a marker is almost always the better tool.',
      'Пропускает указанное число следующих правил. Считать правила руками хрупко, поэтому на практике почти всегда лучше skipAfter с меткой.',
    ),
    syntax: 'skip:2',
    tech: {
      scope: l(
        'A whole chain counts as one rule; only rules in the same phase and context are counted.',
        'Цепочка целиком считается одним правилом; учитываются только правила той же фазы и того же контекста.',
      ),
    },
    gotchas: [
      l(
        'Adding a rule in the middle of the skipped block quietly changes what gets skipped.',
        'Добавление правила внутри пропускаемого блока молча меняет то, что именно пропускается.',
      ),
    ],
    seeAlso: ['skipAfter', 'SecMarker', 'chain'],
  },

  skipAfter: {
    summary: l(
      'Jumps forward to the SecMarker with the given label, skipping everything in between. The standard way to build exceptions and optional rule blocks in CRS.',
      'Перепрыгивает вперёд к метке SecMarker с указанным именем, пропуская всё между ними. Штатный способ строить исключения и необязательные блоки правил в CRS.',
    ),
    syntax: "skipAfter:END_ADMIN_CHECKS",
    tech: {
      scope: l(
        'The marker must be in the same phase and the same configuration context, and it must come after the rule.',
        'Метка должна быть в той же фазе и том же контексте конфигурации и стоять после правила.',
      ),
    },
    gotchas: [
      l(
        'A missing or misspelled marker is a load-time error in some versions and a silent no-jump in others — check the name.',
        'Отсутствующая или опечатанная метка в одних версиях даёт ошибку загрузки, в других — молчаливое отсутствие прыжка; проверяйте имя.',
      ),
    ],
    example: {
      code: 'SecRule REQUEST_FILENAME "@beginsWith /api/health" \\\n    "id:1201,phase:1,pass,nolog,skipAfter:END_STRICT"\n# ... строгие правила ...\nSecMarker END_STRICT',
    },
    seeAlso: ['SecMarker', 'skip', 'ctl'],
  },

  /* --- Метаданные ---------------------------------------------------- */

  id: {
    summary: l(
      'The unique numeric identifier of the rule. Everything that refers to a rule later — exclusions, SecRuleRemoveById, log analysis, dashboards — refers to this number.',
      'Уникальный числовой идентификатор правила. Всё, что потом ссылается на правило — исключения, SecRuleRemoveById, разбор логов, дашборды, — ссылается на это число.',
    ),
    syntax: 'id:1001',
    tech: {
      argument: l(
        'A positive integer, unique across the whole configuration. Mandatory for SecRule and SecAction since 2.9.',
        'Целое положительное число, уникальное во всей конфигурации. Обязателен для SecRule и SecAction начиная с 2.9.',
      ),
      scope: l(
        'Reserved ranges by convention: 1-99,999 for local rules, 900,000-999,999 for CRS.',
        'Диапазоны по соглашению: 1–99 999 для локальных правил, 900 000–999 999 для CRS.',
      ),
    },
    gotchas: [
      l(
        'A duplicate id fails the configuration load; renumbering a live rule breaks every exclusion that pointed at it.',
        'Дублирующийся id роняет загрузку конфигурации; смена номера у живого правила ломает все исключения, которые на него ссылались.',
      ),
    ],
    seeAlso: ['rev', 'ver', 'SecRuleRemoveById', 'SecRuleUpdateActionById'],
  },

  phase: {
    summary: l(
      'Chooses when the rule runs. Phase 1 is request headers, 2 is the request body, 3 response headers, 4 the response body, 5 logging. The phase decides which variables exist at all.',
      'Определяет, когда выполняется правило. Фаза 1 — заголовки запроса, 2 — тело запроса, 3 — заголовки ответа, 4 — тело ответа, 5 — логирование. От фазы зависит, какие переменные вообще существуют.',
    ),
    syntax: 'phase:2',
    tech: {
      argument: l(
        'A number 1-5 or a name: request, response, logging.',
        'Число 1–5 либо имя: request, response, logging.',
      ),
      fallback: l(
        'Without an explicit phase the rule takes the phase from SecDefaultAction, which is phase 2 in a typical setup.',
        'Без явной фазы правило берёт её из SecDefaultAction — в типовой конфигурации это фаза 2.',
      ),
    },
    gotchas: [
      l(
        'ARGS_POST, REQUEST_BODY and FILES are empty in phase 1: a body check placed there never fires.',
        'ARGS_POST, REQUEST_BODY и FILES в фазе 1 пусты: проверка тела, поставленная туда, не сработает никогда.',
      ),
      l(
        'Phase 5 cannot block anything — the response has already left. It is for logging and bookkeeping only.',
        'Фаза 5 ничего не блокирует — ответ уже ушёл. Она только для логирования и учёта.',
      ),
    ],
    seeAlso: ['deny', 'SecDefaultAction', 'REQUEST_BODY', 'RESPONSE_BODY'],
  },

  msg: {
    summary: l(
      'The human-readable message written to the logs when the rule fires. This is what the on-call engineer reads first, so it should say what happened, not repeat the rule id.',
      'Понятное человеку сообщение, попадающее в логи при срабатывании. Именно его первым читает дежурный инженер, поэтому оно должно говорить, что произошло, а не повторять id правила.',
    ),
    syntax: "msg:'SQL injection in %{MATCHED_VAR_NAME}'",
    tech: {
      argument: l(
        'A quoted string; macros are expanded at match time.',
        'Строка в кавычках; макросы раскрываются в момент срабатывания.',
      ),
    },
    gotchas: [
      l(
        'With nolog the message goes nowhere: writing a careful msg next to nolog is wasted effort.',
        'С nolog сообщение никуда не попадёт: аккуратный msg рядом с nolog — потраченный впустую труд.',
      ),
    ],
    seeAlso: ['logdata', 'tag', 'log', 'nolog', 'severity'],
  },

  logdata: {
    summary: l(
      'Logs an extra data fragment alongside the message — usually the value that actually matched. It answers the question "what exactly did it see?" without turning on full-body auditing.',
      'Логирует дополнительный фрагмент данных рядом с сообщением — обычно то значение, которое действительно совпало. Отвечает на вопрос «что именно он увидел?» без включения полного аудита тела.',
    ),
    syntax: "logdata:'%{MATCHED_VAR}'",
    tech: {
      argument: l(
        'A quoted string with macros; %{TX.0} works after capture.',
        'Строка в кавычках с макросами; %{TX.0} работает после capture.',
      ),
    },
    gotchas: [
      l(
        'It logs user data verbatim — a password field or a card number goes into the log as it was sent. Use the sanitise actions.',
        'Он логирует пользовательские данные дословно: поле пароля или номер карты попадут в лог как есть. Применяйте sanitise-действия.',
      ),
    ],
    seeAlso: ['msg', 'capture', 'sanitiseMatched', 'MATCHED_VAR'],
  },

  severity: {
    summary: l(
      'How serious a match is, on the syslog scale: 0 EMERGENCY, 1 ALERT, 2 CRITICAL, 3 ERROR, 4 WARNING, 5 NOTICE, 6 INFO, 7 DEBUG. Lower means worse.',
      'Насколько серьёзно срабатывание, по шкале syslog: 0 EMERGENCY, 1 ALERT, 2 CRITICAL, 3 ERROR, 4 WARNING, 5 NOTICE, 6 INFO, 7 DEBUG. Меньше — хуже.',
    ),
    syntax: 'severity:CRITICAL',
    tech: {
      argument: l(
        'A number 0-7 or the name; both spellings mean the same thing.',
        'Число 0–7 или имя; оба написания означают одно и то же.',
      ),
      scope: l(
        'Feeds HIGHEST_SEVERITY and, in CRS-style setups, the anomaly score weight.',
        'Питает HIGHEST_SEVERITY, а в связках в стиле CRS — вес в аномальном счёте.',
      ),
    },
    gotchas: [
      l(
        'The scale is inverted compared to intuition: severity:7 is the least severe, not the most.',
        'Шкала обратна интуиции: severity:7 — наименее серьёзно, а не наиболее.',
      ),
    ],
    seeAlso: ['msg', 'tag', 'HIGHEST_SEVERITY', 'log'],
  },

  tag: {
    summary: l(
      'Attaches a classification label to the rule. Tags are what make a rule set manageable: they group rules by attack class and standard, and SecRuleRemoveByTag can disable a whole category at once.',
      'Прикрепляет к правилу классификационную метку. На тегах держится управляемость набора: они группируют правила по классу атаки и стандарту, а SecRuleRemoveByTag выключает целую категорию разом.',
    ),
    syntax: "tag:'attack-sqli',tag:'OWASP_CRS'",
    tech: {
      argument: l(
        'A quoted string; the action may be repeated as many times as needed and macros are expanded.',
        'Строка в кавычках; действие можно повторять сколько нужно, макросы раскрываются.',
      ),
    },
    seeAlso: ['msg', 'severity', 'SecRuleRemoveByTag', 'SecRuleUpdateTargetByTag'],
  },

  rev: {
    summary: l(
      'The revision number of the rule, bumped when the logic changes but the id stays. Lets log analysis tell an old version of a rule from a new one.',
      'Номер ревизии правила, который повышают при изменении логики с сохранением id. Позволяет разбору логов отличить старую версию правила от новой.',
    ),
    syntax: "rev:'2'",
    seeAlso: ['id', 'ver', 'maturity'],
  },

  ver: {
    summary: l(
      'The version of the rule set the rule belongs to, e.g. OWASP_CRS/4.0.0. Metadata for humans and reports; the engine does not act on it.',
      'Версия набора правил, к которому относится правило, например OWASP_CRS/4.0.0. Метаданные для людей и отчётов; движок на них не реагирует.',
    ),
    syntax: "ver:'OWASP_CRS/4.0.0'",
    seeAlso: ['rev', 'id', 'tag'],
  },

  accuracy: {
    summary: l(
      'A 1-9 self-assessment of how precise the rule is — how rarely it produces false positives. Used to assemble a rule set at a chosen paranoia level.',
      'Самооценка точности правила от 1 до 9 — насколько редко оно даёт ложные срабатывания. Используется, чтобы собрать набор под выбранный уровень паранойи.',
    ),
    syntax: "accuracy:'9'",
    seeAlso: ['maturity', 'severity', 'ver'],
  },

  maturity: {
    summary: l(
      'A 1-9 rating of how long the rule has been in production and how well it is tested. Together with accuracy it describes how much a rule can be trusted.',
      'Оценка от 1 до 9 того, как давно правило в проде и насколько оно обкатано. Вместе с accuracy описывает, насколько правилу можно доверять.',
    ),
    syntax: "maturity:'9'",
    seeAlso: ['accuracy', 'rev', 'ver'],
  },

  /* --- Логирование ---------------------------------------------------- */

  log: {
    summary: l(
      'Forces the match to be written to the error log and the audit log. Explicit logging matters most on rules that block: a block nobody can see is indistinguishable from an application bug.',
      'Принудительно записывает срабатывание в error-лог и журнал аудита. Явное логирование важнее всего для блокирующих правил: блокировку, которой не видно, не отличить от бага приложения.',
    ),
    syntax: 'log',
    seeAlso: ['nolog', 'auditlog', 'msg', 'logdata'],
  },

  nolog: {
    summary: l(
      'Suppresses logging of the match, and with it the audit log entry. Made for high-frequency bookkeeping rules — the ones that only set a counter and would otherwise flood the log.',
      'Подавляет запись о срабатывании, а вместе с ней и запись в журнал аудита. Сделан для частых служебных правил, которые лишь выставляют счётчик и иначе затопили бы лог.',
    ),
    syntax: 'nolog',
    tech: {
      scope: l(
        'nolog implies noauditlog; to keep the audit entry while dropping the error-log line, write nolog,auditlog.',
        'nolog подразумевает noauditlog; чтобы сохранить запись аудита, но убрать строку error-лога, пишут nolog,auditlog.',
      ),
    },
    gotchas: [
      l(
        'On a blocking rule this is almost always a mistake: the user is blocked and there is no record of why.',
        'На блокирующем правиле это почти всегда ошибка: пользователь заблокирован, а записи о причине нет.',
      ),
    ],
    seeAlso: ['log', 'noauditlog', 'auditlog', 'deny'],
  },

  auditlog: {
    summary: l(
      'Forces the transaction into the audit log even when it would not qualify otherwise. The audit entry carries the full request, which is what makes an incident reconstructable.',
      'Принудительно помещает транзакцию в журнал аудита, даже если та иначе туда не попала бы. Запись аудита содержит запрос целиком — именно это позволяет восстановить инцидент.',
    ),
    syntax: 'auditlog',
    tech: {
      scope: l(
        'Requires SecAuditEngine to be On or RelevantOnly; what exactly is stored is chosen by SecAuditLogParts.',
        'Требует SecAuditEngine в состоянии On или RelevantOnly; что именно сохраняется, определяет SecAuditLogParts.',
      ),
    },
    seeAlso: ['noauditlog', 'log', 'SecAuditEngine', 'SecAuditLogParts'],
  },

  noauditlog: {
    summary: l(
      'Keeps the match out of the audit log while leaving the error-log line in place. The usual choice for noisy but useful rules on high-traffic endpoints.',
      'Не пускает срабатывание в журнал аудита, оставляя строку в error-логе. Обычный выбор для шумных, но полезных правил на нагруженных эндпоинтах.',
    ),
    syntax: 'noauditlog',
    seeAlso: ['auditlog', 'nolog', 'log'],
  },

  /* --- Данные и состояние --------------------------------------------- */

  setvar: {
    summary: l(
      'Creates, changes or deletes a variable in a collection. The backbone of stateful rules: scoring, counters, flags that later rules read.',
      'Создаёт, меняет или удаляет переменную в коллекции. Опора правил с состоянием: скоринг, счётчики, флаги, которые читают последующие правила.',
    ),
    syntax: 'setvar:tx.score=+5  |  setvar:ip.count=1  |  setvar:!tx.flag',
    tech: {
      argument: l(
        'collection.name=value; +N and -N change the value relatively, the ! prefix removes the variable.',
        'коллекция.имя=значение; +N и -N меняют значение относительно, префикс ! удаляет переменную.',
      ),
      scope: l(
        'TX lives for one transaction. IP, SESSION and USER survive across requests, but only after initcol or setsid/setuid and with SecDataDir configured.',
        'TX живёт одну транзакцию. IP, SESSION и USER переживают запросы, но только после initcol или setsid/setuid и при настроенном SecDataDir.',
      ),
    },
    gotchas: [
      l(
        'A variable written in phase 2 does not exist for a rule in phase 1 of the same request — phases run in order, not in parallel.',
        'Переменная, записанная в фазе 2, не существует для правила фазы 1 того же запроса: фазы идут по порядку, а не параллельно.',
      ),
      l(
        'Writing to a persistent collection without initcol silently does nothing.',
        'Запись в постоянную коллекцию без initcol молча ничего не делает.',
      ),
    ],
    example: {
      code: 'SecRule ARGS "@detectSQLi" \\\n    "id:1202,phase:2,pass,nolog,setvar:tx.anomaly_score=+5"\nSecRule TX:ANOMALY_SCORE "@ge 5" "id:1203,phase:2,deny,status:403"',
    },
    seeAlso: ['initcol', 'expirevar', 'deprecatevar', 'TX', 'capture'],
  },

  capture: {
    summary: l(
      'Saves the regex capturing groups into TX:0..TX:9 — TX:0 is the whole match, TX:1 the first group. Without it the groups are computed and thrown away.',
      'Сохраняет группы захвата регулярки в TX:0..TX:9 — TX:0 это всё совпадение, TX:1 первая группа. Без него группы вычисляются и выбрасываются.',
    ),
    syntax: 'capture',
    tech: {
      scope: l(
        'Works with @rx and with the libinjection operators, which put their fingerprint into TX:0.',
        'Работает с @rx и с операторами libinjection, которые кладут свой отпечаток в TX:0.',
      ),
    },
    gotchas: [
      l(
        'The captured values live only until the next capture overwrites them — read them in the same rule or the chained one right after.',
        'Захваченные значения живут только до следующего capture — читайте их в том же правиле или в прицепленном сразу следом.',
      ),
    ],
    seeAlso: ['rx', 'logdata', 'setvar', 'TX', 'detectSQLi'],
  },

  initcol: {
    summary: l(
      'Creates or loads a persistent collection keyed by the given value — most often IP. Everything that has to survive between requests, from rate limits to lockouts, starts here.',
      'Создаёт или загружает постоянную коллекцию с заданным ключом — чаще всего по IP. Всё, что должно пережить запрос, от ограничения частоты до блокировок, начинается здесь.',
    ),
    syntax: 'initcol:ip=%{REMOTE_ADDR}',
    tech: {
      scope: l(
        'Requires SecDataDir; the collection is stored on disk and shared between worker processes.',
        'Требует SecDataDir; коллекция хранится на диске и разделяется между рабочими процессами.',
      ),
      cost: l(
        'A disk read and write per request, plus locking — do it once in phase 1, not in every rule.',
        'Чтение и запись на диск на каждый запрос плюс блокировки — делайте это один раз в фазе 1, а не в каждом правиле.',
      ),
    },
    gotchas: [
      l(
        'Keying by IP counts everyone behind a NAT as one client; keying by a client-supplied value lets the client reset its own counter.',
        'Ключ по IP считает всех за NAT одним клиентом; ключ по значению от клиента позволяет клиенту сбрасывать собственный счётчик.',
      ),
    ],
    example: {
      code: 'SecAction "id:1204,phase:1,pass,nolog,initcol:ip=%{REMOTE_ADDR}"\nSecRule IP:REQ_COUNT "@gt 100" "id:1205,phase:1,drop,msg:\'Rate limit\'"',
    },
    seeAlso: ['setvar', 'expirevar', 'deprecatevar', 'IP', 'SecDataDir'],
  },

  expirevar: {
    summary: l(
      'Gives a collection variable a lifetime: after N seconds it disappears. This is what turns a counter into a rate limit and a flag into a temporary ban.',
      'Задаёт переменной коллекции срок жизни: через N секунд она исчезает. Именно это превращает счётчик в ограничение частоты, а флаг — во временную блокировку.',
    ),
    syntax: 'expirevar:ip.blocked=3600',
    tech: {
      scope: l(
        'Only meaningful for persistent collections; the expiry is checked when the collection is read.',
        'Осмысленно только для постоянных коллекций; истечение проверяется при чтении коллекции.',
      ),
    },
    gotchas: [
      l(
        'A counter without expirevar grows forever and eventually blocks a legitimate client that has simply been around long enough.',
        'Счётчик без expirevar растёт вечно и рано или поздно блокирует легитимного клиента просто за долгую жизнь.',
      ),
    ],
    seeAlso: ['setvar', 'deprecatevar', 'initcol', 'IP'],
  },

  deprecatevar: {
    summary: l(
      'Decays a counter over time: subtract N units for every M seconds elapsed. A softer alternative to expirevar — the score fades instead of vanishing at once.',
      'Плавно уменьшает счётчик со временем: вычитать N единиц за каждые M секунд. Мягкая альтернатива expirevar — счёт затухает, а не пропадает разом.',
    ),
    syntax: 'deprecatevar:ip.score=60/300',
    tech: {
      argument: l(
        'value/seconds — how much to subtract per interval.',
        'значение/секунды — сколько вычитать за интервал.',
      ),
    },
    seeAlso: ['expirevar', 'setvar', 'initcol'],
  },

  setuid: {
    summary: l(
      'Binds the transaction to a USER collection keyed by the given value, usually the authenticated user name. Lets rules count and remember per account instead of per address.',
      'Привязывает транзакцию к коллекции USER с заданным ключом, обычно именем аутентифицированного пользователя. Позволяет правилам считать и запоминать по учётной записи, а не по адресу.',
    ),
    syntax: 'setuid:%{ARGS.username}',
    gotchas: [
      l(
        'Taking the key straight from a request argument means an attacker chooses whose counter to increment.',
        'Ключ, взятый прямо из аргумента запроса, означает, что атакующий сам выбирает, чей счётчик увеличить.',
      ),
    ],
    seeAlso: ['setsid', 'setrsc', 'USER', 'initcol'],
  },

  setsid: {
    summary: l(
      'Binds the transaction to a SESSION collection keyed by the session identifier, typically taken from a cookie. The basis for session-scoped anomaly tracking.',
      'Привязывает транзакцию к коллекции SESSION с ключом по идентификатору сессии, обычно из cookie. Основа для отслеживания аномалий в пределах сессии.',
    ),
    syntax: 'setsid:%{REQUEST_COOKIES.PHPSESSID}',
    seeAlso: ['setuid', 'SESSION', 'REQUEST_COOKIES', 'initcol'],
  },

  setrsc: {
    summary: l(
      'Binds the transaction to a RESOURCE collection keyed by the resource being requested. Useful for per-endpoint statistics and limits.',
      'Привязывает транзакцию к коллекции RESOURCE с ключом по запрашиваемому ресурсу. Полезно для статистики и лимитов на конкретный эндпоинт.',
    ),
    syntax: 'setrsc:%{REQUEST_FILENAME}',
    seeAlso: ['setuid', 'setsid', 'initcol'],
  },

  setenv: {
    summary: l(
      'Sets an environment variable visible to the rest of the web server. The bridge between a rule and the outside world: the access log, mod_headers, the application.',
      'Устанавливает переменную окружения, видимую остальному веб-серверу. Мост между правилом и внешним миром: журналом доступа, mod_headers, приложением.',
    ),
    syntax: 'setenv:MODSEC_FLAG=1',
    tech: {
      scope: l(
        'Read by other modules within the same request; it does not survive into the next one.',
        'Читается другими модулями в пределах того же запроса; до следующего не доживает.',
      ),
    },
    seeAlso: ['setvar', 'ENV', 'exec'],
  },

  exec: {
    summary: l(
      'Runs an external script or a Lua file when the rule matches — for a notification, a firewall rule, a custom check. Non-disruptive: the result does not change the verdict.',
      'Запускает внешний скрипт или Lua-файл при срабатывании правила — для уведомления, правила фаервола, своей проверки. Неразрушающее: результат не меняет вердикт.',
    ),
    syntax: 'exec:/usr/local/bin/notify.sh',
    tech: {
      cost: l(
        'A process is spawned inside request processing; under attack the rule fires often, and that is exactly when the spawns hurt most.',
        'Процесс порождается внутри обработки запроса; под атакой правило срабатывает часто — и именно тогда эти запуски бьют больнее всего.',
      ),
    },
    gotchas: [
      l(
        'Passing request data to a shell script is a command-injection hole in your own defence.',
        'Передача данных запроса в shell-скрипт — дыра с инъекцией команд в вашей же защите.',
      ),
    ],
    seeAlso: ['setenv', 'inspectFile', 'SecRuleScript'],
  },

  ctl: {
    summary: l(
      'Changes engine settings for the current transaction only: turn the rule engine off, disable a rule by id, switch the body processor, adjust audit parts. The clean way to write an exception without touching the rule it applies to.',
      'Меняет настройки движка только для текущей транзакции: выключить движок правил, отключить правило по id, сменить обработчик тела, поправить состав аудита. Аккуратный способ написать исключение, не трогая само правило.',
    ),
    syntax: 'ctl:ruleRemoveById=942100  |  ctl:requestBodyProcessor=JSON  |  ctl:ruleEngine=Off',
    tech: {
      scope: l(
        'Applies from the moment it runs, so it must execute before the rule it affects — the phase and the position in the file both matter.',
        'Действует с момента выполнения, поэтому должно отработать раньше того правила, на которое влияет: важны и фаза, и место в файле.',
      ),
    },
    gotchas: [
      l(
        'ctl:ruleEngine=Off disables the entire WAF for that request; scope it as narrowly as you possibly can.',
        'ctl:ruleEngine=Off выключает весь WAF для этого запроса; ограничивайте условие настолько узко, насколько возможно.',
      ),
      l(
        'A body-processor change must happen in phase 1 — by phase 2 the body has already been parsed.',
        'Смена обработчика тела должна происходить в фазе 1: к фазе 2 тело уже разобрано.',
      ),
    ],
    example: {
      code: 'SecRule REQUEST_FILENAME "@streq /api/import" \\\n    "id:1206,phase:1,pass,nolog,ctl:ruleRemoveTargetById=942100;ARGS:payload"',
      caption: l(
        'A targeted exclusion: rule 942100 stops looking at one argument, everything else stays on.',
        'Точечное исключение: правило 942100 перестаёт смотреть на один аргумент, всё остальное продолжает работать.',
      ),
    },
    seeAlso: ['SecRuleRemoveById', 'SecRuleUpdateTargetById', 'allow', 'skipAfter'],
  },

  multiMatch: {
    summary: l(
      'Re-runs the operator after every transformation instead of only at the end of the pipeline. Catches payloads that are visible in an intermediate form but not in the final one.',
      'Перезапускает оператор после каждой трансформации, а не только в конце конвейера. Ловит нагрузки, которые видны в промежуточной форме, но не в итоговой.',
    ),
    syntax: 'multiMatch',
    tech: {
      cost: l(
        'Multiplies the operator cost by the number of transformations — on @rx over a large body that is the difference between fast and unusable.',
        'Умножает стоимость оператора на число трансформаций — для @rx по большому телу это разница между «быстро» и «непригодно».',
      ),
    },
    gotchas: [
      l(
        'It also multiplies false positives: an intermediate form can look like an attack while the real value is harmless.',
        'Он умножает и ложные срабатывания: промежуточная форма может выглядеть атакой, хотя настоящее значение безобидно.',
      ),
    ],
    seeAlso: ['none', 'rx', 'capture'],
  },

  status: {
    summary: l(
      'The HTTP status code used by the disruptive action. On its own it does nothing — it only supplies a number to deny or redirect.',
      'HTTP-код, который использует разрушающее действие. Сам по себе ничего не делает — только подставляет число для deny или redirect.',
    ),
    syntax: 'deny,status:403',
    tech: {
      fallback: l(
        'Without it deny answers 403 and redirect answers 302, unless SecDefaultAction says otherwise.',
        'Без него deny отвечает 403, а redirect — 302, если SecDefaultAction не говорит иного.',
      ),
    },
    gotchas: [
      l(
        'status next to pass is dead weight: nothing is being returned.',
        'status рядом с pass — мёртвый груз: ничего не возвращается.',
      ),
      l(
        '404 hides the WAF but lies to monitoring; 403 is honest and easier to support.',
        '404 прячет WAF, но обманывает мониторинг; 403 честнее и проще в поддержке.',
      ),
    ],
    seeAlso: ['deny', 'redirect', 'SecDefaultAction'],
  },

  append: {
    summary: l(
      'Appends text to the response body — a warning banner, a script, a notice. Content injection, not inspection.',
      'Дописывает текст в конец тела ответа — баннер с предупреждением, скрипт, уведомление. Это внедрение контента, а не проверка.',
    ),
    syntax: "append:'<!-- inspected -->'",
    tech: {
      scope: l(
        'Requires SecContentInjection On and a text response; ModSecurity v2 only.',
        'Требует SecContentInjection On и текстовый ответ; только ModSecurity v2.',
      ),
    },
    gotchas: [
      l(
        'Injecting into JSON or a binary response corrupts it — check RESPONSE_CONTENT_TYPE first.',
        'Внедрение в JSON или бинарный ответ портит его — сначала проверьте RESPONSE_CONTENT_TYPE.',
      ),
    ],
    seeAlso: ['prepend', 'SecContentInjection', 'rsub', 'RESPONSE_CONTENT_TYPE'],
  },

  prepend: {
    summary: l(
      'Puts text at the start of the response body. Same requirements and the same content-type caveat as append.',
      'Помещает текст в начало тела ответа. Требования те же, что у append, и та же оговорка про тип содержимого.',
    ),
    syntax: "prepend:'<div>notice</div>'",
    seeAlso: ['append', 'SecContentInjection'],
  },

  sanitiseArg: {
    summary: l(
      'Masks the value of a named argument in the audit log. The straightforward way to keep passwords and tokens out of stored traffic.',
      'Маскирует значение указанного аргумента в журнале аудита. Прямой способ не хранить пароли и токены в сохранённом трафике.',
    ),
    syntax: 'sanitiseArg:password',
    tech: {
      scope: l(
        'Affects the audit log only — the value is still inspected by rules as usual.',
        'Влияет только на журнал аудита — правила по-прежнему проверяют настоящее значение.',
      ),
    },
    seeAlso: ['sanitiseMatched', 'sanitiseMatchedBytes', 'sanitiseRequestHeader'],
  },

  sanitiseMatched: {
    summary: l(
      'Masks whichever variable triggered the match. Useful when you do not know the field name in advance — a rule over all ARGS, for example.',
      'Маскирует ту переменную, которая вызвала срабатывание. Полезно, когда имя поля заранее неизвестно, — например, в правиле по всем ARGS.',
    ),
    syntax: 'sanitiseMatched',
    seeAlso: ['sanitiseMatchedBytes', 'sanitiseArg', 'MATCHED_VAR'],
  },

  sanitiseMatchedBytes: {
    summary: l(
      'Masks only the bytes that actually matched, leaving the rest of the value readable. The right balance for card numbers: enough context to investigate, nothing sensitive stored.',
      'Маскирует только совпавшие байты, оставляя остальное значение читаемым. Верный баланс для номеров карт: контекста хватает для разбора, чувствительного не сохраняется.',
    ),
    syntax: 'sanitiseMatchedBytes  |  sanitiseMatchedBytes:0/4',
    tech: {
      argument: l(
        'Optionally left/right — how many bytes to leave visible on each side.',
        'Необязательно левое/правое — сколько байтов оставить видимыми с каждой стороны.',
      ),
    },
    seeAlso: ['sanitiseMatched', 'verifyCC', 'capture'],
  },

  sanitiseRequestHeader: {
    summary: l(
      'Masks a named request header in the audit log — Authorization and Cookie being the obvious candidates.',
      'Маскирует указанный заголовок запроса в журнале аудита — очевидные кандидаты Authorization и Cookie.',
    ),
    syntax: 'sanitiseRequestHeader:Authorization',
    seeAlso: ['sanitiseResponseHeader', 'sanitiseArg', 'REQUEST_HEADERS'],
  },

  sanitiseResponseHeader: {
    summary: l(
      'Masks a named response header in the audit log, typically Set-Cookie.',
      'Маскирует указанный заголовок ответа в журнале аудита, обычно Set-Cookie.',
    ),
    syntax: 'sanitiseResponseHeader:Set-Cookie',
    seeAlso: ['sanitiseRequestHeader', 'RESPONSE_HEADERS'],
  },

  xmlns: {
    summary: l(
      'Declares an XML namespace so that XPath expressions in XML rules can address prefixed elements.',
      'Объявляет пространство имён XML, чтобы XPath-выражения в правилах по XML могли адресовать элементы с префиксом.',
    ),
    syntax: "xmlns:soap='http://schemas.xmlsoap.org/soap/envelope/'",
    tech: {
      scope: l(
        'Only meaningful once the body has been parsed as XML via ctl:requestBodyProcessor=XML.',
        'Осмысленно только после разбора тела как XML через ctl:requestBodyProcessor=XML.',
      ),
    },
    seeAlso: ['XML', 'validateSchema', 'validateDTD', 'ctl'],
  },
};
