/**
 * Общее для журнала: как называется фильтр по вердикту и каким цветом
 * вердикт рисуется. Разбор кадров шины жил здесь же, пока был живой хвост.
 */

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

/**
 * Цвет действия модуля на карточке: красный / жёлтый / зелёный. Redirect
 * сюда как предупреждение, не как info — на карточке нужен тёплый акцент,
 * а не ещё один синий.
 */
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
