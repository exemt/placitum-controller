import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { BlockActions } from './BlockActions';
import { BlockHeader, BlockTitle } from './BlockHeader';
import { CommitField } from './CommitField';
import { MarkerField } from './MarkerField';
import { useI18n } from '../../i18n/useI18n';
import type { ReactElement, ReactNode } from 'react';
import type { TranslationKey } from '../../i18n/translations';

interface StatementRowProps {
  /** Разряд строки — он же имя поля для чтения с экрана. */
  kind: TranslationKey;
  /**
   * Название блока: разряд строки, действие исключения или чип превью.
   *
   * Строка оборачивается в {@link BlockTitle}; узел (чип метки) ставится как
   * есть — как номер у свёрнутой карточки правила.
   */
  title: ReactNode;
  /** Значок названия: по нему разряд узнаётся раньше, чем прочитан текст. */
  icon?: ReactElement;
  text: string;
  /** Отметки перед кнопками: то, чего в самой строке не видно. */
  marks?: ReactNode;
  onCommit: (text: string) => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * Блок в одну строку, правящийся текстом: метка и директива без формы.
 *
 * Метка стоит здесь навсегда: содержимого у неё ровно одно — имя, и поле с
 * именем ничем не отличалось бы от поля со строкой целиком. Правка у неё
 * отдельная — {@link MarkerField}: в файл уходит только по кнопке, и только
 * когда строка снова разбирается как метка.
 *
 * Директива попадает сюда, когда разбор не сошёлся: незнакомое имя, лишний
 * аргумент, макрос `%{...}` в значении. Форма показала бы меньше, чем есть в
 * строке, а сохранила бы ровно то, что показала, — поэтому её и нет. Поле
 * знает о содержимом не больше, чем показывает, а разбирает набранное тот же
 * парсер, что читает файл; притворяться понимающим больше было бы обманом, а
 * не удобством. Всё, что разобралось, правится полями — {@link DirectiveRow}.
 *
 * Разряд стоит в колонке названия, там же, где у директивы имя, а у правила
 * номер, — и словом, а не написанием из файла: «Метка» это вывод редактора о
 * строке, а не то, что в ней набрано. У неразобранного исключения на его
 * месте стоит действие — «снимает правило», — потому что разряд «директива»
 * о такой строке не говорит ничего, а действие говорит главное.
 *
 * Сама строка идёт в колонке содержимого целиком, включая имя директивы. Это
 * не повтор названия: слева — то, чем редактор строку счёл, справа — то, что
 * в ней написано и что уйдёт в файл, если поле тронуть.
 */
export function StatementRow({
  kind,
  title,
  icon,
  text,
  marks,
  onCommit,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: StatementRowProps) {
  const { t } = useI18n();

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <BlockHeader
        // Сворачивать в одной строке нечего: колонка раскрывашки остаётся за
        // блоком пустой.
        toggle={null}
        title={
          typeof title === 'string' || icon !== undefined ? (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                alignItems: 'center',
                minWidth: 0,
                // Значок стоит рядом с текстом, а не внутри чипа, и меру ему
                // задавать некому: без неё он приходит крупнее самой подписи.
                '& .MuiSvgIcon-root': { fontSize: 18, color: 'text.secondary' },
              }}
            >
              {icon}
              {typeof title === 'string' ? <BlockTitle>{title}</BlockTitle> : title}
            </Stack>
          ) : (
            title
          )
        }
        marks={marks}
        actions={
          <BlockActions
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            duplicateLabel="builder.duplicateLine"
            deleteLabel="builder.deleteLine"
          />
        }
      >
        {kind === 'builder.marker' ? (
          <MarkerField
            value={text}
            onCommit={onCommit}
            aria-label={t(kind)}
          />
        ) : (
          <CommitField
            fullWidth
            value={text}
            // Пустая строка — это пустая строка, а не отказ от правки: что
            // набрано, то и уходит в файл, а строка без содержимого перестаёт
            // быть блоком и уходит из списка. Удаление рядом, и угадывать за
            // человека, которое из двух он имел в виду, незачем.
            onCommit={(next) => onCommit(next.trim())}
            sx={{
              '& .MuiInputBase-input': { fontFamily: 'ui-monospace, Consolas, monospace' },
            }}
            slotProps={{ htmlInput: { 'aria-label': t(kind), spellCheck: false } }}
          />
        )}
      </BlockHeader>
    </Paper>
  );
}
