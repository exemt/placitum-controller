const MAX_COLUMN = 40;

interface Row {
  line: string;
  indent: string;
  tokens: string[];
}

function rowOf(line: string): Row | null {
  if (line.includes("\n")) {
    return null;
  }
  const body = line.trimStart();
  if (body === "" || body.startsWith("#") || !body.endsWith(";")) {
    return null;
  }
  if (body.includes('"') || body.includes("'")) {
    return null;
  }
  const tokens = body.split(/\s+/);
  if (tokens.length < 2) {
    return null;
  }
  return { line, indent: line.slice(0, line.length - body.length), tokens };
}

function widthsOf(rows: Row[]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.tokens.length - 1; i += 1) {
      widths[i] = Math.max(widths[i] ?? 0, row.tokens[i].length);
    }
  }
  return widths;
}

function alignRun(rows: Row[]): string[] {
  if (rows.length < 2) {
    return rows.map((row) => row.line);
  }
  const widths = widthsOf(rows);
  if (widths.some((width) => width > MAX_COLUMN)) {
    return rows.map((row) => row.line);
  }
  return rows.map(
    (row) =>
      row.indent +
      row.tokens
        .map((token, i) =>
          i === row.tokens.length - 1 ? token : token.padEnd(widths[i]),
        )
        .join(" "),
  );
}

export function flattenColumns(text: string): string {
  return text.replace(/(\S) {2,}/g, "$1 ");
}

export function alignColumns(lines: string[]): string[] {
  const out: string[] = [];
  let run: Row[] = [];

  const flush = () => {
    if (run.length > 0) {
      out.push(...alignRun(run));
      run = [];
    }
  };

  for (const line of lines) {
    const row = rowOf(line);
    if (
      row === null ||
      (run.length > 0 &&
        (run[0].indent !== row.indent || run[0].tokens[0] !== row.tokens[0]))
    ) {
      flush();
    }
    if (row === null) {
      out.push(line);
      continue;
    }
    run.push(row);
  }
  flush();

  return out;
}
