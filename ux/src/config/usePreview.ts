import { useEffect, useRef, useState } from "react";

import {
  fetchCatalog,
  fetchHttpInheritance,
  fetchLocationInheritance,
  fetchServerInheritance,
  previewConfig,
  type CatalogBundle,
  type InheritedField,
  type PreviewDraft,
  type PreviewNode,
  type PreviewResult,
} from "../api.ts";
import { chainOf, type ParentChain } from "./inherit.ts";

/**
 * Родительская цепочка карточки.
 *
 * Считает её контроллер (`src/inheritance.ts`) той же функцией, которой
 * пользуется компилятор. Маршрут существовал с самого начала и не вызывался
 * ни разу -- из-за этого пустое поле в форме и означало сразу три разные вещи.
 */
export function useInheritance(
  scope: string | null,
  target:
    | { level: "http" }
    | { level: "server" }
    /** Сохранённый путь: цепочка считается по нему самому. */
    | { level: "location"; uuid: string }
    /** Ещё не сохранённый путь: родитель -- его будущий сервер. */
    | { level: "location"; serverUuid: string },
): { waf: ParentChain; nginx: ParentChain; loading: boolean } {
  const [fields, setFields] = useState<InheritedField[] | null>(null);
  const [loading, setLoading] = useState(false);
  const level = target.level;
  const uuid = "uuid" in target ? target.uuid : "";
  const serverUuid = "serverUuid" in target ? target.serverUuid : "";

  useEffect(() => {
    if (scope === null) {
      setFields(null);
      return;
    }
    // Пространство наследует не от кого: сравнивать приходится с умолчанием
    // модуля, и его подставляет `resolve`, а не контроллер.
    if (level === "http") {
      setFields([]);
      return;
    }

    // Сервер наследует ровно из http {}. `…/servers/:uuid/inheritance` сюда не
    // годится: он отвечает на другой вопрос -- что получит путь на этом
    // сервере, -- и потому включает собственные ключи сервера как
    // родительские. Карточка тогда показывает «вместо» напротив значения,
    // которое сама же и задаёт.
    let request;
    if (level === "server") {
      request = fetchHttpInheritance(scope);
    } else if (uuid !== "") {
      request = fetchLocationInheritance(scope, uuid);
    } else if (serverUuid !== "") {
      // Пути ещё нет в базе: родитель -- сервер, в котором его создают.
      request = fetchServerInheritance(scope, serverUuid);
    } else {
      setFields([]);
      return;
    }

    let alive = true;
    setLoading(true);

    void request
      .then((row) => {
        if (alive) {
          setFields(row.inherited);
        }
      })
      .catch(() => {
        if (alive) {
          setFields(null);
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [scope, level, uuid, serverUuid]);

  return {
    waf: chainOf(fields, "waf"),
    nginx: chainOf(fields, "nginx"),
    loading,
  };
}

/** Каталоги для селектов. Один запрос на карточку, ответ переживает правки. */
export function useCatalogBundle(scope: string | null): CatalogBundle | null {
  const [bundle, setBundle] = useState<CatalogBundle | null>(null);

  useEffect(() => {
    if (scope === null) {
      setBundle(null);
      return;
    }
    let alive = true;
    void fetchCatalog(scope)
      .then((row) => {
        if (alive) {
          setBundle(row);
        }
      })
      .catch(() => {
        if (alive) {
          setBundle(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [scope]);

  return bundle;
}

const DEBOUNCE_MS = 350;

/**
 * Текст блока, который даёт открытая карточка, настоящим компилятором.
 *
 * Запрос отложен: печатать конфиг на каждое нажатие клавиши незачем, а вот
 * видеть результат через треть секунды после остановки -- ровно то, ради чего
 * превью и заводится. Ответы приходят не в порядке отправки, поэтому поздний
 * ответ на ранний запрос отбрасывается по счётчику.
 */
export function usePreview(
  scope: string | null,
  draft: PreviewDraft,
  node: PreviewNode | undefined,
  enabled: boolean,
): { result: PreviewResult | null; error: string | null; pending: boolean } {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const seq = useRef(0);
  const body = JSON.stringify({ draft, node });

  useEffect(() => {
    if (scope === null || !enabled) {
      return;
    }
    const ticket = seq.current + 1;
    seq.current = ticket;
    setPending(true);

    const timer = setTimeout(() => {
      const parsed = JSON.parse(body) as { draft: PreviewDraft; node?: PreviewNode };
      void previewConfig(scope, parsed.draft, parsed.node)
        .then((row) => {
          if (seq.current !== ticket) return;
          setResult(row);
          setError(null);
        })
        .catch((err: unknown) => {
          if (seq.current !== ticket) return;
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (seq.current === ticket) {
            setPending(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [scope, body, enabled]);

  return { result, error, pending };
}
