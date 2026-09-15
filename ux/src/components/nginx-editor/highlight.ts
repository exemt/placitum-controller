export type TokenKind =
  | "text"
  | "comment"
  | "string"
  | "variable"
  | "directive"
  | "block"
  | "important"
  | "number"
  | "flag"
  | "operator"
  | "punct"
  | "path"
  | "named";

export type Token = { kind: TokenKind; text: string };

function words(list: string): Set<string> {
  return new Set(list.split(/\s+/).filter((item) => item.length > 0));
}

export const BLOCKS = words(
  "http mail events server types location upstream charset_map limit_except if geo map split_clients match",
);

export const IMPORTANT = words(
  "include root alias listen server_name internal default_server try_files proxy_pass fastcgi_pass grpc_pass memcached_pass uwsgi_pass scgi_pass return rewrite set error_page",
);

export const DIRECTIVES = words(
  [
    "accept_mutex accept_mutex_delay access_log add_after_body add_before_body add_header addition_types aio aio_write",
    "allow ancient_browser ancient_browser_value auth_basic auth_basic_user_file auth_http auth_http_header auth_http_timeout auth_request auth_request_set",
    "autoindex autoindex_exact_size autoindex_format autoindex_localtime",
    "charset charset_types client_body_buffer_size client_body_in_file_only client_body_in_single_buffer client_body_temp_path client_body_timeout",
    "client_header_buffer_size client_header_timeout client_max_body_size connection_pool_size",
    "daemon dav_access dav_methods debug_connection debug_points default_type deny directio directio_alignment",
    "empty_gif env error_log etag expires",
    "fastcgi_bind fastcgi_buffer_size fastcgi_buffers fastcgi_busy_buffers_size fastcgi_cache fastcgi_cache_background_update",
    "fastcgi_cache_bypass fastcgi_cache_key fastcgi_cache_lock fastcgi_cache_methods fastcgi_cache_min_uses fastcgi_cache_path",
    "fastcgi_cache_use_stale fastcgi_cache_valid fastcgi_catch_stderr fastcgi_connect_timeout fastcgi_hide_header",
    "fastcgi_ignore_client_abort fastcgi_ignore_headers fastcgi_index fastcgi_intercept_errors fastcgi_keep_conn",
    "fastcgi_max_temp_file_size fastcgi_next_upstream fastcgi_param fastcgi_pass_header fastcgi_pass_request_body",
    "fastcgi_pass_request_headers fastcgi_read_timeout fastcgi_send_timeout fastcgi_split_path_info fastcgi_store",
    "fastcgi_temp_path",
    "gzip gzip_buffers gzip_comp_level gzip_disable gzip_http_version gzip_min_length gzip_proxied gzip_static gzip_types gzip_vary",
    "hash http2 http2_push http2_push_preload http3 http3_hq",
    "if_modified_since ignore_invalid_headers index internal",
    "keepalive keepalive_requests keepalive_time keepalive_timeout",
    "large_client_header_buffers least_conn limit_conn limit_conn_log_level limit_conn_status limit_conn_zone",
    "limit_rate limit_rate_after limit_req limit_req_log_level limit_req_status limit_req_zone lingering_close lingering_time lingering_timeout",
    "log_format log_not_found log_subrequest",
    "map_hash_bucket_size map_hash_max_size master_process max_ranges merge_slashes modern_browser modern_browser_value msie_padding msie_refresh",
    "open_file_cache open_file_cache_errors open_file_cache_min_uses open_file_cache_valid open_log_file_cache output_buffers override_charset",
    "pid port_in_redirect postpone_output proxy_bind proxy_buffer_size proxy_buffering proxy_buffers proxy_busy_buffers_size",
    "proxy_cache proxy_cache_bypass proxy_cache_key proxy_cache_lock proxy_cache_methods proxy_cache_min_uses proxy_cache_path",
    "proxy_cache_use_stale proxy_cache_valid proxy_connect_timeout proxy_cookie_domain proxy_cookie_path proxy_headers_hash_bucket_size",
    "proxy_headers_hash_max_size proxy_hide_header proxy_http_version proxy_ignore_client_abort proxy_ignore_headers proxy_intercept_errors",
    "proxy_max_temp_file_size proxy_method proxy_next_upstream proxy_pass_header proxy_pass_request_body proxy_pass_request_headers",
    "proxy_read_timeout proxy_redirect proxy_request_buffering proxy_send_timeout proxy_set_body proxy_set_header",
    "proxy_ssl_certificate proxy_ssl_certificate_key proxy_ssl_ciphers proxy_ssl_name proxy_ssl_protocols proxy_ssl_server_name proxy_ssl_session_reuse",
    "proxy_ssl_trusted_certificate proxy_ssl_verify proxy_store proxy_temp_path",
    "quic random read_ahead real_ip_header real_ip_recursive recursive_error_pages request_pool_size reset_timedout_connection",
    "resolver resolver_timeout rewrite_log satisfy secure_link send_timeout sendfile sendfile_max_chunk",
    "server_name_in_redirect server_names_hash_bucket_size server_names_hash_max_size server_tokens",
    "set_real_ip_from source_charset ssi ssl ssl_buffer_size ssl_certificate ssl_certificate_key ssl_ciphers ssl_client_certificate",
    "ssl_conf_command ssl_crl ssl_dhparam ssl_early_data ssl_ecdh_curve ssl_password_file ssl_prefer_server_ciphers ssl_protocols",
    "ssl_reject_handshake ssl_session_cache ssl_session_tickets ssl_session_timeout ssl_stapling ssl_stapling_verify ssl_trusted_certificate",
    "ssl_verify_client ssl_verify_depth stub_status sub_filter sub_filter_once sub_filter_types",
    "tcp_nodelay tcp_nopush timer_resolution types_hash_bucket_size types_hash_max_size underscores_in_headers",
    "use user userid valid_referers variables_hash_bucket_size variables_hash_max_size",
    "worker_connections worker_cpu_affinity worker_priority worker_processes worker_rlimit_core worker_rlimit_nofile worker_shutdown_timeout",
    "zone",
  ].join(" "),
);

