export function errorText(err: unknown): string {
  if (err === null || err === undefined) {
    return "";
  }
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(err);
}

export function errorCode(err: unknown): string {
  const text = errorText(err);
  const arrow = text.lastIndexOf("→");
  if (arrow >= 0) {
    return text.slice(arrow + 1).trim();
  }
  const dash = text.lastIndexOf(" - ");
  if (dash >= 0) {
    return text.slice(dash + 3).trim();
  }
  return text.replace(/^Error:\s*/i, "").trim();
}

export function errorMessage(
  t: (path: string) => string,
  err: unknown,
): string {
  const code = errorCode(err);
  if (code === "") {
    return errorText(err);
  }
  const key = `api.${code}`;
  const phrase = t(key);
  if (phrase !== key) {
    return phrase;
  }
  const colon = code.indexOf(": ");
  if (colon > 0) {
    const head = code.slice(0, colon);
    const headPhrase = t(`api.${head}`);
    if (headPhrase !== `api.${head}`) {
      return `${headPhrase} ${code.slice(colon + 2)}`;
    }
  }
  return code;
}

export function thunkError(result: {
  meta: { requestStatus: "pending" | "fulfilled" | "rejected" };
  payload?: unknown;
  error?: unknown;
}): string | null {
  if (result.meta.requestStatus !== "rejected") {
    return null;
  }
  if (typeof result.payload === "string" && result.payload !== "") {
    return result.payload;
  }
  return errorText(result.error);
}
