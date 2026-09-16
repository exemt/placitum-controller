import type { NextFunction, Response } from "express";

import { pgCode, pgConstraint } from "./db.ts";

export type RejectPayload = { status: number; error: string };

export function isRejectPayload(err: unknown): err is RejectPayload {
  if (err === null || typeof err !== "object") {
    return false;
  }

  const row = err as { status?: unknown; error?: unknown };
  return typeof row.status === "number" && typeof row.error === "string";
}

export function sendWriteError(
  err: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (isRejectPayload(err)) {
    res.status(err.status).json({ error: err.error });
    return;
  }

  next(err);
}

export function pgWriteReject(
  err: unknown,
  kind:
    | "dataset"
    | "ruleSet"
    | "ruleFile"
    | "responsePage"
    | "ipProfile"
    | "server"
    | "location"
    | "port"
    | "certificate"
    | "upstream"
    | "inspector",
): RejectPayload | undefined {
  const code = pgCode(err);

  if (code === "23505") {
    const constraint = pgConstraint(err) ?? "";
    const error =
      kind === "dataset" && constraint.includes("address")
        ? "address_taken"
        : kind === "location"
          ? "path_taken"
          : kind === "port" && constraint.includes("one_default")
            ? "default_taken"
            : kind === "port" && constraint.includes("server_ports")
              ? "port_taken"
              : kind === "port" && constraint.includes("address")
                ? "address_taken"
                : kind === "certificate" && constraint.includes("server_certificates")
                  ? "kind_taken"
                  : "name_taken";
    return { status: 409, error };
  }

  if (code === "23503") {
    const constraint = pgConstraint(err) ?? "";
    if (kind === "port" && constraint.includes("server_ports")) {
      return { status: 409, error: "port_bound" };
    }
    if (kind === "certificate" && constraint.includes("server_certificates")) {
      return { status: 409, error: "certificate_bound" };
    }
    if (kind === "upstream" && constraint.includes("locations")) {
      return { status: 409, error: "upstream_bound" };
    }
    const error =
      kind === "dataset" && constraint.includes("dataset_addresses")
        ? "unknown_dataset"
        : kind === "ruleSet" && constraint.includes("rule_file")
          ? "unknown_file"
        : kind === "ipProfile" && constraint.includes("dataset")
          ? "unknown_list"
          : kind === "location" && constraint.includes("upstream")
            ? "unknown_upstream"
            : kind === "location" && constraint.includes("server")
              ? "unknown_server"
              : kind === "port"
                ? "unknown_port"
                : kind === "certificate"
                  ? "unknown_store_object"
                  : "unknown_space";
    return { status: 400, error };
  }

  return undefined;
}
