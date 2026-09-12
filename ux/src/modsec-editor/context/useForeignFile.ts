import { useWorkspace } from './workspaceContext';

/**
 * Имя файла, когда он не тот, который открыт.
 *
 * Внутри одного файла подписи остаются прежними: называть файл, который и так
 * на экране, значит повторять то, что видно в выборе раздела. А вот исключение
 * из соседнего файла обязано назвать свой — «строка 12» без него ведёт не туда.
 *
 * Пустая строка означает «файл тот же»: это же и признак, по которому подпись
 * решает, добавлять ли к себе имя.
 */
export function useForeignFile(file: string | undefined): string {
  const { activeId, nameOf } = useWorkspace();
  if (file === undefined || file === activeId) return '';
  return nameOf(file);
}
