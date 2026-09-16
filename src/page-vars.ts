const DIRECTIVE = /<!--#\s*(\w+)([^]*?)-->/g;

const ECHO_VAR = /var=["']([^"']*)["']/;

const COND_EXPR = /expr=["']([^"']*)["']/;

export function pageVars(body: string): string[] {
  const found = new Set<string>();

  DIRECTIVE.lastIndex = 0;

  let m: RegExpExecArray | null;

  while ((m = DIRECTIVE.exec(body)) !== null) {
    const [, cmd, args] = m;

    if (cmd === "echo") {
      const name = ECHO_VAR.exec(args)?.[1] ?? "";

      if (name !== "") {
        found.add(name);
      }

      continue;
    }

    if (cmd === "if" || cmd === "elif") {
      const expr = COND_EXPR.exec(args)?.[1] ?? "";

      for (const hit of expr.matchAll(/\$(\w+)/g)) {
        found.add(hit[1]);
      }
    }
  }

  return [...found].sort();
}
