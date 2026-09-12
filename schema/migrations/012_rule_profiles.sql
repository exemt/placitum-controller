-- Пять профилей: default / strict / api + фикстуры allow / deny.
-- Тела CRS и *.data — из data/crs-src. Пересобрать:
--   node --experimental-strip-types src/compile/gen-profile-seed.ts

delete from rule_set_files;
delete from rule_sets;
delete from rule_files;

insert into rule_files (id, http_space_id, name, description, text_raw)
select x.id::uuid, s.id, x.name, x.description, x.text_raw
  from http_spaces s
  cross join (values
    ('a0000000-0000-4000-8000-000000000001', 'engine', 'Движок', $wafcrs$Include @coraza.conf-recommended
SecRuleEngine DetectionOnly
SecAuditEngine Off
SecAuditLog /dev/null
SecDebugLogLevel 0
SecResponseBodyAccess Off
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000002', 'engine-allow', 'Движок выключен', $wafcrs$SecRuleEngine Off
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000003', 'engine-deny', 'Движок блокирует сам', $wafcrs$SecRuleEngine On
SecAuditEngine Off
SecAuditLog /dev/null
SecDebugLogLevel 0
SecResponseBodyAccess Off
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000004', 'setup-pl1', 'CRS setup, паранойя 1', $wafcrs$Include @crs-setup.conf.example
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.blocking_paranoia_level=1"
SecAction "id:900110,phase:1,nolog,pass,t:none,setvar:tx.inbound_anomaly_score_threshold=5"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000005', 'setup-pl2', 'CRS setup, паранойя 2', $wafcrs$Include @crs-setup.conf.example
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.blocking_paranoia_level=2"
SecAction "id:900110,phase:1,nolog,pass,t:none,setvar:tx.inbound_anomaly_score_threshold=5"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000006', 'crs-init', 'CRS 901 + сканеры + LFI', $wafcrs$Include @owasp_crs/REQUEST-901-INITIALIZATION.conf
Include @owasp_crs/REQUEST-913-SCANNER-DETECTION.conf
Include @owasp_crs/REQUEST-930-APPLICATION-ATTACK-LFI.conf
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000007', 'crs-init-api', 'CRS 901 для API', $wafcrs$Include @owasp_crs/REQUEST-901-INITIALIZATION.conf
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000008', 'extra-default', 'Политика default', $wafcrs$SecRuleRemoveByTag "attack-dos"
SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=default"
SecRule REQUEST_URI "@beginsWith /healthz" "id:1000001,phase:1,allow,nolog"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000009', 'extra-strict', 'Политика strict поверх CRS', $wafcrs$SecRuleRemoveByTag "attack-dos"
SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=strict"
SecRule REQUEST_HEADERS:User-Agent "@rx (?i)nikto|sqlmap|nessus|w3af" \
  "id:1001001,phase:1,deny,status:403,msg:'scanner'"
SecRule ARGS "@rx \.\./" "id:1001002,phase:2,deny,status:403,msg:'lfi'"
SecRule ARGS "@rx (?:;|\|\||&&)\s*(?:wget|curl|bash|nc)\b" \
  "id:1001003,phase:2,deny,status:403,msg:'rce'"
$wafcrs$),
    ('a0000000-0000-4000-8000-00000000000a', 'extra-api', 'Политика api поверх CRS', $wafcrs$SecRuleRemoveByTag "attack-dos"
SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=api"
SecRule ARGS "@rx (?i)union\s+select" "id:1002001,phase:2,deny,status:403,msg:'sqli'"
SecRule ARGS "@rx (?i)<script" "id:1002002,phase:2,deny,status:403,msg:'xss'"
SecRule REQUEST_HEADERS:Content-Type "@rx (?i)text/xml|application/xml" \
  "id:1002003,phase:1,pass,nolog,setvar:tx.modsec_api=xml"
$wafcrs$),
    ('a0000000-0000-4000-8000-00000000000b', 'extra-deny', 'Безусловный отказ', $wafcrs$SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=deny"
SecAction "id:1000900,phase:1,log,t:none,deny,status:403,msg:'modsec fixture: unconditional deny'"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000010', 'crs-934', 'CRS generic + SSRF', $wafcrs$# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:934011,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:934012,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#


# [ NodeJS Insecure unserialization / generic RCE signatures ]
#
# Libraries performing insecure unserialization:
# - node-serialize: _$$ND_FUNC$$_ (CVE-2017-5941)
# - funcster: __js_function
#
# See:
# https://opsecx.com/index.php/2017/02/08/exploiting-node-js-deserialization-bug-for-remote-code-execution/
# https://www.acunetix.com/blog/web-security-zone/deserialization-vulnerabilities-attacking-deserialization-in-js/
#
# Some generic snippets used:
# - function() {
# - new Function(
# - eval(
# - String.fromCharCode(
#
# Last two are used by nodejsshell.py,
# https://github.com/ajinabraham/Node.Js-Security-Course/blob/master/nodejsshell.py
#
# As base64 is sometimes (but not always) used to encode serialized values,
# use multiMatch and t:base64decode.
#
# Regular expression generated from regex-assembly/934100.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934100
#
# Stricter sibling: 934101
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx _(?:\$\$ND_FUNC\$\$_|_js_function)|(?:\beval|new[\s\x0b]+Function[\s\x0b]*)\(|(?:String\.fromCharCod|Module:prototyp)e|function\(\)\{|this\.constructor|module\.exports=|\([\s\x0b]*[^0-9A-Z_a-z]child_process[^0-9A-Z_a-z][\s\x0b]*\)|cons(?:tructor:constructor|ole(?:\.(?:(?:debu|lo)g|error|info|trace|warn)(?:\.call)?\(|\[[\"'`](?:(?:debu|lo)g|error|info|trace|warn)[\"'`]\]))|process(?:\.(?:(?:a(?:ccess|ppendfile|rgv|vailability)|c(?:aveats|h(?:mod|own)|(?:los|opyfil)e|p|reate(?:read|write)stream)|ex(?:ec(?:file)?|ists)|f(?:ch(?:mod|own)|data(?:sync)?|s(?:tat|ync)|utimes)|inodes|l(?:chmod|ink|stat|utimes)|mkd(?:ir|temp)|open(?:dir)?|r(?:e(?:ad(?:dir|file|link|v)?|name)|m)|s(?:pawn(?:file)?|tat|ymlink)|truncate|u(?:n(?:link|watchfile)|times)|w(?:atchfile|rite(?:file|v)?))(?:sync)?(?:\.call)?\(|binding|constructor|env|global|main(?:Module)?|process|require)|\[[\"'`](?:(?:a(?:ccess|ppendfile|rgv|vailability)|c(?:aveats|h(?:mod|own)|(?:los|opyfil)e|p|reate(?:read|write)stream)|ex(?:ec(?:file)?|ists)|f(?:ch(?:mod|own)|data(?:sync)?|s(?:tat|ync)|utimes)|inodes|l(?:chmod|ink|stat|utimes)|mkd(?:ir|temp)|open(?:dir)?|r(?:e(?:ad(?:dir|file|link|v)?|name)|m)|s(?:pawn(?:file)?|tat|ymlink)|truncate|u(?:n(?:link|watchfile)|times)|w(?:atchfile|rite(?:file|v)?))(?:sync)?|binding|constructor|env|global|main(?:Module)?|process|require)[\"'`]\])|(?:binding|constructor|env|global|main(?:Module)?|process|require)\[|require(?:\.(?:resolve(?:\.call)?\(|main|extensions|cache)|\[[\"'`](?:(?:resolv|cach)e|main|extensions)[\"'`]\])" \
    "id:934100,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:jsDecode,t:removeWhitespace,t:base64Decode,t:urlDecodeUni,t:jsDecode,t:removeWhitespace,\
    msg:'Node.js Injection Attack 1/2',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-javascript',\
    tag:'platform-multi',\
    tag:'platform-nodejs',\
    tag:'attack-rce',\
    tag:'attack-injection-generic',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    multiMatch,\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# -=[ SSRF Attacks ]=-
#
# We provide only partial protection to SSRF. DNS Rebinding attacks needs
# to be handled at application level, and even those might be difficult to catch.
#
# PL1 rules are based on common attacks on cloud providers, based on well-known URLs.
#
# -=[ References ]=-
# https://highon.coffee/blog/ssrf-cheat-sheet/
# https://cwe.mitre.org/data/definitions/918.html
# https://capec.mitre.org/data/definitions/664.html)
#
# Preventing: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_FILENAME|ARGS_NAMES|ARGS|XML:/* "@pmFromFile ssrf.data" \
    "id:934110,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:'Possible Server Side Request Forgery (SSRF) Attack: Cloud provider metadata URL in Parameter',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-ssrf',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/225/664',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# This rule detects SSRF attempts using hostnames without schemes.
# Some frameworks and libraries add implicit 'http://' or 'https://' schemes
# when processing URLs, making scheme-less hostnames effective attack vectors.
#
# Examples:
# - localhost/
# - host.docker.internal/
# - kubernetes.default.svc.cluster.local/
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_FILENAME|ARGS_NAMES|ARGS|XML:/* "@pmFromFile ssrf-no-scheme.data" \
    "id:934190,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:'Possible Server Side Request Forgery (SSRF) Attack: Scheme-less localhost or internal hostname detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-ssrf',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/225/664',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# JavaScript prototype pollution injection attempts
#
# Example from https://hackerone.com/reports/869574 critical
# vulnerability in the TypeORM library:
# {"text":"a","title":{"__proto__":{"where":{"name":"sqlinjection","where":null}}}}
#
# Test cases are based on this list of payloads:
# https://github.com/BlackFan/client-side-prototype-pollution/blob/master/README.md
#
# See also: https://cwe.mitre.org/data/definitions/1321.html
#
# Note: only server-based (not DOM-based) attacks are covered here.

# Regular expression generated from regex-assembly/934130.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934130
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx __proto__|constructor[\s\x0b]*(?:\.|\]?\[)[\s\x0b]*prototype" \
    "id:934130,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:jsDecode,\
    msg:'JavaScript Prototype Pollution',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-javascript',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'attack-injection-generic',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1/180/77',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    multiMatch,\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# [ Ruby generic RCE signatures ]
#
# Detects Ruby-based injection attacks.
# Example: Process.spawn("id")
#
# Regular expression generated from regex-assembly/934150.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934150
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx Process[\s\x0b]*\.[\s\x0b]*spawn[\s\x0b]*\(" \
    "id:934150,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:'Ruby Injection Attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-ruby',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'attack-injection-generic',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# [ NodeJS DoS signatures ]
#
# NodeJS runs in a single thread, so any evaluated payloads that block execution can cause an easy DoS.
# This rule attempts to block e.g. while(true).
#
# Regular expression generated from regex-assembly/934160.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934160
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx while[\s\x0b]*\([\s\x0b\(]*(?:!+(?:false|null|undefined|NaN|[\+\-]?0|\"{2}|'{2}|`{2})|(?:!!)*(?:(?:t(?:rue|his)|[\+\-]?(?:Infinity|[1-9][0-9]*)|new [A-Za-z][0-9A-Z_a-z]*|window|String|(?:Boolea|Functio)n|Object|Array)\b|\{[^\}]*\}|\[[^\]]*\]|\"[^\"]+\"|'[^']+'|`[^`]+`)).*\)" \
    "id:934160,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:jsDecode,t:base64Decode,t:urlDecodeUni,t:jsDecode,t:replaceComments,\
    msg:'Node.js DoS attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-javascript',\
    tag:'platform-nodejs',\
    tag:'attack-rce',\
    tag:'attack-injection-generic',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    multiMatch,\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# [ PHP data: scheme ]
#
# PHP supports the `data:` scheme without using `//` before the content-type.
#
# Regular expression generated from regex-assembly/934170.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934170
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx ^data:(?:(?:\*|[^!\"\(\),/:-\?\[-\]\{\}]+)/(?:\*|[^!\"\(\),/:-\?\[-\]\{\}]+)|\*)(?:[\s\x0b]*;[\s\x0b]*(?:charset[\s\x0b]*=[\s\x0b]*\"?(?:iso-8859-15?|utf-8|windows-1252)\b\"?|(?:[^\s\x0b-\"\(\),/:-\?\[-\]c\{\}]|c(?:[^!\"\(\),/:-\?\[-\]h\{\}]|h(?:[^!\"\(\),/:-\?\[-\]a\{\}]|a(?:[^!\"\(\),/:-\?\[-\]r\{\}]|r(?:[^!\"\(\),/:-\?\[-\]s\{\}]|s(?:[^!\"\(\),/:-\?\[-\]e\{\}]|e[^!\"\(\),/:-\?\[-\]t\{\}]))))))[^!\"\(\),/:-\?\[-\]\{\}]*[\s\x0b]*=[\s\x0b]*[^!\(\),/:-\?\[-\]\{\}]+);?)*(?:[\s\x0b]*,[\s\x0b]*(?:(?:\*|[^!\"\(\),/:-\?\[-\]\{\}]+)/(?:\*|[^!\"\(\),/:-\?\[-\]\{\}]+)|\*)(?:[\s\x0b]*;[\s\x0b]*(?:charset[\s\x0b]*=[\s\x0b]*\"?(?:iso-8859-15?|utf-8|windows-1252)\b\"?|(?:[^\s\x0b-\"\(\),/:-\?\[-\]c\{\}]|c(?:[^!\"\(\),/:-\?\[-\]h\{\}]|h(?:[^!\"\(\),/:-\?\[-\]a\{\}]|a(?:[^!\"\(\),/:-\?\[-\]r\{\}]|r(?:[^!\"\(\),/:-\?\[-\]s\{\}]|s(?:[^!\"\(\),/:-\?\[-\]e\{\}]|e[^!\"\(\),/:-\?\[-\]t\{\}]))))))[^!\"\(\),/:-\?\[-\]\{\}]*[\s\x0b]*=[\s\x0b]*[^!\(\),/:-\?\[-\]\{\}]+);?)*)*" \
    "id:934170,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'PHP data scheme attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-php',\
    tag:'platform-multi',\
    tag:'attack-ssrf',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:934013,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:934014,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#

# This rule is a stricter sibling of 934100.
# Regular expression generated from regex-assembly/934101.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934101
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?:close|exists|fork|(?:ope|spaw)n|re(?:ad|quire)|w(?:atch|rite))[\s\x0b]*\(" \
    "id:934101,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:jsDecode,t:base64Decode,t:urlDecodeUni,t:jsDecode,\
    msg:'Node.js Injection Attack 2/2',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-javascript',\
    tag:'platform-nodejs',\
    tag:'attack-rce',\
    tag:'attack-injection-generic',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    multiMatch,\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# -=[ SSRF Attacks ]=-
#
# PL2 rules adds SSRF capture for common evasion techniques.
#
# We add captures for these evasion techniques: (see source in util/regexp-assemble/data/regexp-934120.data)
# http://425.510.425.510/ Dotted decimal with overflow (already covered by RFI rule 931100)
# http://2852039166/ Dotless decimal - \d{10}
# http://7147006462/ Dotless decimal with overflow - \d{10}
# http://0xA9.0xFE.0xA9.0xFE/ Dotted hexadecimal - (?:0x[a-f0-9]{2}\.){3}0x[a-f0-9]{2}
# http://0xA9FEA9FE/ Dotless hexadecimal - 0x[a-f0-9]{8}
# http://0x41414141A9FEA9FE/ Dotless hexadecimal with overflow - 0x[a-f0-9]{16}
# http://0251.0376.0251.0376/ Dotted octal - Covered by the same below
# http://0251.00376.000251.0000376/ Dotted octal with padding - (?:0{1,4}\d{3}\.){3}0{1,4}\d{3})
# http://169.254.43518/ - (?:\d{1,3}\.){2}\.\d{5}
# http://169.16689662/ - \d{1,3}\.\d{8}
# http://[::ffff:a9fe:a9fe] IPV6 Compressed - IPv6 regex from https://ihateregex.io/expr/ipv6/, with [0-9] converted to \d and with non-capturing groups (below)
# http://[0:0:0:0:0:ffff:a9fe:a9fe] IPV6 Expanded -  (?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d)\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d)|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|(2[0-4]|1{0,1}\d){0,1}\d)\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d))
# http://[0:0:0:0:0:ffff:169.254.169.254] IPV6/IPV4 - ((?:[0-9a-fA-F]{1,4}:){6}(?:(25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d)\.){3,3}(?:25[0-5]|(?:2[0-4]|1{0,1}\d){0,1}\d))
# http://[::]
# http://127.88.23.245:22/+&@google.com:80#+@google.com:80/ (already covered by RFI rule 931100)
# http://127.88.23.245:22/?@google.com:80/ (already covered by RFI rule 931100)
# http://127.88.23.245:22/#@www.google.com:80/ (already covered by RFI rule 931100)
# http://google.com:80\\@127.88.23.245:22/ (already covered by RFI rule 931100)
# http://google.com:80+&@127.88.23.245:22/#+@google.com:80/
# http://google.com:80+&@google.com:80#+@127.88.23.245:22/
#
# Regular expression generated from regex-assembly/934120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934120
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_FILENAME|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:a(?:cap|f[ps]|ttachment)|b(?:eshare|itcoin|lob)|c(?:a(?:llto|p)|id|vs|ompress.(?:zlib|bzip2))|d(?:a(?:v|ta)|ict|n(?:s|tp))|e(?:d2k|xpect)|f(?:(?:ee)?d|i(?:le|nger|sh)|tps?)|g(?:it|o(?:pher)?|lob)|h(?:323|ttps?)|i(?:ax|cap|(?:ma|p)ps?|rc[6s]?)|ja(?:bbe)?r|l(?:dap[is]?|ocal_file)|m(?:a(?:ilto|ven)|ms|umble)|n(?:e(?:tdoc|ws)|fs|ntps?)|ogg|p(?:aparazzi|h(?:ar|p)|op(?:2|3s?)|r(?:es|oxy)|syc)|r(?:mi|sync|tm(?:f?p)?|ar)|s(?:3|ftp|ips?|m(?:[bs]|tps?)|n(?:ews|mp)|sh(?:2(?:.(?:s(?:hell|(?:ft|c)p)|exec|tunnel))?)?|vn(?:\+ssh)?)|t(?:e(?:amspeak|lnet)|ftp|urns?)|u(?:dp|nreal|t2004)|v(?:entrilo|iew-source|nc)|w(?:ebcal|ss?)|x(?:mpp|ri)|zip):/?/?(?:[0-9]{7,10}|(?:0x[0-9a-f]{2}\.){3}0x[0-9a-f]{2}|0x(?:[0-9a-f]{8}|[0-9a-f]{16})|(?:0{1,4}[0-9]{1,3}\.){3}0{1,4}[0-9]{1,3}|[0-9]{1,3}\.(?:[0-9]{1,3}\.[0-9]{5}|[0-9]{8})|(?:\x5c\x5c[\-0-9a-z]\.?_?)+|\[[0-:a-f]+(?:[\.0-9]+|%[0-9A-Z_a-z]+)?\]|[a-z][\-\.0-9A-Z_a-z]{1,255}:[0-9]{1,5}(?:#?[\s\x0b]*&?@(?:(?:[0-9]{1,3}\.){3}[0-9]{1,3}|[a-z][\-\.0-9A-Z_a-z]{1,255}):[0-9]{1,5}/?)+|[\.0-9]{0,11}(?:\x{e2}(?:\x91[\xa0-\x{bf}]|\x92[\x80-\x{bf}]|\x93[\x80-\x{a9}\x{ab}-\x{bf}])|\x{e3}\x80\x82)+)" \
    "id:934120,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:'Possible Server Side Request Forgery (SSRF) Attack: URL Parameter using IP Address',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-ssrf',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/225/664',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


# [ Perl generic RCE signatures ]
#
# Detects Perl-based injection attacks.
# Example: @{[system whoami]}
#
# Regular expression generated from regex-assembly/934140.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 934140
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx @+\{[\s\x0b]*\[" \
    "id:934140,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:'Perl Injection Attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-perl',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'attack-injection-generic',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


# [ Generic RCE signatures ]
#
# Detects General SSTI attacks.
# Example: <%= File.open('/etc/passwd').read %>
# Note: there is another rule 941380 that checks for {{.*}} regex.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?:\{%[^%}]*%}|<%=?[^%>]*%>)" \
    "id:934180,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:'SSTI Attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'platform-multi',\
    tag:'attack-ssti',\
    tag:'attack-injection-generic',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-GENERIC',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:934015,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:934016,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#

SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:934017,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:934018,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#



#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-934-APPLICATION-ATTACK-GENERIC"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000011', 'crs-941', 'CRS XSS', $wafcrs$# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:941011,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:941012,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#


# In CRS v4.0, we have added REQUEST_FILENAME to the list of variables to
# be checked for XSS to catch path-based XSS exploits such as:
# /index.php/%3Csvg/onload=alert()
#
# However, the REQUEST_FILENAME is always populated (while ARGS etc. are
# only set on some requests) and we found that always checking the
# REQUEST_FILENAME has a significant performance impact.
# Therefore, we are disabling the REQUEST_FILENAME XSS checks when the
# REQUEST_FILENAME is clearly not containing special characters necessary
# for a successful XSS.
#
# Some bona-fide REQUEST_FILENAMEs will still contain special characters
# and will be checked by the rules, but it will be a much lower amount,
# and that is a trade-off we are willing to make.
#
# So, we check for XSS in REQUEST_FILENAME only if it contains
# other characters than alphanumeric characters, hyphens, underscores etc.
# typically found in filenames and paths:
#
# - ascii 20 (whitespace)
# - ascii 45-47 (- . /)
# - ascii 48-57 (0-9)
# - ascii 65-90 (A-Z)
# - ascii 95 (underscore)
# - ascii 97-122 (a-z)
#
# If just these characters are present, we make use of a special tag to remove
# REQUEST_FILENAME from the target list of all the 941xxx rules starting 941100.
#
# Please note that it would be preferable to start without REQUEST_FILENAME in the
# target list and to add it on a case to case base, but the rule language does not
# support this feature at runtime.
#
SecRule REQUEST_FILENAME "!@validateByteRange 20,45-47,48-57,65-90,95,97-122" \
    "id:941010,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    ctl:ruleRemoveTargetByTag=xss-perf-disable;REQUEST_FILENAME,\
    ver:'OWASP_CRS/4.25.0'"


#
# -=[ Libinjection - XSS Detection ]=-
#
# Ref: https://github.com/client9/libinjection
# Ref: https://speakerdeck.com/ngalbreath/libinjection-from-sqli-to-xss
#
# -=[ Targets ]=-
#
# 941100: PL1 : REQUEST_COOKIES|
#               REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|
#               ARGS_NAMES|ARGS|XML:/*
#
# 941101: PL2 : REQUEST_FILENAME|REQUEST_HEADERS:Referer
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|ARGS_NAMES|ARGS|XML:/* "@detectXSS" \
    "id:941100,\
    phase:2,\
    block,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'XSS Attack Detected via libinjection',\
    logdata:'Matched Data: XSS data found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# -=[ XSS Filters - Category 1 ]=-
# http://xssplayground.net23.net/xssfilter.html
# script tag based XSS vectors, e.g., <script> alert(1)</script>
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_FILENAME|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|ARGS_NAMES|ARGS|XML:/* "@rx (?i)<script[^>]*>[\s\S]*?" \
    "id:941110,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'XSS Filter - Category 1: Script Tag Vector',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# -=[ XSS Filters - Category 2 ]=-
# XSS vectors making use of event handlers like onerror, onload etc, e.g., <body onload="alert(1)">
#
# We are not listing all the known event handlers like rule 941160, but we
# limit the alerts to keywords of 3-50 characters after the prefix ("on").
#
# The shortest known event is "onget". The longest known event is "onwebkitplaybacktargetavailabilitychanged"
# with 39 chars after the prefix. 50 chars adds a little bit of safety.
#
# The regex requires the equals sign to be followed by a non-equals character (=[^=])
# to prevent false positives with base64-encoded strings (which often end in = or ==).
# This improvement allows the rule to be placed at PL1 despite having previously been
# moved to PL2 in v3.4 due to base64-related false positives with the older regex.
#
# Regular expression generated from regex-assembly/941120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941120
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[\t-\r \"'\(,/-9;=`]on[a-z]{3,50}[\t-\r \(,;]*?=[^=]" \
    "id:941120,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'XSS Filter - Category 2: Event Handler Vector',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# -=[ XSS Filters - Category 3 ]=-
#
# Regular expression generated from regex-assembly/941130.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941130
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i).(?:\b(?:(?:x(?:link:href|html|mlns)|data:text/html|formaction)\b|pattern[\s\x0b]*=)|(?:!ENTITY[\s\x0b]+(?:%[\s\x0b]+)?[^\s\x0b]+[\s\x0b]+(?:SYSTEM|PUBLIC)|@import|;base64)\b)" \
    "id:941130,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'XSS Filter - Category 3: Attribute Vector',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# -=[ XSS Filters - Category 4 ]=-
# XSS vectors making use of javascript uri and tags, e.g., <p style="background:url(javascript:alert(1))">
# https://portswigger.net/web-security/cross-site-scripting/cheat-sheet#css-expressions-ie7
# https://portswigger.net/web-security/cross-site-scripting/cheat-sheet#behaviors-for-older-modes-of-ie
# examples: https://regex101.com/r/FFEpsh/1
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[a-z]+=(?:[^:=]+:.+;)*?[^:=]+:url\(javascript" \
    "id:941140,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,t:removeWhitespace,\
    msg:'XSS Filter - Category 4: Javascript URI Vector',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# -=[ NoScript XSS Filters ]=-
# Ref: http://noscript.net/
#
# [NoScript InjectionChecker] HTML injection
#
# Regular expression generated from regex-assembly/941160.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941160
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<[^0-9<>A-Z_a-z]*(?:[^\s\x0b\"'<>]*:)?[^0-9<>A-Z_a-z]*[^0-9A-Z_a-z]*?(?:s[^0-9A-Z_a-z]*?(?:c[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?p[^0-9A-Z_a-z]*?t|t[^0-9A-Z_a-z]*?y[^0-9A-Z_a-z]*?l[^0-9A-Z_a-z]*?e|v[^0-9A-Z_a-z]*?g|e[^0-9A-Z_a-z]*?t[^0-9>A-Z_a-z])|f[^0-9A-Z_a-z]*?o[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?m|d[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?l[^0-9A-Z_a-z]*?o[^0-9A-Z_a-z]*?g|m[^0-9A-Z_a-z]*?(?:a[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?q[^0-9A-Z_a-z]*?u[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?e|e[^0-9A-Z_a-z]*?t[^0-9A-Z_a-z]*?a[^0-9>A-Z_a-z])|(?:l[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?n[^0-9A-Z_a-z]*?k|o[^0-9A-Z_a-z]*?b[^0-9A-Z_a-z]*?j[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?c[^0-9A-Z_a-z]*?t|e[^0-9A-Z_a-z]*?m[^0-9A-Z_a-z]*?b[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?d|a[^0-9A-Z_a-z]*?(?:p[^0-9A-Z_a-z]*?p[^0-9A-Z_a-z]*?l[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?t|u[^0-9A-Z_a-z]*?d[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?o|n[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?m[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?t[^0-9A-Z_a-z]*?e)|p[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?m|i?[^0-9A-Z_a-z]*?f[^0-9A-Z_a-z]*?r[^0-9A-Z_a-z]*?a[^0-9A-Z_a-z]*?m[^0-9A-Z_a-z]*?e|b[^0-9A-Z_a-z]*?(?:a[^0-9A-Z_a-z]*?s[^0-9A-Z_a-z]*?e|o[^0-9A-Z_a-z]*?d[^0-9A-Z_a-z]*?y|i[^0-9A-Z_a-z]*?n[^0-9A-Z_a-z]*?d[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?n[^0-9A-Z_a-z]*?g[^0-9A-Z_a-z]*?s)|i[^0-9A-Z_a-z]*?m[^0-9A-Z_a-z]*?a?[^0-9A-Z_a-z]*?g[^0-9A-Z_a-z]*?e?|v[^0-9A-Z_a-z]*?i[^0-9A-Z_a-z]*?d[^0-9A-Z_a-z]*?e[^0-9A-Z_a-z]*?o)[^0-9>A-Z_a-z])|(?:<[0-9A-Z_a-z][^\s\x0b/]*[\s\x0b/]|[\"'](?:[^\s\x0b/]*[\s\x0b/])?)(?:background|formaction|lowsrc|on(?:a(?:bort|ctivate|d(?:apteradded|dtrack)|fter(?:print|(?:scriptexecu|upda)te)|lerting|n(?:imation(?:cancel|end|iteration|start)|tennastatechange)|ppcommand|u(?:dio(?:end|process|start)|xclick))|b(?:e(?:fore(?:(?:(?:(?:de)?activa|scriptexecu)t|toggl)e|c(?:opy|ut)|editfocus|input|p(?:aste|rint)|u(?:nload|pdate))|gin(?:Event)?)|l(?:ocked|ur)|oun(?:ce|dary)|roadcast|usy)|c(?:a(?:(?:ch|llschang)ed|nplay(?:through)?|rdstatechange)|(?:ell|fstate)change|h(?:a(?:rging(?:time)?cha)?nge|ecking)|l(?:ick|ose)|o(?:m(?:mand(?:update)?|p(?:lete|osition(?:end|start|update)))|n(?:nect(?:ed|ing)|t(?:extmenu|rolselect))|py)|u(?:echange|t))|d(?:ata(?:(?:availabl|chang)e|error|setc(?:hanged|omplete))|blclick|e(?:activate|livery(?:error|success)|vice(?:found|light|(?:mo|orienta)tion|proximity))|i(?:aling|s(?:abled|c(?:hargingtimechange|onnect(?:ed|ing))))|o(?:m(?:a(?:ctivate|ttrmodified)|(?:characterdata|subtree)modified|focus(?:in|out)|mousescroll|node(?:inserted(?:intodocument)?|removed(?:fromdocument)?))|wnloading)|r(?:ag(?:drop|e(?:n(?:d|ter)|xit)|(?:gestur|leav)e|over|start)|op)|urationchange)|e(?:mptied|n(?:abled|d(?:ed|Event)?|ter)|rror(?:update)?|xit)|f(?:ailed|i(?:lterchange|nish)|o(?:cus(?:in|out)?|rm(?:change|input))|ullscreenchange)|g(?:amepad(?:axismove|button(?:down|up)|(?:dis)?connected)|et)|h(?:ashchange|e(?:adphoneschange|l[dp])|olding)|i(?:cc(?:cardlockerror|infochange)|n(?:coming|put|valid))|key(?:down|press|up)|l(?:evelchange|o(?:ad(?:e(?:d(?:meta)?data|nd)|start)?|secapture)|y)|m(?:ark|essage|o(?:use(?:down|enter|(?:lea|mo)ve|o(?:ut|ver)|up|wheel)|ve(?:end|start)?|z(?:a(?:fterpaint|udioavailable)|(?:beforeresiz|orientationchang|t(?:apgestur|imechang))e|(?:edgeui(?:c(?:ancel|omplet)|start)e|network(?:down|up)loa)d|fullscreen(?:change|error)|m(?:agnifygesture(?:start|update)?|ouse(?:hittest|pixelscroll))|p(?:ointerlock(?:change|error)|resstapgesture)|rotategesture(?:start|update)?|s(?:crolledareachanged|wipegesture(?:end|start|update)?))))|no(?:match|update)|o(?:(?:bsolet|(?:ff|n)lin)e|pen|verflow(?:changed)?)|p(?:a(?:ge(?:hide|show)|int|(?:st|us)e)|lay(?:ing)?|o(?:inter(?:down|enter|(?:(?:lea|mo)v|rawupdat)e|o(?:ut|ver)|up)|p(?:state|up(?:hid(?:den|ing)|show(?:ing|n))))|ro(?:gress|pertychange))|r(?:atechange|e(?:adystatechange|ceived|movetrack|peat(?:Event)?|quest|s(?:et|ize|u(?:lt|m(?:e|ing)))|trieving)|ow(?:e(?:nter|xit)|s(?:delete|inserted)))|s(?:croll(?:end)?|e(?:arch|ek(?:complete|ed|ing)|lect(?:ionchange|start)?|n(?:ding|t)|t)|how|(?:ound|peech)(?:end|start)|t(?:a(?:lled|rt|t(?:echange|uschanged))|k(?:comma|sessione)nd|op)|u(?:bmit|ccess|spend)|vg(?:abort|error|(?:un)?load|resize|scroll|zoom))|t(?:ext|ime(?:out|update)|o(?:ggle|uch(?:cancel|en(?:d|ter)|(?:lea|mo)ve|start))|ransition(?:cancel|end|run|start))|u(?:n(?:derflow|handledrejection|load)|p(?:dateready|gradeneeded)|s(?:erproximity|sdreceived))|v(?:ersion|o(?:ic|lum)e)change|w(?:a(?:it|rn)ing|ebkit(?:animation(?:end|iteration|start)|(?:playbacktargetavailabilitychange|transitionen)d)|heel)|zoom)|ping|s(?:rc|tyle))[\x08-\n\f\r ]*?=" \
    "id:941160,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'NoScript XSS InjectionChecker: HTML Injection',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# [NoScript InjectionChecker] Attributes injection
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)(?:\W|^)(?:javascript:(?:[\s\S]+[=\x5c\(\[\.<]|[\s\S]*?(?:\bname\b|\x5c[ux]\d))|data:(?:(?:[a-z]\w+/\w[\w+-]+\w)?[;,]|[\s\S]*?;[\s\S]*?\b(?:base64|charset=)|[\s\S]*?,[\s\S]*?<[\s\S]*?\w[\s\S]*?>))|@\W*?i\W*?m\W*?p\W*?o\W*?r\W*?t\W*?(?:/\*[\s\S]*?)?(?:[\"']|\W*?u\W*?r\W*?l[\s\S]*?\()|[^-]*?-\W*?m\W*?o\W*?z\W*?-\W*?b\W*?i\W*?n\W*?d\W*?i\W*?n\W*?g[^:]*?:\W*?u\W*?r\W*?l[\s\S]*?\(" \
    "id:941170,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'NoScript XSS InjectionChecker: Attribute Injection',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# [Deny List Keywords from Node-Validator]
# https://github.com/validatorjs/validator.js/
# This rule has a stricter sibling 941181 (PL2) that covers the additional payload "-->"
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@pm document.cookie document.domain document.querySelector document.body.appendChild document.write .parentnode .innerhtml window.location -moz-binding <!-- <![cdata[" \
    "id:941180,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'Node-Validator Deny List Keywords',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-nodejs',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# -=[ XSS Filters from IE ]=-
# Ref: http://blogs.technet.com/srd/archive/2008/08/18/ie-8-xss-filter-architecture-implementation.aspx
# Ref: http://xss.cx/examples/ie/internet-exploror-ie9-xss-filter-rules-example-regexp-mshtmldll.txt
#
# Regular expression generated from regex-assembly/941190.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941190
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<style.*?>.*?(?:@[\x5ci]|(?:[:=]|&#x?0*(?:58|3[AD]|61);?).*?(?:[\(\x5c]|&#x?0*(?:40|28|92|5C);?))" \
    "id:941190,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i:<.*[:]?vmlframe.*?[\s/+]*?src[\s/+]*=)" \
    "id:941200,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# This rule tries to match all the possible ways to write 'javascript' using
# html entities, and javascript escape sequences.
# Regular expression generated from regex-assembly/941210.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941210
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)(?:j|&#(?:0*(?:74|106)|x0*[46]A);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:a|&#(?:0*(?:65|97)|x0*[46]1);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:v|&#(?:0*(?:86|118)|x0*[57]6);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:a|&#(?:0*(?:65|97)|x0*[46]1);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:s|&#(?:0*(?:115|83)|x0*[57]3);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:c|&#(?:x0*[46]3|0*(?:99|67));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:r|&#(?:x0*[57]2|0*(?:114|82));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:i|&#(?:x0*[46]9|0*(?:105|73));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:p|&#(?:x0*[57]0|0*(?:112|80));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:t|&#(?:x0*[57]4|0*(?:116|84));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?::|&(?:#(?:0*58|x0*3A);?|colon;))." \
    "id:941210,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'Javascript Word Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# Regular expression generated from regex-assembly/941220.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941220
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)(?:v|&#(?:0*(?:118|86)|x0*[57]6);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:b|&#(?:0*(?:98|66)|x0*[46]2);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:s|&#(?:0*(?:115|83)|x0*[57]3);)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:c|&#(?:x0*[46]3|0*(?:99|67));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:r|&#(?:x0*[57]2|0*(?:114|82));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:i|&#(?:x0*[46]9|0*(?:105|73));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:p|&#(?:x0*[57]0|0*(?:112|80));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?:t|&#(?:x0*[57]4|0*(?:116|84));)(?:[\t\n\r]|&(?:#(?:0*(?:9|1[03])|x0*[AD]);?|(?:tab|newline);))*(?::|&(?:#(?:0*58|x0*3A);?|colon;))." \
    "id:941220,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<EMBED[\s/+].*?(?:src|type).*?=" \
    "id:941230,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx <[?]?import[\s/+\S]*?implementation[\s/+]*?=" \
    "id:941240,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:lowercase,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# Regular expression generated from regex-assembly/941250.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941250
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<META[\s\x0b\+/].*?http-equiv[\s\x0b\+/]*=[\s\x0b\+/]*[\"'`]?(?:[crs]|&#x?0*(?:6[37]|43|99|[578][23]|11[45]);?)" \
    "id:941250,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i:<META[\s/+].*?charset[\s/+]*=)" \
    "id:941260,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<LINK[\s/+].*?href[\s/+]*=" \
    "id:941270,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<BASE[\s/+].*?href[\s/+]*=" \
    "id:941280,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<APPLET[\s/+>]" \
    "id:941290,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# Regular expression generated from regex-assembly/941300.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941300
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)<OBJECT[\s\x0b\+/].*?(?:type|c(?:ode(?:type)?|lassid)|data)[\s\x0b\+/]*=" \
    "id:941300,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

#
# https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html
# US-ASCII encoding bypass listed on XSS filter evasion
# Reported by Mazin Ahmed
#
# This evasion covered by this chain of rules is specific to webservers that deliver content in US-ASCII.
# Only Apache Tomcat is known (according to the page linked above) to be vulnerable to this and probably has to be
# misconfigured for this to happen.
#
# Since US-ASCII is a seven bit encoding, bit 8 is ignored. Consider the following ISO 8859-1 sequence:
#
# ¼script¾alert(¢XSS¢)¼/script¾
#
# A filter looking for tags will usually not match against this sequence because there are no angle brackets (< / >). However,
# the characters where the brackets would be are ISO 8859-1 characters:
# - ¼: 0x00BC
# - ¾: 0x00BE
# - ¢: 0x00A2
#
# And this is how the sequence looks in in US-ASCII:
#
# <script>alert("XSSB")</script/>
#
# This enables an attacker to craft a string that will be delivered in a form that a browser will execute as script
# while being ignored by input filters.
#
# This rule looks for a start tag sequence that looks like "<...>" (checks for hex and plain to be sure).
# Because the bytes matched occur in many different languages encoded as multibyte characters (e.g. UTF-8)
# (e.g. German umlauts, Russian characters) this isn't very helpful and can cause many false positives. We, therefore,
# use a chained rule to also look for an end tag sequence that looks like "</...>". Only if the chained rule matches will
# the request be blocked.
#
# This is of course still not perfect but should at least make it harder to hide most tags using this technique while
# requiring very specific patterns in a language to match, which should get rid of most false positives.
# These rules would, for example, not guard against an element without an end tag, e.g. "<img... />".
#
# US-ASCII on Wikipedia: https://en.wikipedia.org/wiki/ASCII
# ISO 8859-1 on Wikipedia: https://en.wikipedia.org/wiki/ISO/IEC_8859-1

# Regular expression generated from regex-assembly/941310.ra and
# regex-assembly/941310-chain1.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941310 941310-chain1
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx \x{bc}[^>\x{be}]*[>\x{be}]|<[^\x{be}]*\x{be}" \
    "id:941310,\
    phase:2,\
    block,\
    capture,\
    t:none,t:lowercase,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,\
    msg:'US-ASCII Malformed Encoding XSS Filter - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-tomcat',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    chain"
    SecRule MATCHED_VARS "@rx \x{bc}[\s\x0b]*/[\s\x0b]*[^>\x{be}]*[>\x{be}]|<[\s\x0b]*/[\s\x0b]*[^\x{be}]*\x{be}" \
        "setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
        setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

#
# https://nedbatchelder.com/blog/200704/xss_with_utf7.html
# UTF-7 encoding XSS filter evasion for IE.
# Reported by Vladimir Ivanov
#

SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx \+ADw-.*(?:\+AD4-|>)|<.*\+AD4-" \
    "id:941350,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,\
    msg:'UTF-7 Encoding IE XSS - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-internet-explorer',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

#
# Defend against JSFuck and Hieroglyphy obfuscation of Javascript code
#
# https://en.wikipedia.org/wiki/JSFuck
# https://github.com/alcuadrado/hieroglyphy
#
# These JS obfuscations mostly aim for client side XSS exploits, hence the
# integration of this rule into the XSS rule group. But serverside JS could
# also be attacked via these techniques.
#
# Detection pattern / Core elements of JSFuck and Hieroglyphy are the
# following two items:
# !![]
# !+[]
#
# ModSecurity always transforms "+" into " " with query strings and the
# URLENCODE body processor (but not for JSON). So we need to check for
# the following patterns:
# !![]
# !+[]
# ! []

SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx ![!+ ]\[\]" \
    "id:941360,\
    phase:2,\
    block,\
    t:none,\
    msg:'JSFuck / Hieroglyphy obfuscation detected',\
    logdata:'Matched Data: Suspicious payload found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242/63',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

#
# Prevent 941180 bypass by using JavaScript global variables
# Refer to: https://www.secjuice.com/bypass-xss-filters-using-javascript-global-variables/
#
# Examples:
#    - /?search=/?a=";+alert(self["document"]["cookie"]);//
#    - /?search=/?a=";+document+/*foo*/+.+/*bar*/+cookie;//
#
# Regular expression generated from regex-assembly/941370.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941370
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?:self|document|t(?:his|op)|window)[\s\x0b]*(?:/\*|[\)\[]).+?(?:\]|\*/)" \
    "id:941370,\
    phase:2,\
    block,\
    t:none,t:urlDecodeUni,t:compressWhitespace,\
    msg:'JavaScript global variable found',\
    logdata:'Matched Data: Suspicious JS global variable found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242/63',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

#
# JavaScript methods which take code as a string types are considered unsafe.
# Unsafe JS functions like eval(), setInterval(), setTimeout()
# Unsafe JS constructor new Function()
# https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#dangerous-contexts
# https://snyk.io/blog/5-ways-to-prevent-code-injection-in-javascript-and-node-js/
#
# Regular expression generated from regex-assembly/941390.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941390
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)\b(?:eval|set(?:timeout|interval)|new[\s\x0b]+Function|a(?:lert|tob)|btoa|(?:promp|impor)t|con(?:firm|sole\.(?:log|dir))|fetch)[\s\x0b]*[\(\{]" \
    "id:941390,\
    phase:2,\
    block,\
    capture,\
    t:none,t:htmlEntityDecode,t:jsDecode,\
    msg:'Javascript method detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-nodejs',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# JavaScript function without parentheses
# Reference: https://portswigger.net/research/the-seventh-way-to-call-a-javascript-function-without-parentheses
#
# Example Payloads:
# [].sort.call`${alert}1337`
# [].map.call`${eval}\\u{61}lert\x281337\x29`
# Reflect.apply.call`${navigation.navigate}${navigation}${[name]}`
#
# Regular expression generated from regex-assembly/941400.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941400
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx ((?:\[[^\]]*\]|Reflect)[^\.]*\.).*(?:map|sort|apply)[^\.]*\..*call[^`]*`.*`" \
    "id:941400,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:compressWhitespace,\
    msg:'XSS JavaScript function without parentheses',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:941013,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:941014,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#

#
# This is a stricter sibling of rule 941100.
#
SecRule REQUEST_FILENAME|REQUEST_HEADERS:Referer "@detectXSS" \
    "id:941101,\
    phase:1,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'XSS Attack Detected via libinjection',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


#
# -=[ XSS Filters - Category 5 ]=-
# HTML attributes - src, style and href
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)\b(?:s(?:tyle|rc)|href)\b[\s\S]*?=" \
    "id:941150,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:removeNulls,\
    msg:'XSS Filter - Category 5: Disallowed HTML Attributes',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"



#
# [Deny List Keywords from Node-Validator]
# https://github.com/validatorjs/validator.js/
# This rule is a stricter sibling of 941180 (PL1)
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@contains -->" \
    "id:941181,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:htmlEntityDecode,t:jsDecode,t:cssDecode,t:lowercase,t:removeNulls,\
    msg:'Node-Validator Deny List Keywords',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"



#
# -=[ XSS Filters from IE ]=-

# Detect tags that are the most common direct HTML injection points.
#
#     <a href=javascript:...
#     <applet src="..." type=text/html>
#     <applet src="data:text/html;base64,PHNjcmlwdD5hbGVydCgvWFNTLyk8L3NjcmlwdD4" type=text/html>
#     <base href=javascript:...
#     <base href=... // change base URL to something else to exploit relative filename inclusion
#     <bgsound src=javascript:...
#     <body background=javascript:...
#     <body onload=...
#     <embed src=http://www.example.com/flash.swf allowScriptAccess=always
#     <embed src="data:image/svg+xml;
#     <frameset><frame src="javascript:..."></frameset>
#     <iframe src=javascript:...
#     <img src=x onerror=...
#     <input type=image src=javascript:...
#     <layer src=...
#     <link href="javascript:..." rel="stylesheet" type="text/css"
#     <link href="http://www.example.com/xss.css" rel="stylesheet" type="text/css"
#     <meta http-equiv="refresh" content="0;url=javascript:..."
#     <meta http-equiv="refresh" content="0;url=http://;javascript:..." // evasion
#     <meta http-equiv="link" rel=stylesheet content="http://www.example.com/xss.css">
#     <meta http-equiv="Set-Cookie" content="NEW_COOKIE_VALUE">
#     <object data=http://www.example.com
#     <object type=text/x-scriptlet data=...
#     <object type=application/x-shockwave-flash data=xss.swf>
#     <object classid=clsid:ae24fdae-03c6-11d1-8b76-0080c744f389><param name=url value=javascript:...></object> // not verified
#     <script>...</script>
#     <script src=http://www.example.com/xss.js></script> - TODO add another rule for this
#     <script src="data:text/javascript,alert(1)"></script>
#     <script src="data:text/javascript;base64,PHNjcmlwdD5hbGVydChkb2N1bWVudC5jb29raWUpOzwvc2NyaXB0Pg=="></script>
#     <style>STYLE</style>
#     <style type=text/css>STYLE</style>
#     <style type=text/javascript>alert('xss')</style>
#     <table background=javascript:...
#     <td background=javascript:
#
#
# NOTES
#
#  - Reference the WASC Script Mapping Project - http://projects.webappsec.org/Script-Mapping
#
#  - Not using closing brackets because they are not needed for the
#    attacks to succeed. The following seems to work in FF: <body/s/onload=...
#
#  - Also, browsers sometimes tend to translate < into >, in order to "repair"
#    what they think was a mistake made by the programmer/template designer.
#
#  - Browsers are flexible when it comes to what they accept as separator between
#    tag names and attributes. The following is commonly used in payloads: <img/src=...
#    A better example: <BODY onload!#$%&amp;()*~+-_.,:;?@[/|\]^=alert("XSS")>
#
#  - Grave accents are sometimes used as an evasion technique (as a replacement for quotes),
#    but I don't believe we need to look for quotes anywhere.
#
#  - Links do not have to be fully qualified. For example, the following works:
#    <script src="//ha.ckers.org/.j">
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/941320.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941320
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx <(?:a(?:bbr|cronym|ddress|pplet|rea|udioscope)?|b(?:ase(?:front)?|do|gsound|ig|l(?:(?:ackfac|ockquot)e|ink)|ody|[qr]|utton)?|c(?:aption|enter|ite|o(?:de|l(?:group)?|mment))|d(?:[dt]|e?l|fn|i[rv])|em(?:bed)?|f(?:ieldset|n|o(?:nt|rm)|rame(?:set)?)|h(?:[1r]|ead|tml)|i(?:frame|layer|mg|n(?:put|s)|sindex)?|k(?:db|eygen)|l(?:a(?:bel|yer)|egend|i(?:mittext|nk|sting)?)|m(?:a(?:p|rquee)|e(?:nu|ta)|ulticol)|no(?:br|embed|frames|s(?:cript|martquotes))|o(?:bject|l|pt(?:group|ion))|p(?:aram|laintext|re)?|q|r(?:t|uby)|s(?:amp|cript|e(?:lect|rver)|hadow|idebar|mall|pa(?:cer|n)|t(?:r(?:ike|ong)|yle)|u[bp])?|t(?:(?:ab|it)le|body|[dr]|extarea|(?:foo)?t|h(?:ead)?)|ul?|(?:va|wb)r|xm[lp])[^0-9A-Z_a-z]" \
    "id:941320,\
    phase:2,\
    block,\
    capture,\
    t:none,t:jsDecode,t:lowercase,\
    msg:'Possible XSS Attack Detected - HTML Tag Handler',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242/63',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/941330.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 941330
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[\"'] *(?:[^ '0-:_a-z~]|in).*?(?:(?:l|\x5cu006C)(?:o|\x5cu006F)(?:c|\x5cu0063)(?:a|\x5cu0061)(?:t|\x5cu0074)(?:i|\x5cu0069)(?:o|\x5cu006F)(?:n|\x5cu006E)|(?:n|\x5cu006E)(?:a|\x5cu0061)(?:m|\x5cu006D)(?:e|\x5cu0065)|(?:o|\x5cu006F)(?:n|\x5cu006E)(?:e|\x5cu0065)(?:r|\x5cu0072)(?:r|\x5cu0072)(?:o|\x5cu006F)(?:r|\x5cu0072)|(?:v|\x5cu0076)(?:a|\x5cu0061)(?:l|\x5cu006C)(?:u|\x5cu0075)(?:e|\x5cu0065)(?:O|\x5cu004F)(?:f|\x5cu0066)).*?=" \
    "id:941330,\
    phase:2,\
    block,\
    capture,\
    t:none,t:htmlEntityDecode,t:compressWhitespace,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[\"\'][ ]*(?:[^a-z0-9~_:\' ]|in).+?[.].+?=" \
    "id:941340,\
    phase:2,\
    block,\
    capture,\
    t:none,t:htmlEntityDecode,t:compressWhitespace,\
    msg:'IE XSS Filters - Attack Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

#
# Defend against AngularJS client side template injection
#
# Of course, pure client-side AngularJS commands can not be intercepted.
# But once a command is sent to the server, the CRS will trigger.
#
# https://portswigger.net/research/xss-without-html-client-side-template-injection-with-angularjs
#
# Example payload:
# http://localhost/login?user=%20x%20%7B%7Bconstructor.constructor(%27alert(1)%27)()%7D%7D%20.%20ff
# Decoded argument:
# {{constructor.constructor('alert(1)')()}}
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx \{\{.*?}}" \
    "id:941380,\
    phase:2,\
    block,\
    t:none,\
    msg:'AngularJS client side template injection detected',\
    logdata:'Matched Data: Suspicious payload found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'attack-xss',\
    tag:'xss-perf-disable',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-XSS',\
    tag:'capec/1000/152/242/63',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.xss_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:941015,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:941016,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:941017,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:941018,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-941-APPLICATION-ATTACK-XSS"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#



#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-941-APPLICATION-ATTACK-XSS"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000012', 'crs-942', 'CRS SQLi', $wafcrs$# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:942011,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:942012,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#

#
# References:
#
# SQL Injection Knowledgebase (via @LightOS) -
# http://websec.ca/kb/sql_injection
#
# SQLi Filter Evasion Cheat Sheet -
# http://websec.wordpress.com/2010/12/04/sqli-filter-evasion-cheat-sheet-mysql/
#
# SQL Injection Cheat Sheet -
# http://ferruh.mavituna.com/sql-injection-cheatsheet-oku/
#
# SQLMap's Tamper Scripts (for evasions)
# https://github.com/sqlmapproject/sqlmap
#

#
# -=[ LibInjection Check ]=-
#
# There is a stricter sibling of this rule at 942101. It covers REQUEST_BASENAME and REQUEST_FILENAME.
#
# Ref: https://github.com/libinjection/libinjection
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|XML:/* "@detectSQLi" \
    "id:942100,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:removeNulls,\
    msg:'SQL Injection Attack Detected via libinjection',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    multiMatch,\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}'"


#
# -=[ Detect DB Names ]=-
#
# Regular expression generated from regex-assembly/942140.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942140
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:d(?:atabas|b_nam)e[^0-9A-Z_a-z]*\(|(?:information_schema|m(?:aster\.\.sysdatabases|s(?:db|ys(?:ac(?:cess(?:objects|storage|xml)|es)|modules2?|(?:object|querie|relationship)s))|ysql\.db)|northwind|pg_(?:catalog|toast)|tempdb)\b|s(?:chema(?:_name\b|[^0-9A-Z_a-z]*\()|(?:qlite_(?:temp_)?master|ys(?:aux|\.database_name))\b))" \
    "id:942140,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack: Common DB Names Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# -=[ SQL Function Names ]=-
#
# This rule has a stricter sibling to this rule (942152) that checks for SQL function names in
# request headers referer and user-agent.
#
# Regular expression generated from regex-assembly/942151.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942151
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:a(?:dd(?:dat|tim)e|es_(?:de|en)crypt|s(?:cii(?:str)?|in)|tan2?)|b(?:enchmark|i(?:n_to_num|t_(?:and|count|length|x?or)))|c(?:har(?:acter)?_length|eil(?:ing)?|o(?:alesce|ercibility|llation|(?:mpres)?s|n(?:cat(?:_ws)?|nection_id|v(?:ert_tz)?)|t)|rc32|ur(?:(?:dat|tim)e|rent_(?:date|setting|time(?:stamp)?|user)))|d(?:a(?:t(?:abase(?:_to_xml)?|e(?:_(?:add|format|sub)|diff))|y(?:name|of(?:month|week|year)))|count|e(?:code|s_(?:de|en)crypt)|ump)|e(?:n(?:c(?:ode|rypt)|ds_?with)|x(?:p(?:ort_set)?|tract(?:value)?))|f(?:i(?:el|n)d_in_set|ound_rows|rom_(?:base64|days|unixtime))|g(?:e(?:ometrycollection|t(?:_(?:format|lock)|pgusername))|(?:r(?:eates|oup_conca)|tid_subse)t)|hex(?:toraw)?|i(?:fnull|n(?:et6?_(?:aton|ntoa)|s(?:ert|tr)|terval)|s(?:_(?:(?:free|used)_lock|ipv(?:4(?:_(?:compat|mapped))?|6)|n(?:ot(?:_null)?|ull)|superuser)|null))|json(?:_(?:a(?:gg|rray(?:_(?:elements(?:_text)?|length))?)|build_(?:array|object)|e(?:ac|xtract_pat)h(?:_text)?|object(?:_(?:agg|keys))?|populate_record(?:set)?|strip_nulls|t(?:o_record(?:set)?|ypeof))|b(?:_(?:array(?:_(?:elements(?:_text)?|length))?|build_(?:array|object)|e(?:ac|xtract_pat)h(?:_text)?|insert|object(?:_(?:agg|keys))?|p(?:ath_(?:(?:exists|match)(?:_tz)?|query(?:_(?:(?:array|first)(?:_tz)?|tz))?)|opulate_record(?:set)?|retty)|s(?:et(?:_lax)?|trip_nulls)|t(?:o_record(?:set)?|ypeof)))?|path)?|l(?:ast_(?:day|insert_id)|case|east|i(?:kely|nestring)|o(?:_(?:from_bytea|put)|ad_file|ca(?:ltimestamp|te)|g(?:10|2))|pad|trim)|m(?:a(?:ke(?:_set|date)|ster_pos_wait)|d5|i(?:crosecon)?d|onthname|ulti(?:linestring|po(?:int|lygon)))|n(?:ame_const|ot_in|ullif)|o(?:ct(?:et_length)?|(?:ld_passwo)?rd)|p(?:eriod_(?:add|diff)|g_(?:client_encoding|(?:databas|read_fil)e|l(?:argeobject|s_dir)|sleep|user)|o(?:lygon|w)|rocedure_analyse)|qu(?:ery_to_xml|ote)|r(?:a(?:dians|nd|wtohex)|elease_lock|ow_(?:count|to_json)|pad|trim)|s(?:chema|e(?:c_to_time|ssion_user)|ha[12]?|in|oundex|q(?:lite_(?:compileoption_(?:get|used)|source_id)|rt)|t(?:arts_?with|d(?:dev_(?:po|sam)p)?|r(?:_to_date|cmp))|ub(?:(?:dat|tim)e|str(?:ing(?:_index)?)?)|ys(?:date|tem_user))|t(?:ime(?:_(?:format|to_sec)|diff|stamp(?:add|diff)?)|o(?:_(?:base64|jsonb?)|n?char|(?:day|second)s)|r(?:im|uncate))|u(?:case|n(?:compress(?:ed_length)?|hex|i(?:str|x_timestamp))|(?:pdatexm|se_json_nul)l|tc_(?:date|time(?:stamp)?)|uid(?:_short)?)|var(?:_(?:po|sam)p|iance)|we(?:ek(?:day|ofyear)|ight_string)|xmltype|yearweek)[^0-9A-Z_a-z]*\(" \
    "id:942151,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack: SQL function name detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# -=[ PHPIDS - Converted SQLI Filters ]=-
#
# https://raw.githubusercontent.com/PHPIDS/PHPIDS/master/lib/IDS/default_filter.xml
#
# The rule 942160 prevents time-based blind SQL injection attempts
# by prohibiting sleep() or benchmark(,) functions:
#
# * The sleep command takes a number of seconds as an argument.
# * The benchmark command executes the specified expression multiple times.
#
# Using a long sleep time or high number of executions, you can create a delay
# with the response from the server.  This allows to determine whether the
# query has been executed or not.  A high response time proves that the SQLi
# worked successfully. It can now be equipped with the real payload.
#
# Therefore this rule does not prevent the attack itself, but blocks an
# attacker from using the standard utils to tinker with blind SQLi.
#
# A positive side effect is that it prevents certain DoS attacks via the directives
# described above.
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i:sleep\s*?\(.*?\)|benchmark\s*?\(.*?\,.*?\))" \
    "id:942160,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:'Detects blind sqli tests using sleep() or benchmark()',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942170.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942170
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:select|;)[\s\x0b]+(?:benchmark|if|sleep)[\s\x0b]*?\([\s\x0b]*?\(?[\s\x0b]*?[0-9A-Z_a-z]+" \
    "id:942170,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects SQL benchmark and sleep injection attempts including conditional queries',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942190.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942190
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"'`](?:[\s\x0b]*![\s\x0b]*[\"'0-9A-Z_-z]|;?[\s\x0b]*(?:having|select|union\b[\s\x0b]*(?:all|(?:distin|sele)ct))\b[\s\x0b]*[^\s\x0b])|\b(?:(?:(?:c(?:onnection_id|urrent_user)|database|schema|user)[\s\x0b]*?|select.*?[0-9A-Z_a-z]?user)\(|exec(?:ute)?[\s\x0b]+master\.|from[^0-9A-Z_a-z]+information_schema[^0-9A-Z_a-z]|into[\s\x0b\+]+(?:dump|out)file[\s\x0b]*?[\"'`]|union(?:[\s\x0b]select[\s\x0b]@|[\s\x0b\(0-9A-Z_a-z]*?select))|[\s\x0b]*?exec(?:ute)?.*?[^0-9A-Z_a-z]xp_cmdshell|[^0-9A-Z_a-z]iif[\s\x0b]*?\(" \
    "id:942190,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:removeCommentsChar,\
    msg:'Detects MSSQL code execution and information gathering attempts',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Magic number crash in PHP strtod from 2011:
# https://www.exploringbinary.com/php-hangs-on-numeric-value-2-2250738585072011e-308/
#
# Regular expression generated from regex-assembly/942220.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942220
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)^(?:429496729[56]|2(?:14748364[78]|.22507385850720(?:07|11)e-308)|-(?:214748364[89]|0000023456)|00000(?:12345|23456)|1e309)$" \
    "id:942220,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Looking for integer overflow attacks, these are taken from skipfish, except 2.2.2250738585072011e-308 is the \"magic number\" crash',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942230.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942230
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\s\x0b\(\)]case[\s\x0b]+when.*?then|\)[\s\x0b]*?like[\s\x0b]*?\(|select.*?having[\s\x0b]*?[^\s\x0b]+[\s\x0b]*?[^\s\x0b0-9A-Z_a-z]|if[\s\x0b]?\([0-9A-Z_a-z]+[\s\x0b]*?[<->~]" \
    "id:942230,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects conditional SQL injection attempts',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942240.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942240
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)alter[\s\x0b]*?[0-9A-Z_a-z]+.*?char(?:acter)?[\s\x0b]+set[\s\x0b]+[0-9A-Z_a-z]+|[\"'`](?:;*?[\s\x0b]*?waitfor[\s\x0b]+(?:time|delay)[\s\x0b]+[\"'`]|;.*?:[\s\x0b]*?goto)" \
    "id:942240,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects MySQL charset switch and MSSQL DoS attempts',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942250.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942250
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)m(?:erge.*?using|atch[\s\x0b]*?[\(\)\+-\-0-9A-Z_a-z]+[\s\x0b]*?against)[\s\x0b]*?\(|execute[\s\x0b]*?immediate[\s\x0b]*?[\"'`]" \
    "id:942250,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects MATCH AGAINST, MERGE and EXECUTE IMMEDIATE injections',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)union.*?select.*?from" \
    "id:942270,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Looking for basic sql injection. Common attack string for mysql, oracle and others',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942280.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942280
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|XML:/* "@rx (?i)select[\s\x0b]*?pg_sleep|waitfor[\s\x0b]*?delay[\s\x0b]?[\"'`]+[\s\x0b]?[0-9]|;[\s\x0b]*?shutdown[\s\x0b]*?(?:[#;\{]|/\*|--)" \
    "id:942280,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects Postgres pg_sleep injection, waitfor delay attacks and database shutdown attempts',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942290.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942290
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\[?\$(?:a(?:bs|c(?:cumulator|osh?)|dd(?:ToSet)?|ll(?:ElementsTrue)?|n(?:d|yElementTrue)|rray(?:ElemA|ToObjec)t|sinh?|tan[2h]?|vg)|b(?:etween|i(?:narySize|t(?:And|Not|(?:O|Xo)r)?)|ottomN?|sonSize|ucket(?:Auto)?)|c(?:eil|mp|o(?:n(?:cat(?:Arrays)?|d|vert)|sh?|unt|variance(?:Po|Sam)p)|urrentDate)|d(?:a(?:te(?:Add|Diff|From(?:Parts|String)|Subtract|T(?:o(?:Parts|String)|runc))|yOf(?:Month|Week|Year))|e(?:greesToRadians|nseRank|rivative)|iv(?:ide)?|ocumentNumber)|e(?:(?:a|lemMat)ch|q|x(?:ists|p(?:MovingAvg|r)?))|f(?:i(?:lter|rstN?)|loor|unction)|g(?:etField|roup|te?)|(?:hou|xo|yea)r|i(?:fNull|n(?:c|dexOf(?:Array|Bytes|CP)|tegral)?|s(?:Array|Number|o(?:DayOfWeek|Week(?:Year)?)))|jsonSchema|l(?:astN?|et|i(?:ke|(?:nearFil|tera)l)|n|o(?:cf|g(?:10)?)|t(?:e|rim)?)|m(?:a(?:p|xN?)|e(?:dian|rgeObjects|ta)|i(?:llisecond|n(?:N|ute)?)|o(?:d|nth)|ul(?:tiply)?)|n(?:atural|e|in|o[rt])|o(?:bjectToArray|r)|p(?:ercentile|o(?:[pw]|sition)|roject|u(?:ll(?:All)?|sh))|r(?:a(?:diansToDegrees|n(?:[dk]|ge))|e(?:(?:duc|nam)e|gex(?:Find(?:All)?|Match)?|place(?:All|One)|verseArray)|ound|trim)|s(?:(?:ampleRat|lic)e|e(?:cond|t(?:Difference|(?:Equal|WindowField)s|Field|I(?:ntersection|sSubset)|OnInsert|Union)?)|(?:hif|pli|qr)t|i(?:nh?|ze)|ort(?:Array)?|t(?:dDev(?:Po|Sam)p|r(?:Len(?:Bytes|CP)|casecmp))|u(?:b(?:str(?:Bytes|CP)?|tract)|m)|witch)|t(?:anh?|ext|o(?:Bool|D(?:(?:at|oubl)e|ecimal)|HashedIndexKey|Int|Lo(?:ng|wer)|ObjectId|String|U(?:UID|pper)|pN?)|r(?:im|unc)|s(?:Increment|Second)|ype)|unset|w(?:eek|here)|zip)\]?" \
    "id:942290,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Finds basic MongoDB SQL injection attempts',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# This rule has a stricter sibling (942321) that checks for MySQL and PostgreSQL procedures / functions in
# request headers referer and user-agent.
#
# Regular expression generated from regex-assembly/942320.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942320
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)create[\s\x0b]+(?:function|procedure)[\s\x0b]*?[0-9A-Z_a-z]+[\s\x0b]*?\([\s\x0b]*?\)[\s\x0b]*?-|d(?:eclare[^0-9A-Z_a-z]+[#@][\s\x0b]*?[0-9A-Z_a-z]+|iv[\s\x0b]*?\([\+\-]*[\s\x0b\.0-9]+,[\+\-]*[\s\x0b\.0-9]+\))|exec[\s\x0b]*?\([\s\x0b]*?@|(?:lo_(?:impor|ge)t|procedure[\s\x0b]+analyse)[\s\x0b]*?\(|;[\s\x0b]*?(?:declare|open)[\s\x0b]+[\-0-9A-Z_a-z]+|::(?:b(?:igint|ool)|double[\s\x0b]+precision|int(?:eger)?|numeric|oid|real|(?:tex|smallin)t)" \
    "id:942320,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects MySQL and PostgreSQL stored procedure/function injections',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942350.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942350
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)create[\s\x0b]+function[\s\x0b].+[\s\x0b]returns|;[\s\x0b]*?(?:alter|(?:(?:cre|trunc|upd)at|re(?:nam|plac))e|d(?:e(?:lete|sc)|rop)|(?:inser|selec)t|load)\b[\s\x0b]*?[\(\[]?[0-9A-Z_a-z]{2,}" \
    "id:942350,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:'Detects MySQL UDF injection and other data/structure manipulation attempts',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# This rule has two stricter sibling: 942361 and 942362.
# The keywords 'alter' and 'union' led to false positives.
# Therefore they have been moved to PL2 and the keywords have been extended on PL1.
# The original version also had loose word boundaries and context checksum cause further false positives.
# Because fixing those introduced bypass, the original variant was moved to PL2 as 942362.
#
# Sources for SQL ALTER statements:
# MySQL: https://dev.mysql.com/doc/refman/5.7/en/sql-syntax-data-definition.html
# Oracle/PLSQL: https://docs.oracle.com/search/?q=alter&size=60&category=database
# PostgreQSL: https://www.postgresql.org/search/?u=%2Fdocs&q=alter
# MSSQL: https://learn.microsoft.com/en-us/sql/t-sql/statements/statements?view=sql-server-ver16
# DB2: https://www.ibm.com/docs/en/search/alter?scope=SSEPGG_9.5.0
#
# Regular expression generated from regex-assembly/942360.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942360
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:(?:alter|(?:(?:cre|trunc|upd)at|renam)e|de(?:lete|sc)|(?:inser|selec)t|load)[\s\x0b]+(?:char|group_concat|load_file)\b[\s\x0b]*\(?|end[\s\x0b]*?\);)|[\s\x0b\(]load_file[\s\x0b]*?\(|[\"'`][\s\x0b]+regexp[^0-9A-Z_a-z]|[\"'0-9A-Z_-z][\s\x0b]+as\b[\s\x0b]*[\"'0-9A-Z_-z]+[\s\x0b]*\bfrom|^[^A-Z_a-z]+[\s\x0b]*?(?:(?:(?:(?:cre|trunc)at|renam)e|d(?:e(?:lete|sc)|rop)|(?:inser|selec)t|load)[\s\x0b]+[0-9A-Z_a-z]+|u(?:pdate[\s\x0b]+[0-9A-Z_a-z]+|nion[\s\x0b]*(?:all|(?:sele|distin)ct)\b)|alter[\s\x0b]*(?:a(?:(?:ggregat|pplication[\s\x0b]*rol)e|s(?:sembl|ymmetric[\s\x0b]*ke)y|u(?:dit|thorization)|vailability[\s\x0b]*group)|b(?:roker[\s\x0b]*priority|ufferpool)|c(?:ertificate|luster|o(?:l(?:latio|um)|nversio)n|r(?:edential|yptographic[\s\x0b]*provider))|d(?:atabase|efault|i(?:mension|skgroup)|omain)|e(?:(?:ndpoi|ve)nt|xte(?:nsion|rnal))|f(?:lashback|oreign|u(?:lltext|nction))|hi(?:erarchy|stogram)|group|in(?:dex(?:type)?|memory|stance)|java|l(?:a(?:ngua|r)ge|ibrary|o(?:ckdown|g(?:file[\s\x0b]*group|in)))|m(?:a(?:s(?:k|ter[\s\x0b]*key)|terialized)|e(?:ssage[\s\x0b]*type|thod)|odule)|(?:nicknam|queu)e|o(?:perator|utline)|p(?:a(?:ckage|rtition)|ermission|ro(?:cedur|fil)e)|r(?:e(?:mot|sourc)e|o(?:l(?:e|lback)|ute))|s(?:chema|e(?:arch|curity|rv(?:er|ice)|quence|ssion)|y(?:mmetric[\s\x0b]*key|nonym)|togroup)|t(?:able(?:space)?|ext|hreshold|r(?:igger|usted)|ype)|us(?:age|er)|view|w(?:ork(?:load)?|rapper)|x(?:ml[\s\x0b]*schema|srobject))\b)" \
    "id:942360,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects concatenated basic SQL injection and SQLLFI attempts',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

#
# -=[ Detect MySQL in-line comments ]=-
#
# MySQL in-line comments can be used to bypass SQLi detection.
#
# Ref: https://dev.mysql.com/doc/refman/8.0/en/comments.html:
# SELECT /*! STRAIGHT_JOIN */ col1 FROM table1,table2 WHERE ...
# CREATE TABLE t1(a INT, KEY (a)) /*!50110 KEY_BLOCK_SIZE=1024 */;
# SELECT /*+ BKA(t1) */ FROM ... ;
#
# http://localhost/test.php?id=9999+or+{if+length((/*!5000select+username/*!50000from*/user+where+id=1))>0}
#
# The minimal string that triggers this regexp is: /*!*/ or /*+*/.
# The rule 942500 is related to 942440 which catches both /*! and */ independently.
#
# Regular expression generated from regex-assembly/942500.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942500
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)/\*[\s\x0b]*?[!\+](?:[\s\x0b\(\)\-0-9=A-Z_a-z]+)?\*/" \
    "id:942500,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'MySQL in-line comment detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    multiMatch,\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# This rule catches an authentication bypass via SQL injection that abuses semi-colons to end the SQL query early.
# Any characters after the semi-colon are ignored by some DBMSes (e.g. SQLite).
#
# An example of this would be:
#   email=admin%40juice-sh.op';&password=foo
#
# The server then turns this into:
#   SELECT * FROM users WHERE email='admin@juice-sh.op';' AND password='foo'
#
# Regular expression generated from regex-assembly/942540.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942540
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx ^(?:[^']*'|[^\"]*\"|[^`]*`)[\s\x0b]*;" \
    "id:942540,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:'SQL Authentication bypass (split query)',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'paranoia-level/1',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# This rule catches on Scientific Notation bypass payloads in MySQL
# Reference: https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/SQL%20Injection/MySQL%20Injection.md#scientific-notation
#
# Regular expression generated from regex-assembly/942560.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942560
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)1\.e(?:[\(\),]|\.[\$0-9A-Z_a-z])" \
    "id:942560,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:'MySQL Scientific Notation payload detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# This rule tries to match JSON SQL syntax that could be used as a bypass technique.
# Referring to this research: https://claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf
#
# Regular expression generated from regex-assembly/942550.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942550
#
SecRule REQUEST_FILENAME|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"'`][\[\{][^#\]\}]*[\]\}]+[\"'`]|(?:[\-@]>?|<@|@[\?@]|\?(?:(?:)|&|\|#>)|#(?:>>|-)|->>|[<>])[\"'`](?:[\[\{][^#\]\}]*[\]\}]+[\"'`]|\$[\.\[])|\bjson_extract\b[^\(]*\([^\)]*\)" \
    "id:942550,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:removeWhitespace,\
    msg:'JSON-Based SQL Injection',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:942013,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:942014,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#


#
# -=[ SQL Operators ]=-
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942120
#
SecRule ARGS_NAMES|ARGS|REQUEST_FILENAME|XML:/* "@rx (?i)[!=]=|&&|\|\||->|>[=>]|<(?:[<=]|>(?:[\s\x0b]+binary)?)|\b(?:(?:xor|r(?:egexp|like)|i(?:snull|like)|notnull)\b|collate(?:[^0-9A-Z_a-z]*?(?:U&)?[\"'`]|[^0-9A-Z_a-z]+(?:(?:binary|nocase|rtrim)\b|[0-9A-Z_a-z]*?_))|(?:likel(?:ihood|y)|unlikely)[\s\x0b]*\()|r(?:egexp|like)[\s\x0b]+binary|not[\s\x0b]+between[\s\x0b]+(?:0[\s\x0b]+and|(?:'[^']*'|\"[^\"]*\")[\s\x0b]+and[\s\x0b]+(?:'[^']*'|\"[^\"]*\"))|is[\s\x0b]+null|like[\s\x0b]+(?:null|[0-9A-Z_a-z]+[\s\x0b]+escape\b)|(?:^|[^0-9A-Z_a-z])in[\s\x0b\+]*\([\s\x0b\"0-9]+[^\(\)]*\)|[!<->][\s\x0b]*all\b" \
    "id:942120,\
    phase:2,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,\
    msg:'SQL Injection Attack: SQL Operator Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


#
# -=[ SQL Tautologies ]=-
#
# Boolean-based SQL injection or tautology attack. Boolean values (True or False) are used to carry out
# this type of SQL injection. The malicious SQL query forces the web application to return a different result de-
# pending on whether the query returns a TRUE or FALSE result.
#
# The original 942130 was split in two rules:
# - 942130 targets tautologies using equalities (e.g. 1 = 1)
# - 942131 targets tautologies using inequalities (e.g. 1 != 2)
#
# We use captures to check for (in)equality in the regexp. So TX.1 will capture the left hand side (LHS) of the inequality,
# and TX.2 will capture the right hand side (RHS) of the logical query.
#
# Regular expression generated from regex-assembly/942130.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942130
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\s\x0b\"'-\)`]*?\b([0-9A-Z_a-z]+)\b[\s\x0b\"'-\)`]*?(?:=|<=>|(?:sounds[\s\x0b]+)?like|glob|r(?:like|egexp))[\s\x0b\"'-\)`]*?\b([0-9A-Z_a-z]+)\b" \
    "id:942130,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:'SQL Injection Attack: SQL Boolean-based attack detected',\
    logdata:'Matched Data: %{TX.0} found within %{TX.942130_MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.942130_matched_var_name=%{matched_var_name}',\
    chain"
    SecRule TX:1 "@streq %{TX.2}" \
        "t:none,\
        setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
        setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Rule Targeting logical inequalities that return TRUE (e.g. 1 != 2)
#
#
# We use captures to check for (in)equality in the regexp. So TX.1 will capture the left hand side (LHS) of the inequality,
# and TX.2 will capture the right hand side (RHS) of the logical query.
#
# Regular expression generated from regex-assembly/942131.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942131
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\s\x0b\"'-\)`]*?\b([0-9A-Z_a-z]+)\b[\s\x0b\"'-\)`]*?(?:![<->]|<[=>]?|>=?|\^|is[\s\x0b]+not|not[\s\x0b]+(?:like|r(?:like|egexp)))[\s\x0b\"'-\)`]*?\b([0-9A-Z_a-z]+)\b" \
    "id:942131,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,t:replaceComments,\
    msg:'SQL Injection Attack: SQL Boolean-based attack detected',\
    logdata:'Matched Data: %{TX.0} found within %{TX.942131_MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    multiMatch,\
    setvar:'tx.942131_matched_var_name=%{matched_var_name}',\
    chain"
    SecRule TX:1 "!@streq %{TX.2}" \
        "t:none,\
        setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
        setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

#
# -=[ SQL Function Names ]=-
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942150.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942150
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:json(?:_[0-9A-Z_a-z]+)?|a(?:bs|(?:cos|sin)h?|tan[2h]?|vg)|c(?:eil(?:ing)?|h(?:a(?:nges|r(?:set)?)|r)|o(?:alesce|sh?|unt)|ast)|d(?:e(?:grees|fault)|a(?:te|y))|exp|f(?:loor(?:avg)?|ormat|ield)|g(?:lob|roup_concat)|h(?:ex|our)|i(?:f(?:null)?|if|n(?:str)?)|l(?:ast(?:_insert_rowid)?|ength|ike(?:l(?:ihood|y))?|n|o(?:ad_extension|g(?:10|2)?|wer(?:pi)?|cal)|trim)|m(?:ax|in(?:ute)?|o(?:d|nth))|n(?:ullif|ow)|p(?:i|ow(?:er)?|rintf|assword)|quote|r(?:a(?:dians|ndom(?:blob)?)|e(?:p(?:lace|eat)|verse)|ound|trim|ight)|s(?:i(?:gn|nh?)|oundex|q(?:lite_(?:compileoption_(?:get|used)|offset|source_id|version)|rt)|u(?:bstr(?:ing)?|m)|econd|leep)|t(?:anh?|otal(?:_changes)?|r(?:im|unc)|ypeof|ime)|u(?:n(?:icode|likely)|(?:pp|s)er)|zeroblob|bin|v(?:alues|ersion)|week|year)[^0-9A-Z_a-z]*\(" \
    "id:942150,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack: SQL function name detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

#
# -=[ SQL Authentication Bypasses ]=-
#
# Authentication bypass occurs when the attacker can log in as another user
# without knowing the user's password. The example bypass could look like this:
#
# x' OR 'x
#
# Because of the quantity of different rules they are split into:
# - 942540 PL1
# - 942180 PL2
# - 942260 PL2
# - 942340 PL2
# - 942520 PL2
#   - 942521 PL2
#   - 942522 PL2

# Regular expression generated from regex-assembly/942180.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942180
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:/\*)+[\"'`]+[\s\x0b]?(?:--|[#\{]|/\*)?|[\"'`](?:[\s\x0b]*(?:(?:x?or|and|div|like|between)[\s\x0b\-0-9A-Z_a-z]+[\(\)\+-\-<->][\s\x0b]*[\"'0-9`]|[!=\|](?:[\s\x0b!\+\-0-9=]+[^\[]*[\"'\(`].*|[\s\x0b!0-9=]+[^0-9]*[0-9]+)$|(?:like|print)[^0-9A-Z_a-z]+[\"'\(0-9A-Z_-z]|;)|(?:[<>~]+|[\s\x0b]*[^\s\x0b0-9A-Z_a-z]?=[\s\x0b]*|[^0-9A-Z_a-z]*?[\+=]+[^0-9A-Z_a-z]*?)[\"'`])|[0-9][\"'`][\s\x0b]+[\"'`][\s\x0b]+[0-9]|^admin[\s\x0b]*?[\"'`]|[\s\x0b\"'\(`][\s\x0b]*?glob[^0-9A-Z_a-z]+[\"'\(0-9A-Z_-z]|[\s\x0b]is[\s\x0b]*?0[^0-9A-Z_a-z]|where[\s\x0b][\s\x0b,-\.0-9A-Z_a-z]+[\s\x0b]=" \
    "id:942180,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects basic SQL authentication bypass attempts 1/3',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942200.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942200
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:,[^\)]*?(?:[0-9a-f]+|\([0-9a-f]+\))|\([^,]+(?:,[\s\x0b]*[0-9a-f]+)+\))(?:$|[\"'`](?:$|[^\"'`]+[\"'`])|(?:\r?\n)?\z)|,[^\)]*?[\"'`][^\"'`]+[\"'`]|[^0-9A-Z_a-z]select.+[^0-9A-Z_a-z]*?from|(?:alter|(?:(?:cre|trunc|upd)at|renam)e|d(?:e(?:lete|sc)|rop)|(?:inser|selec)t|load)[\s\x0b]*?\([\s\x0b]*?space[\s\x0b]*?\(" \
    "id:942200,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects MySQL comment-/space-obfuscated injections and backtick termination',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942210.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942210
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:&&|\|\||and|between|div|like|n(?:and|ot)|(?:xx?)?or)[\s\x0b\(]+[0-9A-Z_a-z]+[\s\x0b\)]*?[!\+=]+[\s\x0b0-9]*?[\"'-\)=`]|[0-9](?:[\s\x0b]*?(?:and|between|div|like|x?or)[\s\x0b]*?[0-9]+[\s\x0b]*?[\+\-]|[\s\x0b]+group[\s\x0b]+by.+\()|/[0-9A-Z_a-z]+;?[\s\x0b]+(?:and|between|div|having|like|x?or|select)[^0-9A-Z_a-z]|(?:[#;]|--)[\s\x0b]*?(?:alter|drop|(?:insert|update)[\s\x0b]*?[0-9A-Z_a-z]{2,})|@.+=[\s\x0b]*?\([\s\x0b]*?select|[^0-9A-Z_a-z]SET[\s\x0b]*?@[0-9A-Z_a-z]+" \
    "id:942210,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects chained SQL injection attempts 1/2',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942260.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942260
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"'`][\s\x0b]*?(?:(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between|\|\||&&)[\s\x0b]+[\s\x0b0-9A-Z_a-z]+=[\s\x0b]*?[0-9A-Z_a-z]+[\s\x0b]*?having[\s\x0b]+|like[^0-9A-Z_a-z]*?[\"'0-9`])|[0-9A-Z_a-z][\s\x0b]+like[\s\x0b]+[\"'`]|like[\s\x0b]*?[\"'`]%|select[\s\x0b]+?[\s\x0b\"'-\),-\.0-9A-\[\]_-z]+from[\s\x0b]+" \
    "id:942260,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects basic SQL authentication bypass attempts 2/3',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942300.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942300
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\)[\s\x0b]*?when[\s\x0b]*?[0-9]+[\s\x0b]*?then|[\"'`][\s\x0b]*?(?:[#\{]|--)|/\*![\s\x0b]?[0-9]+|\b(?:(?:binary|cha?r)[\s\x0b]*?\([\s\x0b]*?[0-9]|(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between|r(?:egexp|like))[\s\x0b]+[0-9A-Z_a-z]+\()|(?:\|\||&&)[\s\x0b]*?[0-9A-Z_a-z]+\(" \
    "id:942300,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects MySQL comments, conditions and ch(a)r injections',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942310.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942310
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:\([\s\x0b]*?select[\s\x0b]*?[0-9A-Z_a-z]+|coalesce|order[\s\x0b]+by[\s\x0b]+if[0-9A-Z_a-z]*?)[\s\x0b]*?\(|\*/from|\+[\s\x0b]*?[0-9]+[\s\x0b]*?\+[\s\x0b]*?@|[0-9A-Z_a-z][\"'`][\s\x0b]*?(?:(?:[\+\-=@\|]+[\s\x0b]+?)+|[\+\-=@\|]+)[\(0-9]|@@[0-9A-Z_a-z]+[\s\x0b]*?[^\s\x0b0-9A-Z_a-z]|[^0-9A-Z_a-z]!+[\"'`][0-9A-Z_a-z]|[\"'`](?:;[\s\x0b]*?(?:if|while|begin)|[\s\x0b0-9]+=[\s\x0b]*?[0-9])|[\s\x0b\(]+case[0-9]*?[^0-9A-Z_a-z].+[tw]hen[\s\x0b\(]" \
    "id:942310,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects chained SQL injection attempts 2/2',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

#
# -=[ SQL Injection Probings ]=-
#
# This is a group of three similar rules aiming to detect SQL injection probings.
#
# 942330 PL 2
# 942370 PL 2
# 942490 PL 3
# Regular expression generated from regex-assembly/942330.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942330
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"'`][\s\x0b]*?\b(?:x?or|div|like|between|and)\b[\s\x0b]*?[\"'`]?[0-9]|\x5cx(?:2[37]|3d)|^(?:.?[\"'`]$|[\"'\x5c`]*?(?:[\"'0-9`]+|[^\"'`]+[\"'`])[\s\x0b]*?\b(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between|\|\||&&)\b[\s\x0b]*?[\"'0-9A-Z_-z][!&\(\)\+-\.@])|[^\s\x0b0-9A-Z_a-z][0-9A-Z_a-z]+[\s\x0b]*?[\-\|][\s\x0b]*?[\"'`][\s\x0b]*?[0-9A-Z_a-z]|@(?:[0-9A-Z_a-z]+[\s\x0b]+(?:and|x?or|div|like|between)\b[\s\x0b]*?[\"'0-9`]+|[\-0-9A-Z_a-z]+[\s\x0b](?:and|x?or|div|like|between)\b[\s\x0b]*?[^\s\x0b0-9A-Z_a-z])|[^\s\x0b0-:A-Z_a-z][\s\x0b]*?[0-9][^0-9A-Z_a-z]+[^\s\x0b0-9A-Z_a-z][\s\x0b]*?[\"'`].|[^0-9A-Z_a-z]information_schema|table_name[^0-9A-Z_a-z]" \
    "id:942330,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects classic SQL injection probings 1/3',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942340.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942340
#
# Note that part of 942340.data is already optimized, to avoid a
# Regexp::Assemble behaviour, where the regex is not optimized very nicely.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)in[\s\x0b]*?\(+[\s\x0b]*?select|(?:(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between)[\s\x0b]+|(?:\|\||&&)[\s\x0b]*?)[\s\x0b\+0-9A-Z_a-z]+(?:regexp[\s\x0b]*?\(|sounds[\s\x0b]+like[\s\x0b]*?[\"'`]|[0-9=]+x)|[\"'`](?:[\s\x0b]*?(?:(?:[0-9]+[\s\x0b]*?(?:--|#)|is[\s\x0b]*?(?:[0-9][^\"'`]+[\"'`]?[0-9A-Z_a-z]|[\.0-9]+[\s\x0b]*?[^0-9A-Z_a-z][^\"'`]*[\"'`])|(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between)[\s\x0b]+|(?:\|\||&&)[\s\x0b]*?)(?:array[\s\x0b]*?\[|(?:tru|fals)e\b|[0-9A-Z_a-z]+(?:[\s\x0b]*?!?~|[\s\x0b]+(?:not[\s\x0b]+)?similar[\s\x0b]+to[\s\x0b]+))|[%&<->\^]+[0-9]+[\s\x0b]*?(?:and|n(?:and|ot)|(?:xx?)?or|div|like|between)=)|(?:[^0-9A-Z_a-z]+[\+\-0-9A-Z_a-z]+[\s\x0b]*?=[\s\x0b]*?[0-9][^0-9A-Z_a-z]+|\|?[\-0-9A-Z_a-z]{3,}[^\s\x0b,\.0-9A-Z_a-z]+)[\"'`])|\bexcept[\s\x0b]+(?:select\b|values[\s\x0b]*?\()" \
    "id:942340,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects basic SQL authentication bypass attempts 3/3',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# This rule is a stricter sibling of 942360.
# The keywords 'alter' and 'union' led to false positives.
# Therefore they have been moved to PL2 and the keywords have been extended on PL1.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i:^[\W\d]+\s*?(?:alter|union)\b)" \
    "id:942361,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects basic SQL injection based on keyword alter or union',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# This rule is a stricter sibling of 942360.
# The loose word boundaries and light context led to false positives.
# Because the stricter variant does miss quite a few legitimate payloads, the loose version was moved to PL2.
#
# Regular expression generated from regex-assembly/942362.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942362
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)(?:alter|(?:(?:cre|trunc|upd)at|renam)e|de(?:lete|sc)|(?:inser|selec)t|load)[\s\x0b]+(?:char|group_concat|load_file)[\s\x0b]?\(?|end[\s\x0b]*?\);|[\s\x0b\(]load_file[\s\x0b]*?\(|[\"'`][\s\x0b]+regexp[^0-9A-Z_a-z]|[^A-Z_a-z][\s\x0b]+as\b[\s\x0b]*[\"'0-9A-Z_-z]+[\s\x0b]*\bfrom|^[^A-Z_a-z]+[\s\x0b]*?(?:create[\s\x0b]+[0-9A-Z_a-z]+|(?:d(?:e(?:lete|sc)|rop)|(?:inser|selec)t|load|(?:renam|truncat)e|u(?:pdate|nion[\s\x0b]*(?:all|(?:sele|distin)ct))|alter[\s\x0b]*(?:a(?:(?:ggregat|pplication[\s\x0b]*rol)e|s(?:sembl|ymmetric[\s\x0b]*ke)y|u(?:dit|thorization)|vailability[\s\x0b]*group)|b(?:roker[\s\x0b]*priority|ufferpool)|c(?:ertificate|luster|o(?:l(?:latio|um)|nversio)n|r(?:edential|yptographic[\s\x0b]*provider))|d(?:atabase|efault|i(?:mension|skgroup)|omain)|e(?:(?:ndpoi|ve)nt|xte(?:nsion|rnal))|f(?:lashback|oreign|u(?:lltext|nction))|hi(?:erarchy|stogram)|group|in(?:dex(?:type)?|memory|stance)|java|l(?:a(?:ngua|r)ge|ibrary|o(?:ckdown|g(?:file[\s\x0b]*group|in)))|m(?:a(?:s(?:k|ter[\s\x0b]*key)|terialized)|e(?:ssage[\s\x0b]*type|thod)|odule)|(?:nicknam|queu)e|o(?:perator|utline)|p(?:a(?:ckage|rtition)|ermission|ro(?:cedur|fil)e)|r(?:e(?:mot|sourc)e|o(?:l(?:e|lback)|ute))|s(?:chema|e(?:arch|curity|rv(?:er|ice)|quence|ssion)|y(?:mmetric[\s\x0b]*key|nonym)|togroup)|t(?:able(?:space)?|ext|hreshold|r(?:igger|usted)|ype)|us(?:age|er)|view|w(?:ork(?:load)?|rapper)|x(?:ml[\s\x0b]*schema|srobject)))\b)" \
    "id:942362,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects concatenated basic SQL injection and SQLLFI attempts',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


# This rule is a sibling of 942330. See that rule for a description and overview.
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942370.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942370
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS:Referer|REQUEST_HEADERS:User-Agent|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"'`](?:[\s\x0b]*?(?:(?:\*.+(?:x?or|div|like|between|(?:an|i)d)[^0-9A-Z_a-z]*?[\"'`]|(?:x?or|div|like|between|and)[\s\x0b][^0-9]+[\-0-9A-Z_a-z]+[^0-9]*)[0-9]|[^\s\x0b0-9\?A-Z_a-z]+[\s\x0b]*?[^\s\x0b0-9A-Z_a-z]+[\s\x0b]*?[\"'`]|[^\s\x0b0-9A-Z_a-z]+[\s\x0b]*?[^A-Z_a-z](?:[^#]*#|.*?--))|[^\*]*\*[\s\x0b]*?[0-9])|\^[\"'`]|[%\(-\+\-<>][\-0-9A-Z_a-z]+[^\s\x0b0-9A-Z_a-z]+[\"'`][^,]" \
    "id:942370,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects classic SQL injection probings 2/3',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942380.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942380
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:having\b(?:[\s\x0b]+(?:[0-9]{1,10}|'[^=]{1,10}')[\s\x0b]*?[<->]| ?(?:[0-9]{1,10} ?[<->]+|[\"'][^=]{1,10}[ \"'<-\?\[]+))|ex(?:ecute(?:\(|[\s\x0b]{1,5}[\$\.0-9A-Z_a-z]{1,5}[\s\x0b]{0,3})|ists[\s\x0b]*?\([\s\x0b]*?select\b)|(?:create[\s\x0b]+?table.{0,20}?|like[^0-9A-Z_a-z]*?char[^0-9A-Z_a-z]*?)\()|select.*?case|from.*?limit|order[\s\x0b]by|exists[\s\x0b](?:[\s\x0b]select|s(?:elect[^\s\x0b](?:if(?:null)?[\s\x0b]\(|top|concat)|ystem[\s\x0b]\()|\bhaving\b[\s\x0b]+[0-9]{1,10}|'[^=]{1,10}')" \
    "id:942380,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942390.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942390
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:or\b(?:[\s\x0b]?(?:[0-9]{1,10}|[\"'][^=]{1,10}[\"'])[\s\x0b]?[<->]+|[\s\x0b]+(?:[0-9]{1,10}|'[^=]{1,10}')(?:[\s\x0b]*?[<->])?)|xor\b[\s\x0b]+(?:[0-9]{1,10}|'[^=]{1,10}')(?:[\s\x0b]*?[<->])?)|'[\s\x0b]+x?or[\s\x0b]+.{1,20}[!\+\-<->]" \
    "id:942390,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/942400.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942400
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\band\b(?:[\s\x0b]+(?:[0-9]{1,10}[\s\x0b]*?[<->]|'[^=]{1,10}')| ?(?:[0-9]{1,10}|[\"'][^=]{1,10}[\"']) ?[<->]+)" \
    "id:942400,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# The former rule id 942410 was split into three new rules: 942410, 942470, 942480
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Regular expression generated from regex-assembly/942410.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942410
#
SecRule REQUEST_COOKIES|!REQUEST_COOKIES:/_pk_ref/|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:a(?:(?:b|co)s|vg)|bin|c(?:(?:as|o(?:nver|un))t|h(?:ar(?:set)?|r))|d(?:a(?:te|y)|e(?:fault|grees))|elt|f(?:ield|loor|ormat)|(?:hou|quarte|yea)r|i[fns]|l(?:ast|e(?:ft|ngth)|n|ikelihood|o(?:cal|g|wer))|m(?:ax|in(?:ute)?|o(?:d|nth))|now|p(?:assword|i|o(?:sition|wer))|r(?:awtonhex(?:toraw)?|e(?:p(?:eat|lace)|verse)|ight|ound)|s(?:econd|ign|leep|pace|tddev|um)|t(?:an|ime|o_(?:n?char|(?:day|second)s))|u(?:nlikely|(?:pp|s)er)|v(?:alues|ersion)|week)[^0-9A-Z_a-z]*?\(" \
    "id:942410,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


# The former rule id 942410 was split into three new rules: 942410, 942470, 942480
#
# Regular expression generated from regex-assembly/942470.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942470
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)autonomous_transaction|(?:current_use|n?varcha|tbcreato)r|db(?:a_users|ms_java)|open(?:owa_util|query|rowset)|s(?:p_(?:(?:addextendedpro|sqlexe)c|execute(?:sql)?|help|is_srvrolemember|makewebtask|oacreate|p(?:assword|repare)|replwritetovarbin)|ql_(?:longvarchar|variant))|utl_(?:file|http)|xp_(?:availablemedia|(?:cmdshel|servicecontro)l|dirtree|e(?:numdsn|xecresultset)|filelist|loginconfig|makecab|ntsec(?:_enumdomains)?|reg(?:addmultistring|delete(?:key|value)|enum(?:key|value)s|re(?:ad|movemultistring)|write)|terminate(?:_process)?)" \
    "id:942470,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


# The former rule id 942410 was split into three new rules: 942410, 942470, 942480
#
# Regular expression generated from regex-assembly/942480.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942480
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b(?:(?:d(?:bms_[0-9A-Z_a-z]+\.|elete\b[^0-9A-Z_a-z]*?\bfrom)|(?:group\b.*?\bby\b.{1,100}?\bhav|overlay\b[^0-9A-Z_a-z]*?\(.*?\b[^0-9A-Z_a-z]*?plac)ing|in(?:ner\b[^0-9A-Z_a-z]*?\bjoin|sert\b[^0-9A-Z_a-z]*?\binto|to\b[^0-9A-Z_a-z]*?\b(?:dump|out)file)|load\b[^0-9A-Z_a-z]*?\bdata\b.*?\binfile|s(?:elect\b.{1,100}?\b(?:(?:.*?\bdump\b.*|(?:count|length)\b.{1,100}?)\bfrom|(?:data_typ|from\b.{1,100}?\bwher)e|instr|to(?:_(?:cha|numbe)r|p\b.{1,100}?\bfrom))|ys_context)|u(?:nion\b.{1,100}?\bselect|tl_inaddr))\b|print\b[^0-9A-Z_a-z]*?@@)|(?:collation[^0-9A-Z_a-z]*?\(a|@@version|;[^0-9A-Z_a-z]*?\b(?:drop|shutdown))\b|'(?:dbo|msdasql|s(?:a|qloledb))'" \
    "id:942480,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


#
# [ SQL Injection Character Anomaly Usage ]
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# This rules attempts to gauge when there is an excessive use of
# meta-characters within a single parameter payload.
#
# Expect a lot of false positives with this rule.
# The most likely false positive instances will be free-form text fields.
# This will make it necessary to disable the rule for certain known parameters.
# The following directive is an example to switch off the rule globally for
# the parameter foo. Place this instruction in your configuration after
# the include directive for the Core Rules Set.
#
# SecRuleUpdateTargetById 942430 "!ARGS:foo"
#

# Regular expression generated from regex-assembly/942430.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942430
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){12})" \
    "id:942430,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Restricted SQL Character Anomaly Detection (args): # of special characters exceeded (12)',\
    logdata:'Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'WARNING',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.warning_anomaly_score}',\
    setvar:'tx.sql_injection_score=+%{tx.warning_anomaly_score}'"

#
# -=[ Detect SQL Comment Sequences ]=-
#
# Example Payloads Detected:
# -------------------------
# OR 1#
# DROP sampletable;--
# admin'--
# DROP/*comment*/sampletable
# DR/**/OP/*bypass deny listing*/sampletable
# SELECT/*avoid-spaces*/password/**/FROM/**/Members
# SELECT /*!32302 1/0, */ 1 FROM tablename
# ‘ or 1=1#
# ‘ or 1=1-- -
# ‘ or 1=1/*
# ' or 1=1;\x00
# 1='1' or-- -
# ' /*!50000or*/1='1
# ' /*!or*/1='1
# 0/**/union/*!50000select*/table_name`foo`/**/
# -------------------------
#
# The chained rule is designed to prevent false positives by specifically
# targeting JWT tokens and common tokens (brid, fbclid, gclid, recaptcha, ttclid, etc).
#
# Starting with 'ey' targets JWT tokens, where the 'ey'
# prefix corresponds to the beginning of the Base64-encoded header section.
#
# example:
# $ echo '{"' | base64
# eyIK
#
# Regular expressions generated from regex-assembly/942440.ra and regex-assembly/942440-chain1.ra.
# To update the regular expressions run the following shell scripts
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942440
#   crs-toolchain regex update 942440-chain1
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx /\*!?|\*/|[';]--|--(?:[\s\x0b]|[^\-]*?-)|[^&\-]#.*?[\s\x0b]|;?\x00" \
    "id:942440,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Comment Sequence Detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    chain"
    SecRule MATCHED_VARS "!@rx ^(?:ey[\-0-9A-Z_a-z]+\.ey[\-0-9A-Z_a-z]+\.)?[\-0-9A-Z_a-z]+$" \
        "t:none,\
        setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}',\
        setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}'"


#
# -=[ SQL Bin / Hex Evasion Methods ]=-
#
# Hex encoding detection:
# (?i:\b0x[a-f\d]{3,}) will match any 3 or more hex bytes after "0x", together forming a hexadecimal payload(e.g 0xf00, 0xf00d and so on)
#
# Regular expression generated from regex-assembly/942450.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942450
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\b0x[0-9a-f]{3,}|(?:x'[0-9a-f]{3,}|b'[01]{10,})'" \
    "id:942450,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Bin or Hex Encoding Identified',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


#
# -=[ Detect SQLi bypass: backticks ]=-
#
# Quotes and backticks can be used to bypass SQLi detection.
#
# Example:
# GET http://localhost/test.php?id=9999%20or+{`if`(2=(select+2+from+wp_users+where+user_login='admin'))}
#
# The minimum text between the ticks or backticks must be 2 (if, for example) and a maximum of 29.
# 29 is a compromise: The lower this number (29), the lower the probability of FP and the higher the probability of false negatives.
# In tests we got a minimum number of FP with {2,29}.
#
# Base64 encoding detection:
# (?:[A-Za-z0-9+/]{4})+ #match any number of 4-letter blocks of the base64 char set
# (?:[A-Za-z0-9+/]{2}== #match 2-letter block of the base64 char set followed by "==", together forming a 4-letter block
# |                     # or
# [A-Za-z0-9+/]{3}=     #match 3-letter block of the base64 char set followed by "=", together forming a 4-letter block
# )?
#
# The minimal string that triggers this regexp is: `if`
#
# The rule 942511 is similar to this rule, but triggers on normal quotes
# ('if'). That rule runs in paranoia level 3 or higher since it is prone to
# false positives in natural text.
#
# Regular expression generated from regex-assembly/942510.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942510
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx `(?:[\s\x0b\(\)\+\-0-9<=@-Z_a-\{\}]{2,29}|(?:[\+/-9A-Za-z]{4})+(?:(?:[\+/-9A-Za-z]{2}=|[\+/-9A-Za-z]{3})=)?)`" \
    "id:942510,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQLi bypass attempt by ticks or backticks detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


# Regular expression generated from regex-assembly/942520.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942520
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)[\"'`][\s\x0b]*?(?:(?:is[\s\x0b]+not|not[\s\x0b]+(?:like|glob|(?:betwee|i)n|null|regexp|match)|mod|div|sounds[\s\x0b]+like)\b|[%&\*\+\-/<->\^\|]{1,3})" \
    "id:942520,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects basic SQL authentication bypass attempts 4.0/4',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


# Complementary rule to PL2 942520 that block and/or-based bypasses.
# It blocks data with odd number of quotes and then (and|or).
#
# The rule uses the expression ^b*a*(b*a*b*a*)* to odd number of a's. It's not
# vulnerable to ReDos as it executes linearly many steps compared to input size.
#
# Regular expression generated from regex-assembly/942521.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942521
#
SecRule REQUEST_HEADERS:User-Agent|REQUEST_HEADERS:Referer|ARGS_NAMES|ARGS|XML:/* "@rx (?i)^(?:[^']*?(?:'[^']*?'[^']*?)*?'|[^\"]*?(?:\"[^\"]*?\"[^\"]*?)*?\"|[^`]*?(?:`[^`]*?`[^`]*?)*?`)[\s\x0b]*([0-9A-Z_a-z]+)\b" \
    "id:942521,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects basic SQL authentication bypass attempts 4.1/4',\
    logdata:'Matched Data: %{TX.0} found within %{TX.942521_MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.942521_matched_var_name=%{matched_var_name}',\
    chain"
    SecRule TX:1 "@rx ^(?:and|or)$" \
        "t:none,\
        setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
        setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


# Complementary rule to PL2 942521 that block escaped quotes followed by (and|or)
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx ^.*?\x5c['\"`](?:.*?['\"`])?\s*(?:and|or)\b" \
    "id:942522,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects basic SQL authentication bypass attempts 4.1/4',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


#
# This is a sibling of rule 942100 that adds checking of the path.
#
# REQUEST_BASENAME provides the last url segment (slash excluded).
# This segment is the most likely to be used for injections. Stripping out
# the slash permits libinjection to do not consider it as a payload starting
# with not unary arithmetical operators (not a valid SQL command, e.g.
# '/9 union all'). The latter would lead to do not detect malicious payloads.
#
# REQUEST_FILENAME matches SQLi payloads inside (or across) other segments
# of the path. Here, libinjection will detect a true positive only if
# the url leading slash is considered as part of a comment block or part
# of a string (with a quote or double quote after it). In these circumstances,
# previous slashes do not affect libinjection result, making it able to detect
# some SQLi inside the path.
#
SecRule REQUEST_BASENAME|REQUEST_FILENAME "@detectSQLi" \
    "id:942101,\
    phase:1,\
    block,\
    capture,\
    t:none,t:utf8toUnicode,t:urlDecodeUni,t:removeNulls,\
    msg:'SQL Injection Attack Detected via libinjection',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

#
# -=[ SQL Function Names ]=-
#
# This rule is a stricter sibling of 942151.
# This rule 942152 checks for the same regex in request headers referer and user-agent.
#
# Regular expression generated from regex-assembly/942152.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942152
#
SecRule REQUEST_HEADERS:Referer|REQUEST_HEADERS:User-Agent "@rx (?i)\b(?:a(?:dd(?:dat|tim)e|es_(?:de|en)crypt|s(?:cii(?:str)?|in)|tan2?)|b(?:enchmark|i(?:n_to_num|t_(?:and|count|length|x?or)))|c(?:har(?:acter)?_length|eil(?:ing)?|o(?:alesce|ercibility|llation|(?:mpres)?s|n(?:cat(?:_ws)?|nection_id|v(?:ert(?:_tz)?)?)|t)|rc32|ur(?:(?:dat|tim)e|rent_(?:date|setting|time(?:stamp)?|user)))|d(?:a(?:t(?:abase(?:_to_xml)?|e(?:_(?:add|format|sub)|diff))|y(?:name|of(?:month|week|year)))|count|e(?:code|grees|s_(?:de|en)crypt)|ump)|e(?:lt|n(?:c(?:ode|rypt)|ds_?with)|x(?:p(?:ort_set)?|tract(?:value)?))|f(?:i(?:el|n)d_in_set|ound_rows|rom_(?:base64|days|unixtime))|g(?:e(?:ometrycollection|t(?:_(?:format|lock)|pgusername))|(?:r(?:eates|oup_conca)|tid_subse)t)|hex(?:toraw)?|i(?:fnull|n(?:et6?_(?:aton|ntoa)|s(?:ert|tr)|terval)|s(?:_(?:(?:free|used)_lock|ipv(?:4(?:_(?:compat|mapped))?|6)|n(?:ot(?:_null)?|ull)|superuser)|null))|json(?:_(?:a(?:gg|rray(?:_(?:elements(?:_text)?|length))?)|build_(?:array|object)|e(?:ac|xtract_pat)h(?:_text)?|object(?:_(?:agg|keys))?|populate_record(?:set)?|strip_nulls|t(?:o_record(?:set)?|ypeof))|b(?:_(?:array(?:_(?:elements(?:_text)?|length))?|build_(?:array|object)|object(?:_(?:agg|keys))?|e(?:ac|xtract_pat)h(?:_text)?|insert|p(?:ath_(?:(?:exists|match)(?:_tz)?|query(?:_(?:(?:array|first)(?:_tz)?|tz))?)|opulate_record(?:set)?|retty)|s(?:et(?:_lax)?|trip_nulls)|t(?:o_record(?:set)?|ypeof)))?|path)?|l(?:ast_(?:day|insert_id)|case|e(?:as|f)t|i(?:kel(?:ihood|y)|nestring)|o(?:_(?:from_bytea|put)|ad_file|ca(?:ltimestamp|te)|g(?:10|2)|wer)|pad|trim)|m(?:a(?:ke(?:_set|date)|ster_pos_wait)|d5|i(?:crosecon)?d|onthname|ulti(?:linestring|po(?:int|lygon)))|n(?:ame_const|ot_in|ullif)|o(?:ct(?:et_length)?|(?:ld_passwo)?rd)|p(?:eriod_(?:add|diff)|g_(?:client_encoding|(?:databas|read_fil)e|l(?:argeobject|s_dir)|sleep|user)|o(?:(?:lyg|siti)on|w)|rocedure_analyse)|qu(?:arter|ery_to_xml|ote)|r(?:a(?:dians|nd|wtohex)|elease_lock|ow_(?:count|to_json)|pad|trim)|s(?:chema|e(?:c_to_time|ssion_user)|ha[12]?|in|oundex|pace|q(?:lite_(?:compileoption_(?:get|used)|source_id)|rt)|t(?:arts_?with|d(?:dev_(?:po|sam)p)?|r(?:_to_date|cmp))|ub(?:(?:dat|tim)e|str(?:ing(?:_index)?)?)|ys(?:date|tem_user))|t(?:ime(?:_(?:format|to_sec)|diff|stamp(?:add|diff)?)|o(?:_(?:base64|jsonb?)|n?char|(?:day|second)s)|r(?:im|uncate))|u(?:case|n(?:compress(?:ed_length)?|hex|i(?:str|x_timestamp)|likely)|(?:pdatexm|se_json_nul)l|tc_(?:date|time(?:stamp)?)|uid(?:_short)?)|var(?:_(?:po|sam)p|iance)|we(?:ek(?:day|ofyear)|ight_string)|xmltype|yearweek)[^0-9A-Z_a-z]*\(" \
    "id:942152,\
    phase:1,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQL Injection Attack: SQL function name detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

#
# This rule is a stricter sibling of 942320.
# It checks for the same regex in request headers referer and user-agent.
#
# Regular expression generated from regex-assembly/942321.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942321
#
SecRule REQUEST_HEADERS:Referer|REQUEST_HEADERS:User-Agent "@rx (?i)create[\s\x0b]+(?:function|procedure)[\s\x0b]*?[0-9A-Z_a-z]+[\s\x0b]*?\([\s\x0b]*?\)[\s\x0b]*?-|d(?:eclare[^0-9A-Z_a-z]+[#@][\s\x0b]*?[0-9A-Z_a-z]+|iv[\s\x0b]*?\([\+\-]*[\s\x0b\.0-9]+,[\+\-]*[\s\x0b\.0-9]+\))|exec[\s\x0b]*?\([\s\x0b]*?@|(?:lo_(?:impor|ge)t|procedure[\s\x0b]+analyse)[\s\x0b]*?\(|;[\s\x0b]*?(?:declare|open)[\s\x0b]+[\-0-9A-Z_a-z]+|::(?:b(?:igint|ool)|double[\s\x0b]+precision|int(?:eger)?|numeric|oid|real|(?:tex|smallin)t)" \
    "id:942321,\
    phase:1,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects MySQL and PostgreSQL stored procedure/function injections',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:942015,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:942016,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#


#
# [ SQL HAVING queries ]
#
# This pattern was split off from rule 942250 due to frequent
# false positives in English text. Testing showed that SQL
# injections with HAVING should be detected by libinjection
# (rule 942100).
#
# This is a stricter sibling of rule 942250.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\W+\d*?\s*?\bhaving\b\s*?[^\s\-]" \
    "id:942251,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects HAVING injections',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/3',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}'"

# This rule is a stricter sibling of 942330. See that rule for a
# description and overview.
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx [\"'`][\s\d]*?[^\w\s]\W*?\d\W*?.*?[\"'`\d]" \
    "id:942490,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Detects classic SQL injection probings 3/3',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/3',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}'"

#
# [ SQL Injection Character Anomaly Usage ]
#
# This rule attempts to gauge when there is an excessive use of
# meta-characters within a single parameter payload.
#
# It is similar to 942430, but focuses on Cookies instead of
# GET/POST parameters.
#
# Expect a lot of false positives with this rule.
# The most likely false positive instances will be complex session ids.
# This will make it necessary to disable the rule for certain known cookies.
# The following directive is an example to switch off the rule globally for
# the cookie foo_id. Place this instruction in your configuration after
# the include directive for the Core Rules Set.
#
# SecRuleUpdateTargetById 942420 "!REQUEST_COOKIES:foo_id"
#

# Regular expression generated from regex-assembly/942420.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942420
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){8})" \
    "id:942420,\
    phase:1,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Restricted SQL Character Anomaly Detection (cookies): # of special characters exceeded (8)',\
    logdata:'Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/3',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'WARNING',\
    setvar:'tx.inbound_anomaly_score_pl3=+%{tx.warning_anomaly_score}',\
    setvar:'tx.sql_injection_score=+%{tx.warning_anomaly_score}'"


#
# This is a stricter sibling of rule 942430.
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#

# Regular expression generated from regex-assembly/942431.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942431
#
SecRule ARGS_NAMES|!ARGS_NAMES:/^[\w]+\[[\w\-]+\]\[[\w\-]*?\]$/|!ARGS_NAMES:/^[\w]+\[[\w\-]+\]\[[\w\-]+\]\[[\w\-]*?\]$/|ARGS|XML:/* "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){6})" \
    "id:942431,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Restricted SQL Character Anomaly Detection (args): # of special characters exceeded (6)',\
    logdata:'Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/3',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'WARNING',\
    setvar:'tx.inbound_anomaly_score_pl3=+%{tx.warning_anomaly_score}',\
    setvar:'tx.sql_injection_score=+%{tx.warning_anomaly_score}'"


#
# [ Repetitive Non-Word Characters ]
#
# This rule attempts to identify when multiple (4 or more) non-word characters
# are repeated in sequence.
#
# The pattern may occur in some normal texts, e.g. "foo...." will match.
#
# If your traffic contains languages that include accented characters, such as French,
# Spanish, or German, be aware that you may encounter more false positives than
# usual. In this case, you may consider increasing the consecutive occurrence limit
# to 5 instead of 4.
#
# This will help avoid common triggers such as "test=+à+", which is frequent in French.
#
# All languages that use characters without a valid representation outside of UTF-8
# (i.e., relying solely on multi-byte sequences such as %E6%84%9B (Japanese))
# are incompatible with this rule.
# In such cases, the rule should be globally disabled.
#
SecRule ARGS "@rx \W{4}" \
    "id:942460,\
    phase:2,\
    block,\
    capture,\
    t:none,\
    msg:'Meta-Character Anomaly Detection Alert - Repetitive Non-Word Characters',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/3',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'WARNING',\
    setvar:'tx.sql_injection_score=+%{tx.warning_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl3=+%{tx.warning_anomaly_score}'"


#
# -=[ Detect SQLi bypass: quotes ]=-
#
# Quotes and backticks can be used to bypass SQLi detection.
#
# Example:
# GET http://localhost/test.php?id=9999%20or+{`if`(2=(select+2+from+wp_users+where+user_login='admin'))}
#
# The minimum text between the ticks or backticks must be 2 (if, for example) and a maximum of 29.
# 29 is a compromise: The lower this number (29), the lower the probability of FP and the higher the probability of false negatives.
# In tests we got a minimum number of FP with {2,29}.
#
# Base64 encoding detection:
# (?:[A-Za-z0-9+/]{4})+ #match any number of 4-letter blocks of the base64 char set
# (?:[A-Za-z0-9+/]{2}== #match 2-letter block of the base64 char set followed by "==", together forming a 4-letter block
# |                     # or
# [A-Za-z0-9+/]{3}=     #match 3-letter block of the base64 char set followed by "=", together forming a 4-letter block
# )?
#
# The minimal string that triggers this regexp is: 'if'
#
# The rule 942510 is similar to this rule, but triggers on backticks
# (`if`). That rule runs in paranoia level 2 or higher since the risk of
# false positives in natural text is still present but lower than this
# rule.
#
# Regular expression generated from regex-assembly/942511.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942511
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx '(?:[\s\x0b\(\)\+\-0-9<=@-Z_a-\{\}]{2,29}|(?:[\+/-9A-Za-z]{4})+(?:(?:[\+/-9A-Za-z]{2}=|[\+/-9A-Za-z]{3})=)?)'" \
    "id:942511,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQLi bypass attempt by ticks detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/3',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}'"

# Detects ';
# ' Single quote. Used to delineate a query with an unmatched quote.
# ; Terminate a query. A prematurely terminated query creates an error.
# Explanation source:
# https://hwang.cisdept.cpp.edu/swanew/Text/SQL-Injection.htm
#
# Bug Bounty example: email=admin@juice-sh.op';&password=foo
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx ';" \
    "id:942530,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'SQLi query termination detected',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/3',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.sql_injection_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}'"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:942017,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:942018,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-942-APPLICATION-ATTACK-SQLI"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#

#
# [ SQL Injection Character Anomaly Usage ]
#
# This is a stricter sibling of rule 942420.
#

# Regular expression generated from regex-assembly/942421.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942421
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){3})" \
    "id:942421,\
    phase:1,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Restricted SQL Character Anomaly Detection (cookies): # of special characters exceeded (3)',\
    logdata:'Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/4',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'WARNING',\
    setvar:'tx.inbound_anomaly_score_pl4=+%{tx.warning_anomaly_score}',\
    setvar:'tx.sql_injection_score=+%{tx.warning_anomaly_score}'"


#
# This is a stricter sibling of rule 942430.
#
# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#

# Regular expression generated from regex-assembly/942432.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 942432
#
SecRule ARGS_NAMES|ARGS|XML:/* "@rx ((?:(?:[!-\+\-:->@\[\]\^`\{-~]|\x{c2}\x{b4}|\x{e2}\x80[\x98\x99])[^!-\+\-:->@\[\]\^`\{-~]*?){2})" \
    "id:942432,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Restricted SQL Character Anomaly Detection (args): # of special characters exceeded (2)',\
    logdata:'Matched Data: %{TX.1} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-sqli',\
    tag:'paranoia-level/4',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SQLI',\
    tag:'capec/1000/152/248/66',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'WARNING',\
    setvar:'tx.inbound_anomaly_score_pl4=+%{tx.warning_anomaly_score}',\
    setvar:'tx.sql_injection_score=+%{tx.warning_anomaly_score}'"


#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-942-APPLICATION-ATTACK-SQLI"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000013', 'crs-943', 'CRS session', $wafcrs$# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:943011,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:943012,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#

#
# Session fixation
#
# -=[ References ]=-
# http://projects.webappsec.org/Session-Fixation
# http://projects.webappsec.org/w/page/13246960/Session%20Fixation
# http://capec.mitre.org/data/definitions/61.html
#
# Regular expression generated from regex-assembly/943100.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 943100
#
SecRule REQUEST_COOKIES|REQUEST_COOKIES_NAMES|ARGS_NAMES|ARGS|XML:/* "@rx (?i)\.cookie\b.*?;[^0-9A-Z_a-z]*?(?:expires|domain)[^0-9A-Z_a-z]*?=|\bhttp-equiv[^0-9A-Z_a-z]+set-cookie\b" \
    "id:943100,\
    phase:2,\
    block,\
    capture,\
    t:none,t:urlDecodeUni,\
    msg:'Possible Session Fixation Attack: Setting Cookie Values in HTML',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-fixation',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SESSION-FIXATION',\
    tag:'capec/1000/225/21/593/61',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.session_fixation_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# Regular expression generated from regex-assembly/943110.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 943110
#
SecRule ARGS_NAMES "@rx ^(?:j(?:se(?:ssionid|rvsession)|wsession)|(?:asp(?:\.net_)?session|zend_session_)id|p(?:hpsessi(?:on|d)|lay_session)|(?:(?:w(?:eblogic|l)|rack\.|laravel_)sessio|(?:next-auth\.session-|meteor_login_)toke)n|s(?:(?:ession[\-_]?|ails\.s)id|hiny-token)|_(?:session_id|(?:(?:flask|rails)_sessio|_(?:secure|host)-next-auth\.session-toke)n)|c(?:f(?:s?id|token)|onnect\.sid|akephp|i_session)|koa[\.:]sess)$" \
    "id:943110,\
    phase:2,\
    block,\
    capture,\
    t:none,t:lowercase,\
    msg:'Possible Session Fixation Attack: SessionID Parameter Name with Off-Domain Referer',\
    logdata:'Matched Data: %{TX.0} found within %{TX.943110_MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-fixation',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SESSION-FIXATION',\
    tag:'capec/1000/225/21/593/61',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.943110_matched_var_name=%{matched_var_name}',\
    chain"
    SecRule REQUEST_HEADERS:Referer "@rx ^(?:ht|f)tps?://(.*?)/" \
        "capture,\
        chain"
        SecRule TX:1 "!@endsWith %{request_headers.host}" \
            "setvar:'tx.session_fixation_score=+%{tx.critical_anomaly_score}',\
            setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# Regular expression generated from regex-assembly/943120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 943120
#
SecRule ARGS_NAMES "@rx ^(?:j(?:se(?:ssionid|rvsession)|wsession)|(?:asp(?:\.net_)?session|session[\-_]?)id|phpsessi(?:on|d)|(?:weblogic|laravel_)session|_(?:session_id|flask_session)|c(?:f(?:s?id|token)|onnect\.sid))$" \
    "id:943120,\
    phase:2,\
    block,\
    capture,\
    t:none,t:lowercase,\
    msg:'Possible Session Fixation Attack: SessionID Parameter Name with No Referer',\
    logdata:'Matched Data: %{TX.0} found within %{TX.943120_MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-multi',\
    tag:'platform-multi',\
    tag:'attack-fixation',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-SESSION-FIXATION',\
    tag:'capec/1000/225/21/593/61',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.943120_matched_var_name=%{matched_var_name}',\
    chain"
    SecRule &REQUEST_HEADERS:Referer "@eq 0" \
        "setvar:'tx.session_fixation_score=+%{tx.critical_anomaly_score}',\
        setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"




SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:943013,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:943014,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:943015,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:943016,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:943017,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:943018,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#



#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000014', 'crs-944', 'CRS Java', $wafcrs$# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#
# Many rules check request bodies, use "SecRequestBodyAccess On" to enable it on main modsecurity configuration file.

SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:944011,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:944012,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#
# This rule is also triggered by an Apache Struts exploit:
# [ Apache Struts vulnerability CVE-2017-5638 - Exploit tested: https://github.com/xsscx/cve-2017-5638 ]
#
# This rule is also triggered by an Apache Struts Remote Code Execution exploit:
# [ Apache Struts vulnerability CVE-2017-9791 - Exploit tested: https://www.exploit-db.com/exploits/42324 ]
#
# This rule is also triggered by an Apache Struts Remote Code Execution exploit:
# [ Apache Struts vulnerability CVE-2017-9805 - Exploit tested: https://www.exploit-db.com/exploits/42627 ]
#
# This rule is also triggered by an Oracle WebLogic Remote Command Execution exploit:
# [ Oracle WebLogic vulnerability CVE-2017-10271 - Exploit tested: https://www.exploit-db.com/exploits/43458 ]
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx java\.lang\.(?:runtime|processbuilder)" \
    "id:944100,\
    phase:2,\
    block,\
    t:none,t:lowercase,\
    msg:'Remote Command Execution: Suspicious Java class detected',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/137/6',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# This rule is also triggered by the following exploit(s):
# [ Apache Struts vulnerability CVE-2017-5638 - Exploit tested: https://github.com/xsscx/cve-2017-5638 ]
# [ Apache Struts vulnerability CVE-2017-9791 - Exploit tested: https://www.exploit-db.com/exploits/42324 ]
# [ Apache Struts vulnerability CVE-2017-9805 - Exploit tested: https://www.exploit-db.com/exploits/42627 ]
# [ Java deserialization vulnerability/Apache Struts (CVE-2017-9805) ]
# [ Java deserialization vulnerability/Oracle Weblogic (CVE-2017-10271) ]
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
# Generic rule to detect processbuilder or runtime calls, if any of those is found and the same target contains
# java. unmarshaller or base64data to trigger a potential payload execution
# tested with https://www.exploit-db.com/exploits/42627/ and https://www.exploit-db.com/exploits/43458/

SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* "@rx (?:runtime|processbuilder)" \
    "id:944110,\
    phase:2,\
    block,\
    t:none,t:lowercase,\
    msg:'Remote Command Execution: Java process spawn (CVE-2017-9805)',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/248',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    chain"
    SecRule MATCHED_VARS|XML:/*|XML://@* "@rx (?i)(?:unmarshaller|base64data|java\.)" \
        "setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
        setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# Magic bytes detected and payload included possibly RCE vulnerable classes detected and process execution methods detected
# anomaly score set to critical as all conditions indicate the request try to perform RCE.
# Regular expression generated from regex-assembly/944120.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944120
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx (?:clonetransform|xmldecod)er|f(?:orclosure|ilewriter)|in(?:stantiate(?:factory|transformer)|vokertransformer)|(?:prototype(?:clone|serialization)factor|getpropert)y|whileclosure" \
    "id:944120,\
    phase:2,\
    block,\
    t:none,t:lowercase,\
    msg:'Remote Command Execution: Java serialization (CVE-2015-4852)',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/248',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    chain"
    SecRule MATCHED_VARS "@rx (?:runtime|processbuilder)" \
        "setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
        setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"

# This rule is also triggered by the following exploit(s):
# [ Apache Struts vulnerability CVE-2017-5638 - Exploit tested: https://github.com/mazen160/struts-pwn ]
# [ Apache Struts vulnerability CVE-2017-5638 - Exploit tested: https://github.com/xsscx/cve-2017-5638 ]
# [ Apache Struts vulnerability CVE-2017-9791 - Exploit tested: https://www.exploit-db.com/exploits/42324 ]
# [ Apache Struts vulnerability CVE-2017-9805 - Exploit tested: https://www.exploit-db.com/exploits/42627 ]
# [ Oracle WebLogic vulnerability CVE-2017-10271 - Exploit tested: https://www.exploit-db.com/exploits/43458 ]
# [ Apache Struts vulnerability CVE-2018-11776 - Exploit tested: https://www.exploit-db.com/exploits/45262 ]
# [ Apache Struts vulnerability CVE-2018-11776 - Exploit tested: https://www.exploit-db.com/exploits/45260 ]
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_FILENAME|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@pmFromFile java-classes.data" \
    "id:944130,\
    phase:2,\
    block,\
    t:none,\
    msg:'Suspicious Java class detected',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/248',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


#
# [ Java Script Uploads ]
#
# Block file uploads with filenames ending in Java scripts (.jsp, .jspx)
#
# Many application contain Unrestricted File Upload vulnerabilities.
# https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload
#
# Attackers may use such a vulnerability to achieve remote code execution
# by uploading a script file. If the upload storage location is predictable
# and not adequately protected, the attacker may then request the uploaded
# file and have the code within it executed on the server.
#
# Some AJAX uploaders use the nonstandard request headers X-Filename,
# X_Filename, or X-File-Name to transmit the file name to the server;
# scan these request headers as well as multipart/form-data file names.
#
SecRule FILES|REQUEST_HEADERS:X-Filename|REQUEST_HEADERS:X_Filename|REQUEST_HEADERS:X.Filename|REQUEST_HEADERS:X-File-Name "@rx .*\.(?:jsp|jspx)\.*$" \
    "id:944140,\
    phase:2,\
    block,\
    capture,\
    t:none,t:lowercase,t:removeWhitespace,\
    msg:'Java Injection Attack: Java Script File Upload Found',\
    logdata:'Matched Data: %{TX.0} found within %{MATCHED_VAR_NAME}: %{MATCHED_VAR}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-injection-java',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/242',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


# Log4J / Log4Shell Defense
#
# This addresses exploits against the Log4J library described in several CVEs:
# * CVE-2021-44228
# * CVE-2021-44832
# * CVE-2021-45046
# * CVE-2021-45105
#
# See https://coreruleset.org/20211213/crs-and-log4j-log4shell-cve-2021-44228/
#
# This rule attempts to detect two things:
# * Nested use of ${
# * use of ${jndi:... without the closing bracket
#
# Rule 932130 is also essential for defense since there are certain
# bypasses of the log4j rules that can be caught by 932130.
#
# The payload is not displayed in the alert message since log4j could
# potentially be executed on the logviewer.
#
# This rule has stricter siblings: 944151 (PL2), 944152 (PL4)
#
# Regular expression generated from regex-assembly/944150.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944150
#
SecRule REQUEST_LINE|ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* "@rx (?i)(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)(?:[^\}]{0,15}(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)|jndi|ctx)" \
    "id:944150,\
    phase:2,\
    block,\
    t:none,t:urlDecodeUni,t:jsDecode,t:htmlEntityDecode,\
    log,\
    msg:'Potential Remote Command Execution: Log4j / Log4shell',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/1',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/137/6',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl1=+%{tx.critical_anomaly_score}'"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:944013,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:944014,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#

# This is a stricter sibling of 944150.
# It is a re-iteration of said rule without the curly bracket distance limiter
# between the nested "${". This is prone to backtracking and therefore a potential
# DoS problem for backtracking regular expression engines (e.g. PCRE2), but it also avoids evasions that fill the space between the nested
# elements with arbitrary data.
#
# Regular expression generated from regex-assembly/944151.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944151
#
SecRule REQUEST_LINE|ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* "@rx (?i)(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)(?:[^\}]*(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)|jndi|ctx)" \
    "id:944151,\
    phase:2,\
    block,\
    t:none,t:urlDecodeUni,t:jsDecode,t:htmlEntityDecode,\
    log,\
    msg:'Potential Remote Command Execution: Log4j / Log4shell',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/137/6',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# [ Java deserialization vulnerability/Apache Commons (CVE-2015-4852) ]
#
# Detect exploitation of "Java deserialization" Apache Commons.
#
# Based on rules by @spartantri.
# https://spartantri.com/ModSecurity/?p=44
#
# Interesting references about the vulnerability
# https://foxglovesecurity.com/2015/11/06/what-do-weblogic-websphere-jboss-jenkins-opennms-and-your-application-have-in-common-this-vulnerability/
# https://github.com/GrrrDog/Java-Deserialization-Cheat-Sheet
#
# Potential false positives with random fields, the anomaly level is set low to avoid blocking request
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx \xac\xed\x00\x05" \
    "id:944200,\
    phase:2,\
    block,\
    msg:'Magic bytes Detected, probable java serialization in use',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/248',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Detecting possible base64 text to match encoded magic bytes \xac\xed\x00\x05 with padding encoded in base64 strings are rO0ABQ KztAAU Cs7QAF
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx (?:rO0ABQ|KztAAU|Cs7QAF)" \
    "id:944210,\
    phase:2,\
    block,\
    msg:'Magic bytes Detected Base64 Encoded, probable java serialization in use',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/248',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# Regular expression generated from regex-assembly/944240.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944240
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx (?:clonetransform|xmldecod)er|f(?:orclosure|ilewriter)|in(?:stantiate(?:factory|transformer)|vokertransformer)|(?:prototype(?:clone|serialization)factor|getpropert)y|whileclosure" \
    "id:944240,\
    phase:2,\
    block,\
    t:none,t:lowercase,\
    msg:'Remote Command Execution: Java serialization (CVE-2015-4852)',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/248',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"

# This rule is also triggered by the following exploit(s):
# [ SAP CRM Java vulnerability CVE-2018-2380 - Exploit tested: https://www.exploit-db.com/exploits/44292 ]
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx java\b.+(?:runtime|processbuilder)" \
    "id:944250,\
    phase:2,\
    block,\
    t:lowercase,\
    msg:'Remote Command Execution: Suspicious Java method detected',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/248',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


# This rule is also triggered by the following exploit(s):
# - https://www.rapid7.com/blog/post/2022/03/30/spring4shell-zero-day-vulnerability-in-spring-framework/
#
# Regular expression generated from regex-assembly/944260.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944260
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx class\.module\.classLoader\.resources\.context\.parent\.pipeline|springframework\.context\.support\.FileSystemXmlApplicationContext" \
    "id:944260,\
    phase:2,\
    block,\
    t:urlDecodeUni,\
    msg:'Remote Command Execution: Malicious class-loading payload',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/2',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/248',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl2=+%{tx.critical_anomaly_score}'"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:944015,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:944016,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#
# Interesting keywords for possibly RCE on vulnerable classes and methods base64 encoded
# Keywords = ['runtime', 'processbuilder', 'clonetransformer', 'forclosure', 'instantiatefactory', 'instantiatetransformer', 'invokertransformer', 'prototypeclonefactory', 'prototypeserializationfactory', 'whileclosure']
#for item in keywords:
#   pad='\x00'
#   for padding in xrange(3):
#     print base64.b64encode(''.join([pad*padding,item])).replace('=','')[padding:],
#cnVudGltZQ HJ1bnRpbWU BydW50aW1l cHJvY2Vzc2J1aWxkZXI HByb2Nlc3NidWlsZGVy Bwcm9jZXNzYnVpbGRlcg Y2xvbmV0cmFuc2Zvcm1lcg GNsb25ldHJhbnNmb3JtZXI BjbG9uZXRyYW5zZm9ybWVy Zm9yY2xvc3VyZQ GZvcmNsb3N1cmU Bmb3JjbG9zdXJl aW5zdGFudGlhdGVmYWN0b3J5 Gluc3RhbnRpYXRlZmFjdG9yeQ BpbnN0YW50aWF0ZWZhY3Rvcnk aW5zdGFudGlhdGV0cmFuc2Zvcm1lcg Gluc3RhbnRpYXRldHJhbnNmb3JtZXI BpbnN0YW50aWF0ZXRyYW5zZm9ybWVy aW52b2tlcnRyYW5zZm9ybWVy Gludm9rZXJ0cmFuc2Zvcm1lcg BpbnZva2VydHJhbnNmb3JtZXI cHJvdG90eXBlY2xvbmVmYWN0b3J5 HByb3RvdHlwZWNsb25lZmFjdG9yeQ Bwcm90b3R5cGVjbG9uZWZhY3Rvcnk cHJvdG90eXBlc2VyaWFsaXphdGlvbmZhY3Rvcnk HByb3RvdHlwZXNlcmlhbGl6YXRpb25mYWN0b3J5 Bwcm90b3R5cGVzZXJpYWxpemF0aW9uZmFjdG9yeQ d2hpbGVjbG9zdXJl HdoaWxlY2xvc3VyZQ B3aGlsZWNsb3N1cmU
#
# Regular expression generated from regex-assembly/944300.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944300
#
SecRule ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_BODY|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* \
    "@rx c(?:nVudGltZQ|HJv(?:Y2Vzc2J1aWxkZXI|dG90eXBl(?:Y2xvbmVmYWN0b3J5|c2VyaWFsaXphdGlvbmZhY3Rvcnk)))|H(?:J1bnRpbWU|Byb(?:2Nlc3NidWlsZGVy|3RvdHlwZ(?:WNsb25lZmFjdG9yeQ|XNlcmlhbGl6YXRpb25mYWN0b3J5))|doaWxlY2xvc3VyZQ)|B(?:(?:ydW50aW1|mb3JjbG9zdXJ)l|wcm9(?:jZXNzYnVpbGRlcg|0b3R5cGV(?:jbG9uZWZhY3Rvcnk|zZXJpYWxpemF0aW9uZmFjdG9yeQ))|jbG9uZXRyYW5zZm9ybWVy|pbn(?:N0YW50aWF0Z(?:WZhY3Rvcnk|XRyYW5zZm9ybWVy)|Zva2VydHJhbnNmb3JtZXI)|3aGlsZWNsb3N1cmU)|Y2xvbmV0cmFuc2Zvcm1lcg|G(?:Nsb25ldHJhbnNmb3JtZXI|ZvcmNsb3N1cmU|lu(?:c3RhbnRpYXRl(?:ZmFjdG9yeQ|dHJhbnNmb3JtZXI)|dm9rZXJ0cmFuc2Zvcm1lcg))|Zm9yY2xvc3VyZQ|aW5(?:zdGFudGlhdGV(?:mYWN0b3J5|0cmFuc2Zvcm1lcg)|2b2tlcnRyYW5zZm9ybWVy)|d2hpbGVjbG9zdXJl" \
    "id:944300,\
    phase:2,\
    block,\
    t:none,\
    msg:'Base64 encoded string matched suspicious keyword',\
    logdata:'Matched Data: %{MATCHED_VAR} found within %{MATCHED_VAR_NAME}',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/3',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/248',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl3=+%{tx.critical_anomaly_score}'"


SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:944017,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:944018,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-944-APPLICATION-ATTACK-JAVA"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#

# This is a stricter sibling of 944150.
# It simply checks for the existence of `${`, taking into account the same encoding evasions
# as 944150.
#
# Regular expression generated from regex-assembly/944152.ra.
# To update the regular expression run the following shell script
# (consult https://coreruleset.org/docs/development/regex_assembly/ for details):
#   crs-toolchain regex update 944152
#
SecRule REQUEST_LINE|ARGS|ARGS_NAMES|REQUEST_COOKIES|REQUEST_COOKIES_NAMES|REQUEST_HEADERS|!REQUEST_HEADERS:Cookie|XML:/*|XML://@* "@rx (?i)(?:\$|&dollar;?)(?:\{|&l(?:brace|cub);?)" \
    "id:944152,\
    phase:2,\
    block,\
    t:none,t:urlDecodeUni,t:jsDecode,t:htmlEntityDecode,\
    log,\
    msg:'Potential Remote Command Execution: Log4j / Log4shell',\
    tag:'application-multi',\
    tag:'language-java',\
    tag:'platform-multi',\
    tag:'attack-rce',\
    tag:'paranoia-level/4',\
    tag:'OWASP_CRS',\
    tag:'OWASP_CRS/ATTACK-JAVA',\
    tag:'capec/1000/152/137/6',\
    ver:'OWASP_CRS/4.25.0',\
    severity:'CRITICAL',\
    setvar:'tx.rce_score=+%{tx.critical_anomaly_score}',\
    setvar:'tx.inbound_anomaly_score_pl4=+%{tx.critical_anomaly_score}'"

#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-944-APPLICATION-ATTACK-JAVA"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000015', 'crs-949', 'CRS blocking', $wafcrs$# ------------------------------------------------------------------------
# OWASP CRS ver.4.25.0
# Copyright (c) 2006-2020 Trustwave and contributors. All rights reserved.
# Copyright (c) 2021-2026 CRS project. All rights reserved.
#
# The OWASP CRS is distributed under
# Apache Software License (ASL) version 2
# Please see the enclosed LICENSE file for full details.
# ------------------------------------------------------------------------

#
# -= Paranoia Level 0 (empty) =- (apply unconditionally)
#

# Summing up the blocking and detection anomaly scores in phase 1
# even when early blocking is disabled, we need to sum up the scores in phase 1
# this prevents bugs in phase 5 if Apache skips phases because of error handling
# See: https://github.com/coreruleset/coreruleset/issues/2319#issuecomment-1047503932

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 1" \
    "id:949052,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl1}'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 1" \
    "id:949152,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl1}'"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 2" \
    "id:949053,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl2}'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 2" \
    "id:949153,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl2}'"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 3" \
    "id:949054,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl3}'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 3" \
    "id:949154,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl3}'"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 4" \
    "id:949055,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl4}'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 4" \
    "id:949155,\
    phase:1,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl4}'"

# at start of phase 2, we reset the aggregate scores to 0 to prevent duplicate counting of per-PL scores
# this is necessary because the per-PL scores are counted across phases
SecAction \
    "id:949059,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.blocking_inbound_anomaly_score=0'"

SecAction \
    "id:949159,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.detection_inbound_anomaly_score=0'"

# Summing up the blocking and detection anomaly scores in phase 2

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 1" \
    "id:949060,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl1}'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 1" \
    "id:949160,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl1}'"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 2" \
    "id:949061,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl2}'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 2" \
    "id:949161,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl2}'"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 3" \
    "id:949062,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl3}'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 3" \
    "id:949162,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl3}'"

SecRule TX:BLOCKING_PARANOIA_LEVEL "@ge 4" \
    "id:949063,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.blocking_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl4}'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@ge 4" \
    "id:949163,\
    phase:2,\
    pass,\
    t:none,\
    nolog,\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    setvar:'tx.detection_inbound_anomaly_score=+%{tx.inbound_anomaly_score_pl4}'"


SecMarker "BEGIN-REQUEST-BLOCKING-EVAL"

#
# -=[ Anomaly Mode: Overall Transaction Anomaly Score ]=-
#

# if early blocking is active, check threshold in phase 1
SecRule TX:BLOCKING_INBOUND_ANOMALY_SCORE "@ge %{tx.inbound_anomaly_score_threshold}" \
    "id:949111,\
    phase:1,\
    deny,\
    t:none,\
    msg:'Inbound Anomaly Score Exceeded in phase 1 (Total Score: %{TX.BLOCKING_INBOUND_ANOMALY_SCORE})',\
    tag:'anomaly-evaluation',\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0',\
    chain"
    SecRule TX:EARLY_BLOCKING "@eq 1"

# always check threshold in phase 2
SecRule TX:BLOCKING_INBOUND_ANOMALY_SCORE "@ge %{tx.inbound_anomaly_score_threshold}" \
    "id:949110,\
    phase:2,\
    deny,\
    t:none,\
    msg:'Inbound Anomaly Score Exceeded (Total Score: %{TX.BLOCKING_INBOUND_ANOMALY_SCORE})',\
    tag:'anomaly-evaluation',\
    tag:'OWASP_CRS',\
    ver:'OWASP_CRS/4.25.0'"

SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:949011,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 1" "id:949012,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
#
# -= Paranoia Level 1 (default) =- (apply only when tx.detection_paranoia_level is sufficiently high: 1 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:949013,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 2" "id:949014,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
#
# -= Paranoia Level 2 =- (apply only when tx.detection_paranoia_level is sufficiently high: 2 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:949015,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 3" "id:949016,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
#
# -= Paranoia Level 3 =- (apply only when tx.detection_paranoia_level is sufficiently high: 3 or higher)
#



SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:949017,phase:1,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
SecRule TX:DETECTION_PARANOIA_LEVEL "@lt 4" "id:949018,phase:2,pass,nolog,tag:'OWASP_CRS',ver:'OWASP_CRS/4.25.0',skipAfter:END-REQUEST-949-BLOCKING-EVALUATION"
#
# -= Paranoia Level 4 =- (apply only when tx.detection_paranoia_level is sufficiently high: 4 or higher)
#



#
# -= Paranoia Levels Finished =-
#
SecMarker "END-REQUEST-949-BLOCKING-EVALUATION"
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000016', 'ssrf.data', 'Словарь SSRF для @pmFromFile', $wafcrs$# Sources:
# - https://gist.githubusercontent.com/jhaddix/78cece26c91c6263653f31ba453e273b/raw/a4869d58a5ce337d1465c2d1b29777b9eecd371f/cloud_metadata.txt
# - https://book.hacktricks.xyz/pentesting-web/ssrf-server-side-request-forgery/cloud-ssrf
# - https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/Server%20Side%20Request%20Forgery
# - https://github.com/assetnote/blind-ssrf-chains

## AWS
# from http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-data-categories
#
# To fully protect, use IMDSv2 (see https://aws.amazon.com/blogs/security/defense-in-depth-open-firewalls-reverse-proxies-ssrf-vulnerabilities-ec2-instance-metadata-service/)

http://instance-data/latest/
http://169.254.169.254/latest/

# Common evasion techniques:
http://2852039166/latest/
http://025177524776/latest/
http://0251.0376.0251.0376/latest/
http://0xA9.0xFE.0xA9.0xFE/latest/
http://0xA9FEA9FE/latest/
http://0251.254.169.254/latest/
http://[::ffff:a9fe:a9fe]/latest/
http://[0:0:0:0:0:ffff:a9fe:a9fe]/latest/
http://[0:0:0:0:0:ffff:169.254.169.254]/latest/
http://169.254.169.254.nip.io/latest/
http://nicob.net/redir-http-169.254.169.254:80-

# http://127.0.0.1
http://2130706433/
# http://192.168.0.1
http://3232235521/
# http://192.168.1.1
http://3232235777/
# http://169.254.169.254
http://2852039166/
# IPv6 base
http://[::]:

# localhost bypass
http://localtest.me
http://127.0.0.1.nip.io
http://127.127.127.127
http://127.0.1.3
http://127.0.0.0
http://127.0.0.1
http://0.0.0.0
http://localhost
http://0177.0.0.1/
http://[::1]
http://[0000::1]
http://[::ffff:127.0.0.1]
http://[0:0:0:0:0:ffff:127.0.0.1]
http://0/
http://127.1
http://127.0.1
http:127.0.0.1

# AWS ECS
http://169.254.170.2/v2

## Google Cloud
#  https://cloud.google.com/compute/docs/metadata/overview
#  - Requires the header "Metadata-Flavor: Google" or "X-Google-Metadata-Request: True"

http://169.254.169.254/computeMetadata/v1/
http://metadata.google.internal/computeMetadata/v1/
http://metadata/computeMetadata/v1/
# Common evasion techniques:
http://2852039166/computeMetadata/v1/
http://025177524776/computeMetadata/v1/
http://0251.0376.0251.0376/computeMetadata/v1/
http://[::ffff:a9fe:a9fe]/computeMetadata/v1/
http://[0:0:0:0:0:ffff:a9fe:a9fe]/computeMetadata/v1/
http://[0:0:0:0:0:ffff:169.254.169.254]/computeMetadata/v1/
http://169.254.169.254.nip.io/computeMetadata/v1/
http://0xA9.0xFE.0xA9.0xFE/computeMetadata/v1/
http://0xA9FEA9FE/computeMetadata/v1/
http://0251.254.169.254/computeMetadata/v1/

# Google gopher SSRF
gopher://metadata.google.internal

# Google allows recursive pulls
http://metadata.google.internal/computeMetadata/v1/instance/disks/?recursive=true

## Google
#  Beta does NOT require a header atm
http://metadata.google.internal/computeMetadata/v1beta1/

## Digital Ocean
# https://developers.digitalocean.com/documentation/metadata/

http://169.254.169.254/metadata/v1.json
# This other prefix will be used from Azure: http://169.254.169.254/metadata/v1/

## Packetcloud

https://metadata.packet.net/userdata

## Azure
#
# To be effective, these also have to:
#
# - contain the header Metadata: true
# - not contain an X-Forwarded-For header

http://169.254.169.254/metadata/v1/
http://169.254.169.254/metadata/instance?api-version=2017-04-02
http://169.254.169.254/metadata/instance/network/interface/0/ipv4/ipAddress/0/publicIpAddress?api-version=2017-04-02&format=text
# Common evasion techniques:
http://2852039166/metadata/v1/
http://025177524776/metadata/v1/
http://0251.0376.0251.0376/metadata/v1/
http://[::ffff:a9fe:a9fe]/metadata/v1/
http://[0:0:0:0:0:ffff:a9fe:a9fe]/metadata/v1/
http://[0:0:0:0:0:ffff:169.254.169.254]/metadata/v1/
http://169.254.169.254.nip.io/metadata/v1/
http://0xA9.0xFE.0xA9.0xFE/metadata/v1/
http://0xA9FEA9FE/metadata/v1/
http://0251.254.169.254/metadata/v1/

## OpenStack/RackSpace
http://169.254.169.254/openstack

## HP Helion
# (header required? unknown)
http://169.254.169.254/2009-04-04/meta-data/

## Oracle Cloud
http://192.0.0.192/latest/

## Alibaba
http://100.100.100.200/latest/meta-data/

# Rancher metadata
http://rancher-metadata/

# Local Docker
http://127.0.0.1:2375
http://2130706433:2375/
http://[::]:2375/
http://[0000::1]:2375/
http://[0:0:0:0:0:ffff:127.0.0.1]:2375/
http://2130706433:2375/
http://017700000001:2375/
http://0x7f000001:2375/
http://0xc0a80014:2375/
# Kubernetes etcd
http://127.0.0.1:2379

# Enclosed alphanumerics
http://169。254。169。254
http://169｡254｡169｡254
http://⑯⑨。②⑤④。⑯⑨｡②⑤④
http://⓪ⓧⓐ⑨｡⓪ⓧⓕⓔ｡⓪ⓧⓐ⑨｡⓪ⓧⓕⓔ
http://⓪ⓧⓐ⑨ⓕⓔⓐ⑨ⓕⓔ
http://②⑧⑤②⓪③⑨①⑥⑥
http://④②⑤｡⑤①⓪｡④②⑤｡⑤①⓪
http://⓪②⑤①。⓪③⑦⑥。⓪②⑤①。⓪③⑦⑥
http://⓪⓪②⑤①｡⓪⓪⓪③⑦⑥｡⓪⓪⓪⓪②⑤①｡⓪⓪⓪⓪⓪③⑦⑥
http://[::①⑥⑨｡②⑤④｡⑯⑨｡②⑤④]
http://[::ⓕⓕⓕⓕ:①⑥⑨。②⑤④。⑯⑨。②⑤④]
http://⓪ⓧⓐ⑨。⓪③⑦⑥。④③⑤①⑧
http://⓪ⓧⓐ⑨｡⑯⑥⑧⑨⑥⑥②
http://⓪⓪②⑤①。⑯⑥⑧⑨⑥⑥②
http://⓪⓪②⑤①｡⓪ⓧⓕⓔ｡④③⑤①⑧

# Java only blind ssrf
jar:http://127.0.0.1!/
jar:https://127.0.0.1!/
jar:ftp://127.0.0.1!/

# Other PL1 protocols
gopher://127.0.0.1
gopher://localhost

# AWS Lambda
http://localhost:9001/2018-06-01/runtime/
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000017', 'ssrf-no-scheme.data', 'SSRF без схемы', $wafcrs$# SSRF patterns without schemes
#
# This file contains localhost and internal DNS names that are commonly used
# in SSRF attacks. These patterns are checked without URI schemes to catch
# cases where frameworks automatically prepend 'http://' or 'https://'.
#
# Sources:
# - https://gist.githubusercontent.com/jhaddix/78cece26c91c6263653f31ba453e273b/raw/a4869d58a5ce337d1465c2d1b29777b9eecd371f/cloud_metadata.txt
# - https://book.hacktricks.xyz/pentesting-web/ssrf-server-side-request-forgery/cloud-ssrf
# - https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/Server%20Side%20Request%20Forgery
# - https://github.com/assetnote/blind-ssrf-chains
# - https://github.com/coreruleset/coreruleset/issues/4427

# Standard hosts aliases
localhost/
localhost.localdomain/
localhost4/
localhost4.localdomain4/
ipv6-localhost/
ip6-loopback/

# Docker based aliases
host.docker.internal/
gateway.docker.internal/
kubernetes.docker.internal/

# Podman
host.containers.internal/

# K8s API local service
kubernetes.default.svc.cluster.local/

# Testing services
localtest.me/
lvh.me/
$wafcrs$),
    ('a0000000-0000-4000-8000-000000000018', 'java-classes.data', 'Классы Java RCE', $wafcrs$# Java Classes for use with Java RCEs
#
# Used With Rule 944130 in Apache Struts and Oracle Weblogic RCEs Detection:
#
# CVE-2017-5638  (2017.01.29) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-5638
# CVE-2017-9791  (2017.06.21) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-9791
# CVE-2017-9805  (2017.06.21) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-9805
# CVE-2017-10271 (2017.06.21) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-10271
# CVE-2018-11776 (2018.06.05) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2018-11776
# CVE-2021-44228 (2021.11.26) https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2021-44228
#
# Additional Resources
# Apache S2-057 (2019.01.20) https://cwiki.apache.org/confluence/display/WW/S2-057

com.opensymphony.xwork2
com.sun.org.apache
classLoader
declaredClass
freemarker.core
freemarker.template
freemarker.ext.rhino
java.io.BufferedInputStream
java.io.BufferedReader
java.io.ByteArrayInputStream
java.io.ByteArrayOutputStream
java.io.CharArrayReader
java.io.DataInputStream
java.io.File
java.io.FileOutputStream
java.io.FilePermission
java.io.FileWriter
java.io.FilterInputStream
java.io.FilterOutputStream
java.io.FilterReader
java.io.InputStream
java.io.IOException
java.io.LineNumberReader
java.io.ObjectInputStream
java.io.ObjectOutputStream
java.io.OutputStream
java.io.PipedOutputStream
java.io.PipedReader
java.io.PrintStream
java.io.PushbackInputStream
java.io.Reader
java.io.StringReader
java.lang.Class
java.lang.Enum
java.lang.Integer
java.lang.Number
java.lang.Object
java.lang.Process
java.lang.ProcessBuilder
java.lang.reflect
java.lang.Runtime
java.lang.String
java.lang.System
java.net.HttpURLConnection
java.net.JarURLConnection
java.net.DatagramSocket
java.net.MulticastSocket
java.net.ServerSocket
java.net.Socket
java.net.URL
javassist
javax.naming.InitialContext
javax.script.ScriptEngineManager
javax.xml.parsers
javax.xml.stream
OgnlContext
OgnlUtil
org.apache.commons
org.apache.struts
org.apache.struts2
org.dom4j.io.SAXReader
org.jdom2.input.SAXBuilder
org.omg.CORBA
org.xml.sax
PropertyUtilsBean
java.beans.XMLDecode
java.nio.file
sun.reflect
$wafcrs$)
  ) as x(id, name, description, text_raw)
 where s.name = 'default';

insert into rule_sets (id, http_space_id, name, description)
select x.id::uuid, s.id, x.name, x.description
  from http_spaces s
  cross join (values
    ('b0000000-0000-4000-8000-000000000001', 'default', 'Базовый CRS: XSS, SQLi, LFI, сканеры'),
    ('b0000000-0000-4000-8000-000000000002', 'strict', 'CRS паранойя 2 и доп. сканеры/LFI/RCE'),
    ('b0000000-0000-4000-8000-000000000003', 'api', 'CRS XSS/SQLi и правила API сверху'),
    ('b0000000-0000-4000-8000-000000000004', 'allow', 'Движок выключен'),
    ('b0000000-0000-4000-8000-000000000005', 'deny', 'Отказ на любой запрос')
  ) as x(id, name, description)
 where s.name = 'default';

insert into rule_set_files (rule_set_id, rule_file_id, position)
select p.id, f.id, x.ord
  from http_spaces s
  join rule_sets p on p.http_space_id = s.id
  join (values
    ('default', 'engine', 0),
    ('default', 'setup-pl1', 1),
    ('default', 'crs-init', 2),
    ('default', 'crs-934', 3),
    ('default', 'crs-941', 4),
    ('default', 'crs-942', 5),
    ('default', 'crs-943', 6),
    ('default', 'crs-944', 7),
    ('default', 'crs-949', 8),
    ('default', 'extra-default', 9),
    ('strict', 'engine', 0),
    ('strict', 'setup-pl2', 1),
    ('strict', 'crs-init', 2),
    ('strict', 'crs-934', 3),
    ('strict', 'crs-941', 4),
    ('strict', 'crs-942', 5),
    ('strict', 'crs-943', 6),
    ('strict', 'crs-944', 7),
    ('strict', 'crs-949', 8),
    ('strict', 'extra-strict', 9),
    ('api', 'engine', 0),
    ('api', 'setup-pl1', 1),
    ('api', 'crs-init-api', 2),
    ('api', 'crs-941', 3),
    ('api', 'crs-942', 4),
    ('api', 'crs-949', 5),
    ('api', 'extra-api', 6),
    ('allow', 'engine-allow', 0),
    ('deny', 'engine-deny', 0),
    ('deny', 'extra-deny', 1)
  ) as x(profile, file, ord)
    on x.profile = p.name
  join rule_files f on f.http_space_id = s.id and f.name = x.file
 where s.name = 'default';
