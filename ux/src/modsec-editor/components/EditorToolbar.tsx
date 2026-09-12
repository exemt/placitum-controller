import { useState } from 'react';
import type { ReactNode } from 'react';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RedoIcon from '@mui/icons-material/Redo';
import UndoIcon from '@mui/icons-material/Undo';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import { AddDirectiveDialog } from './builder/AddDirectiveDialog';
import { useRule } from '../context/ruleContext';
import { useBuilderView } from '../context/builderViewContext';
import { useI18n } from '../i18n/useI18n';
import { ICON_BUTTON_PAD } from '../theme';
import type { EditorTab } from '../context/editorViewContext';

/**
 * Просвет внутри обоймы: до краёв подложки, до подписи, между значками.
 *
 * Один на всё, потому что мерить его глаз будет по значкам, а не по разметке:
 * у иконочной кнопки есть собственное поле вокруг значка, и просвет разметки
 * к нему прибавляется. Поэтому всюду, где просвет упирается в кнопку, это
 * поле из него вычтено — а между двумя кнопками вычтено дважды.
 */
const GROUP_GAP = 8;

/**
 * Обойма мелких кнопок: подложка чуть темнее строки вкладок.
 *
 * Значки без подписей и счёт без рамки рассыпаются по полосе на отдельные
 * пятна, и глазу приходится собирать их заново. Своя подложка говорит, что
 * это одна группа, — а темнее, а не светлее, потому что группа служебная:
 * смотреть в неё надо реже, чем в содержимое документа.
 */
function ControlGroup({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'baseline',
        gap: `${GROUP_GAP - ICON_BUTTON_PAD}px`,
        pl: `${GROUP_GAP}px`,
        pr: `${GROUP_GAP - ICON_BUTTON_PAD}px`,
        borderRadius: 1,
        bgcolor: 'background.default',
        height: 26
      }}
      spacing={0.5}
    >
      {children}
    </Stack>
  );
}

/**
 * Отмена и повтор.
 *
 * Стоят до вкладок и отбиты от них делителем, потому что принадлежат
 * документу, а не режиму: шаг назад откатывает и набор текста, и правку из
 * формы, и от переключения вкладки эти кнопки не меняются — значит, и ездить
 * по строке вместе с ней не должны. Показывать их обязательно: сочетание
 * клавиш само себя не показывает.
 */
export function HistoryButtons() {
  const { t } = useI18n();
  const { undo, redo, canUndo, canRedo } = useRule();

  return (
    <Stack direction="row" spacing={0.5} sx={{mr:2}}>
      <Tooltip title={t('toolbar.undo')}>
        {/* Обёртка нужна, чтобы подсказка работала и у выключенной кнопки. */}
        <span>
          <IconButton
            size="small"
            disabled={!canUndo}
            onClick={undo}
            aria-label={t('toolbar.undo')}
          >
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('toolbar.redo')}>
        <span style={{ height: 20, width: 20 }}>
          <IconButton
            size="small"
            disabled={!canRedo}
            onClick={redo}
            aria-label={t('toolbar.redo')}
          >
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}

/** Сколько блоков раскрыто и кнопки «свернуть/раскрыть весь файл». */
function ExpansionControls() {
  const { t } = useI18n();
  const { expandAll, collapseAll, expandedCount, collapsibleCount } = useBuilderView();

  // Сворачивать нечего — обойма не нужна вовсе: пустая подложка выглядела бы
  // оторвавшимся от чего-то куском.
  if (collapsibleCount === 0) return null;

  return (
    <ControlGroup>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ lineHeight: '20px' }}>
        {t('builder.expandedOf', {
          expanded: String(expandedCount),
          total: String(collapsibleCount),
        })}
      </Typography>
      {/* Своя обойма у пары кнопок: между ними просветов разметки не нужно
          вовсе — расстояние набирается их собственными полями. */}
      <Stack direction="row" sx={{ gap: `${GROUP_GAP - 2 * ICON_BUTTON_PAD}px` }}>
        <Tooltip title={t('builder.collapseAll')}>
          <span style={{ height: 20, width: 20 }}>
            <IconButton
              size="small"
              disabled={expandedCount === 0}
              onClick={collapseAll}
              aria-label={t('builder.collapseAll')}
              sx={{ height: 20, width: 20 }}
            >
              <UnfoldLessIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        {/* Раскрыть весь большой файл — законное желание и дорогая операция:
            подсказка называет цену до нажатия, а не после. */}
        <Tooltip
          title={t(collapsibleCount > 100 ? 'builder.expandAllSlow' : 'builder.expandAll')}
        >
          <span style={{ height: 20, width: 20 }}>
            <IconButton
              size="small"
              disabled={expandedCount === collapsibleCount}
              onClick={expandAll}
              aria-label={t('builder.expandAll')}
              sx={{ height: 20, width: 20 }}
            >
              <UnfoldMoreIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </ControlGroup>
  );
}