export const FLAGS = words(
  "on off always never any all error timeout invalid_header http_500 http_502 http_503 http_504 expired updating",
);

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /\d+(?:\.\d+)?(?:[kKmMgGtTsS]|ms)?/y;
const VARIABLE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*/y;
const NAMED = /@[A-Za-z_][A-Za-z0-9_]*/y;
const PATH = /\/[^\s;{}"']*/y;
const SPACE = /[ \t]+/y;

function take(source: string, index: number, re: RegExp): string | undefined {
  re.lastIndex = index;
  const match = re.exec(source);
  return match === null ? undefined : match[0];
}

function kindOfIdent(name: string): TokenKind {
  if (name.startsWith("waf_")) {
    return "important";
  }
  if (BLOCKS.has(name)) {
    return "block";
  }
  if (IMPORTANT.has(name)) {
    return "important";
  }
  if (DIRECTIVES.has(name)) {
    return "directive";
  }
  if (FLAGS.has(name)) {
    return "flag";
  }
  return "text";
}

function readString(source: string, start: number): string {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return source.slice(start, i + 1);
    }
    if (ch === "\n") {
      break;
    }
    i += 1;
  }
  return source.slice(start, i);
}

export function tokenizeNginx(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n" || ch === "\r") {
      tokens.push({ kind: "text", text: ch });
      i += 1;
      continue;
    }
    const space = take(source, i, SPACE);
    if (space !== undefined) {
      tokens.push({ kind: "text", text: space });
      i += space.length;
      continue;
    }
    if (ch === "#") {
      let end = source.indexOf("\n", i);
      if (end < 0) {
        end = source.length;
      }
      tokens.push({ kind: "comment", text: source.slice(i, end) });
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const text = readString(source, i);
      tokens.push({ kind: "string", text });
      i += text.length;
      continue;
    }
    const variable = take(source, i, VARIABLE);
    if (variable !== undefined) {
      tokens.push({ kind: "variable", text: variable });
      i += variable.length;
      continue;
    }
    const named = take(source, i, NAMED);
    if (named !== undefined) {
      tokens.push({ kind: "named", text: named });
      i += named.length;
      continue;
    }
    if (ch === "/" && (i === 0 || /[\s{;=]/.test(source[i - 1] ?? ""))) {
      const path = take(source, i, PATH);
      if (path !== undefined) {
        tokens.push({ kind: "path", text: path });
        i += path.length;
        continue;
      }
    }
    const number = take(source, i, NUMBER);
    if (number !== undefined) {
      tokens.push({ kind: "number", text: number });
      i += number.length;
      continue;
    }
    const ident = take(source, i, IDENT);
    if (ident !== undefined) {
      tokens.push({ kind: kindOfIdent(ident), text: ident });
      i += ident.length;
      continue;
    }
    if (ch === "~" && source[i + 1] === "*") {
      tokens.push({ kind: "operator", text: "~*" });
      i += 2;
      continue;
    }
    if (ch === "^" && source[i + 1] === "~") {
      tokens.push({ kind: "operator", text: "^~" });
      i += 2;
      continue;
    }
    if (ch === "~" || ch === "=") {
      tokens.push({ kind: "operator", text: ch });
      i += 1;
      continue;
    }
    if ("{};()[],".includes(ch)) {
      tokens.push({ kind: "punct", text: ch });
      i += 1;
      continue;
    }
    tokens.push({ kind: "text", text: ch });
    i += 1;
  }
  return tokens;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function highlightNginx(source: string): string {
  const parts: string[] = [];
  for (const token of tokenizeNginx(source)) {
    const safe = escapeHtml(token.text);
    if (token.kind === "text") {
      parts.push(safe);
      continue;
    }
    parts.push(`<span class="ngx-${token.kind}">${safe}</span>`);
  }
  return parts.join("");
}
