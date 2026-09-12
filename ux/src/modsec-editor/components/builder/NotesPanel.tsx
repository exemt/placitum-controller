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

/**
 * Блок «Замечания»: всё, что сказано о правиле целиком, — реакция, фаза,
 * номер, действия, которые конструктор не редактирует.
 *
 * Блок наравне с условиями и действиями, а не подвал под ними: замечаний
 * бывает больше, чем самих полей, и в файле, который разбирают целиком, они
 * отодвигают следующее правило за край экрана. Свернуть их — то же желание,
 * что свернуть условия.
 *
 * Свёрнутый блок оставляет на виду число и первое сообщение: проблему нельзя
 * закрыть от себя нажатием, но и держать её раскрытой никто не обязан.
 *
 * Правилу без замечаний блок не нужен вовсе: пустая полоса «Замечаний нет»
 * занимала бы строку ровно там, где её нечем занять.
 */
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
