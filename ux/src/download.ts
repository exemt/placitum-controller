/**
 * Отдача текста файлом: панель не ходит на сервер за выгрузкой -- тело уже
 * в форме, ссылку на blob создаём и тут же снимаем.
 */
export function downloadTextFile(filename: string, body: string): void {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
