import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { PreviewDraft, PreviewNode } from "../api.ts";
import { compileErrorText } from "../compile-errors.ts";
import { NginxEditor } from "../components/nginx-editor/NginxEditor.tsx";
import { useT } from "../i18n/index.ts";
import { usePreview } from "./usePreview.ts";

/**
 * Текст, который даёт открытая карточка, рядом с самой карточкой.
 *
 * Печатает его настоящий компилятор на контроллере -- тот же, что печатает
 * файл на `send`. В панели второго компилятора нет намеренно: он был, успел
 * разойтись с оригиналом на разборе `waf_capture`, и оператор видел превью,
 * которое никуда не уезжало.
 *
 * Здесь же -- то, что нашла проверка дерева (`validateNginxExport`):
 * неизвестный инспектор, ssl без сертификата, общий порт без `server_name`.
 * Раньше это всплывало только после `send`, то есть уже на флоте.
 *
 * Подписи над окном нет намеренно: вкладка называется «Просмотр», и заголовок
 * повторял её слово в слово, а рядом стоял чип «живой» -- про то же самое.
 * Окно занимает вкладку целиком, до низа страницы; о том, что текст сейчас
 * пересчитывают, говорит полоса на его верхней рамке.
 */
export function PreviewDock({
  scope,
  draft,
  node,
  enabled = true,
}: {
  scope: string | null;
  draft: PreviewDraft;
  node?: PreviewNode;
  enabled?: boolean;
}) {
  const t = useT();
  const { result, error, pending } = usePreview(scope, draft, node, enabled);

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      {error !== null && <Alert severity="error">{error}</Alert>}

      {result !== null && result.errors.length > 0 && (
        <Alert severity="warning">
          <Stack spacing={0.25}>
            {result.errors.map((row, i) => (
              <Typography key={i} variant="body2">
                {compileErrorText(t, row)}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {/*
        Предупреждения ниже ошибок и тише их: конфиг с ними уедет, и держать
        оператора они не должны -- но и молчать о мёртвой настройке нельзя,
        иначе она обнаружится строкой в логе на краю, если вообще обнаружится.
      */}
      {result !== null && (result.warnings ?? []).length > 0 && (
        <Alert severity="info">
          <Stack spacing={0.25}>
            {(result.warnings ?? []).map((row, i) => (
              <Typography key={i} variant="body2">
                {row.message}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {/*
        Полоса пересчёта лежит на верхней рамке окна, а не строкой над ним:
        строка занимала бы место постоянно, а окно от её появления прыгало бы
        вниз на свою же высоту.
      */}
      <Box sx={{ position: "relative", minWidth: 0 }}>
        {pending && (
          <LinearProgress
            sx={{
              position: "absolute",
              top: 1,
              left: 1,
              right: 1,
              height: 2,
              borderRadius: 1,
              zIndex: 1,
            }}
          />
        )}
        <NginxEditor label="" readOnly fill minRows={10} value={result?.text ?? ""} />
      </Box>
    </Stack>
  );
}
