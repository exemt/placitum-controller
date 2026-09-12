/*
 * Кит карточки флота. Одна точка входа: карточка агента, хранилища,
 * инспектора и сервиса собирается из этих кусков и ничего своего не рисует.
 */

export { Block, CardBody } from "./CardBody.tsx";
export { ErrorsBlock } from "./Errors.tsx";
export { MetaChips, meta, type MetaItem } from "./MetaChips.tsx";
export { Stat, StatStrip, type StatProps, type Tone } from "./Stat.tsx";
export {
  CellBar,
  CellChip,
  CellMono,
  CellName,
  CellStatus,
  CellValue,
  FleetTable,
  hostColumns,
  instanceColumn,
  memberColumns,
  seenColumn,
  statusColumn,
  type FleetColumn,
} from "./FleetTable.tsx";
export {
  CODE_PARTS,
  ERR_COLOR,
  OK_COLOR,
  WAF_PARTS,
  busStat,
  capacityStat,
  channelLabel,
  countStat,
  formatUptime,
  hostStats,
  trafficStats,
  useFlowStats,
  verdictStats,
} from "./stats.ts";
