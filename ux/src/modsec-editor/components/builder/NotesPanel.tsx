import { Counter } from './Counter';
import { Section } from './Section';
import { DiagnosticNotes } from '../diagnostics/DiagnosticNotes';
import { worstSeverity } from '../diagnostics/useDiagnostics';
import { useI18n } from '../../i18n/useI18n';
import { diagnosticKey } from '../../i18n/translations';
import type { Diagnostic } from '../../modsec/diagnostics';

interface NotesPanelProps {
  notes: Diagnostic[];
}

export function NotesPanel({ notes }: NotesPanelProps) {
  const { t } = useI18n();

  const [first] = notes;
  if (first === undefined) return null;

  return (
    <Section
      title={t('builder.notes')}
      summary={t(diagnosticKey(first.code), first.params)}
      counters={
        <Counter
          hint={t('builder.countRuleNotes', { count: String(notes.length) })}
          count={notes.length}
          severity={worstSeverity(notes)}
        />
      }
    >
      <DiagnosticNotes items={notes} />
    </Section>
  );
}
