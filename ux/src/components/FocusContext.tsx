import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Unfocus = () => void;

export type FocusContextValue = {
  register: (id: string, unfocus: Unfocus) => () => void;
  focus: (id: string) => void;
};

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusScope({ children }: { children: ReactNode }) {
  const fields = useRef(new Map<string, Unfocus>());
  const current = useRef<string | null>(null);

  const value = useMemo<FocusContextValue>(
    () => ({
      register(id, unfocus) {
        fields.current.set(id, unfocus);
        return () => {
          const mapped = fields.current.get(id);
          if (mapped === unfocus) {
            fields.current.delete(id);
          }
          if (current.current === id) {
            current.current = null;
          }
        };
      },
      focus(id) {
        if (current.current === id) {
          return;
        }
        current.current = id;
        for (const [other, unfocus] of fields.current) {
          if (other !== id) {
            unfocus();
          }
        }
      },
    }),
    [],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocusContext(): FocusContextValue | null {
  return useContext(FocusContext);
}

function blurInside(root: HTMLElement | null): void {
  if (root === null) {
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && root.contains(active)) {
    active.blur();
  }
}

export function useFocusField(): {
  focused: boolean;
  onFocus: () => void;
  /** Фокус ушёл сюда, но кольца не заслуживает: см. [FilterCell]. */
  release: () => void;
  setRoot: (node: HTMLElement | null) => void;
} {
  const ctx = useFocusContext();
  const id = useId();
  const root = useRef<HTMLElement | null>(null);
  const [focused, setFocused] = useState(false);
  const unfocus = useCallback(() => {
    setFocused(false);
    blurInside(root.current);
  }, []);

  useEffect(() => {
    if (ctx === null) {
      return;
    }
    return ctx.register(id, unfocus);
  }, [ctx, id, unfocus]);

  return {
    focused,
    setRoot: (node) => {
      root.current = node;
    },
    onFocus: () => {
      setFocused(true);
      ctx?.focus(id);
    },
    /*
     * Своё кольцо не зажигается, но соседские гасятся: фокус ушёл в это поле,
     * и висящее кольцо соседа означало бы курсор там, где его уже нет.
     * `focus(id)` при этом не трогает саму ячейку -- иначе она забрала бы
     * фокус у только что нажатой кнопки (`blurInside`).
     */
    release: () => {
      setFocused(false);
      ctx?.focus(id);
    },
  };
}
