import type { ModsecPolicy } from "../modsec-policy-doc.ts";

import type { Uuid } from "./id.ts";

/**
 * Файл SecLang -- мини-набор в каталоге пространства. Не принадлежит профилю:
 * один текст можно включить в несколько профилей.
 */
export interface RuleFile {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  textRaw: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleFileMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Профиль правил для инспектора. Имя уходит в `waf_inspector … profile=`.
 * Состав -- упорядоченный список файлов; порядок задаёт position, не имя.
 */
export interface RuleSet {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  files: RuleSetMember[];
  /** Файлы данных для операторов `*FromFile`; порядок -- порядок объявления. */
  data: RuleSetDataFile[];
  /**
   * Политика профиля: правила приёма чужих просьб и инициаторы по исходу --
   * две стороны канала действий. Едет к инспектору файлом policy.yaml своим
   * слотом в паке.
   */
  policy: ModsecPolicy;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleSetMember {
  fileId: Uuid;
  name: string;
}

/**
 * Файл данных профиля: набор вида `content` из раздела «Данные -> Файлы»,
 * который операторы @pmFromFile / @ipMatchFromFile читают рядом с правилами.
 * `file` -- имя на диске инспектора: имя набора плюс расширение по типу.
 */
export interface RuleSetDataFile {
  datasetId: Uuid;
  name: string;
  file: string;
}

export interface RuleSetMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  files: number;
  createdAt: Date;
  updatedAt: Date;
}
