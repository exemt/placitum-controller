import { useWorkspace } from './workspaceContext';

export function useForeignFile(file: string | undefined): string {
  const { activeId, nameOf } = useWorkspace();
  if (file === undefined || file === activeId) return '';
  return nameOf(file);
}