/** Главное действие текстового режима: разложить правило по строкам. */
function FormatButton() {
  const { t } = useI18n();
  const { formatSource, canFormat } = useRule();

  return (
    <Tooltip title={t(canFormat ? 'toolbar.formatHint' : 'toolbar.formatDone')}>
      <span>
        <Button
          size="small"
          variant="contained"
          disabled={!canFormat}
          onClick={formatSource}
          startIcon={<AutoFixHighIcon fontSize="small" />}
        >
          {t('toolbar.format')}
        </Button>
      </span>
    </Tooltip>
  );
}

/**
 * Главное действие визуального режима: новая строка в конец файла.
 *
 * Меню, а не кнопка, потому что видов строки в файле четыре, и все четыре
 * конструктор правит: правило проверяет запрос, безусловное действие делает
 * своё на каждом, метка служит целью перехода, директива настраивает движок
 * или снимает чужое правило. Заводятся из меню тоже все четыре: уметь править
 * то, чего нельзя завести, — половина работы, и вторую половину приходилось
 * дописывать в текстовой вкладке. Подпись у кнопки поэтому одна на все четыре
 * и вида не называет: вид выбирают в меню.
 *
 * Делит меню черта по тому, исполняется ли строка на запросе: над ней два
 * вида, у которых есть номер и реакция, под ней два, у которых нет ни того,
 * ни другого.
 *
 * Трое из четырёх заводятся сразу: заготовка правила и безусловного действия
 * одна, а метке нужно только имя, и правится оно там же, в строке. Директива
 * спрашивает в окне и имя, и значение: имя у неё потом неправимое, а
 * незаполненная строка заблокировала бы конструктор целиком — вместе с
 * возможностью её дозаполнить.
 */
function AddButton() {
  const { t } = useI18n();
  const { addRule, addAction, addMarker, addDirective } = useRule();
  const { expandNext } = useBuilderView();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  /**
   * Окно директивы: закрыто, ждёт закрытия меню, открыто.
   *
   * Ждать приходится потому, что фокус у меню и у окна общий. Закрываясь,
   * меню возвращает фокус кнопке, которой открывалось, — и делает это позже,
   * чем поле окна успевает фокус забрать. Вернувшийся наружу фокус ловушка
   * окна отбирает назад, но отдаёт уже не полю, а самому окну: окно
   * появлялось бы с полем, в которое не набрать, не щёлкнув по нему.
   */
  const [picking, setPicking] = useState<'closed' | 'awaiting' | 'open'>('closed');

  /** Пункт меню: закрыть меню и сделать то, что в нём выбрали. */
  const pick = (action: () => void) => () => {
    setAnchor(null);
    action();
  };

  return (
    <>
      <Button
        size="small"
        variant="contained"
        startIcon={<AddIcon />}
        endIcon={<ArrowDropDownIcon />}
        aria-haspopup="menu"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        {t('builder.add')}
      </Button>

      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        // Закрывшись, меню возвращает фокус кнопке — и только после этого
        // открывается окно.
        slotProps={{
          transition: {
            onExited: () => setPicking((state) => (state === 'awaiting' ? 'open' : state)),
          },
        }}
      >
        {/* Раскрытым появляется тот блок, которому есть что раскрывать:
            у правила и безусловного действия это их форма. */}
        <MenuItem
          onClick={pick(() => {
            expandNext();
            addRule();
          })}
        >
          {t('builder.addRule')}
        </MenuItem>
        <MenuItem
          onClick={pick(() => {
            expandNext();
            addAction();
          })}
        >
          {t('builder.addAction')}
        </MenuItem>
        <Divider />
        <MenuItem onClick={pick(addMarker)}>{t('builder.addMarker')}</MenuItem>
        <MenuItem onClick={pick(() => setPicking('awaiting'))}>
          {t('builder.addDirective')}
        </MenuItem>
      </Menu>

      <AddDirectiveDialog
        open={picking === 'open'}
        onClose={() => setPicking('closed')}
        onAdd={(line) => {
          // Раскрытой появится та директива, чья форма в строку не влезла:
          // у остальных раскрывать нечего, и просьба останется без дела.
          expandNext();
          addDirective(line);
        }}
      />
    </>
  );
}

/**
 * Органы управления активного режима — в одной строке с вкладками.
 *
 * Своей полосы ни та, ни другая панель не заработала: в них полдюжины кнопок,
 * а горизонталей над содержимым и без того хватает. Высоту строки всё равно
 * задают вкладки, поэтому панель встаёт следом за ними бесплатно.
 *
 * Строение у панелей одно, чтобы переключение режима не переставляло кнопки
 * под курсором: у правого края — главное действие режима, всегда в одном
 * виде, и вплотную перед ним то, что режим рассказывает о документе. Пустая
 * середина полосы лучше пустого правого края: обойма — подпись к главному
 * действию, а не самостоятельный житель строки, и стоять ей рядом с ним.
 * Различие проведено по вкладке снаружи, а не по контексту внутри: панель
 * обязана показывать то, что видно на экране, а не то, что последним
 * записали в состояние.
 */
export function EditorToolbar({ tab }: { tab: EditorTab }) {
  return (
    <Stack
      direction="row"
      sx={{
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: `${GROUP_GAP}px`,
        pl: 1,
        pr: 1.5,
      }}
    >
      {tab === 'visual' && <ExpansionControls />}
      {tab === 'text' ? <FormatButton /> : <AddButton />}
    </Stack>
  );
}
