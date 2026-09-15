export type AuditFilter = "all" | "deny" | "allow" | "redirect";

export function verdictColor(
  verdict: string,
): "default" | "success" | "error" | "warning" | "info" {
  switch (verdict) {
    case "deny":
      return "error";
    case "allow":
      return "success";
    case "redirect":
      return "info";
    case "score":
      return "warning";
    default:
      return "default";
  }
}

export function actionColor(
  verdict: string,
): "success" | "error" | "warning" {
  switch (verdict) {
    case "allow":
      return "success";
    case "deny":
      return "error";
    default:
      return "warning";
  }
}
