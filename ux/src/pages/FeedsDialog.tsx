// The sets of the license server: what can be downloaded into this space,
// what already is, and what has a newer version. One button per row does
// the one thing the row allows.
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import type { FeedView } from "../api.ts";
import { useT } from "../i18n/index.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { installFeedThunk, loadFeeds, updateFeedThunk } from "../store/slices/pages/datasets.ts";

function titleOf(feed: FeedView, locale: string): string {
  return locale === "ru" && feed.title_ru !== "" ? feed.title_ru : feed.title_en;
}

function descOf(feed: FeedView, locale: string): string {
  return locale === "ru" && feed.desc_ru !== "" ? feed.desc_ru : feed.desc_en;
}

export function FeedsDialog({ open, scope, onClose }: { open: boolean; scope: string; onClose: () => void }) {
  const t = useT();
  const dispatch = useAppDispatch();
  const locale = useAppSelector((s) => s.ui.locale);
  const feeds = useAppSelector((s) => s.pages.datasets.feeds);
  const loading = useAppSelector((s) => s.pages.datasets.feedsLoading);
  const busy = useAppSelector((s) => s.pages.datasets.feedsBusy);
  const error = useAppSelector((s) => s.pages.datasets.feedsError);
  const rows = feeds?.feeds ?? [];
  const updates = rows.filter((f) => f.update);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Typography component="span" variant="h6">
          {t("datasets.feeds.title")}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          variant="outlined"
          disabled={loading || busy !== null}
          onClick={() => void dispatch(loadFeeds({ scope, force: true }))}
        >
          {t("datasets.feeds.check")}
        </Button>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            {t("datasets.feeds.hint")}
            {feeds?.checked_at != null && ` ${t("datasets.feeds.checkedAt", { at: new Date(feeds.checked_at).toLocaleString(locale) })}`}
          </Typography>
          {error !== null && <Alert severity="error">{t(`datasets.feeds.errors.${error}`) === `datasets.feeds.errors.${error}` ? error : t(`datasets.feeds.errors.${error}`)}</Alert>}
          {feeds?.error != null && (
            <Alert severity="warning">
              {t(`datasets.feeds.errors.${feeds.error}`) === `datasets.feeds.errors.${feeds.error}` ? feeds.error : t(`datasets.feeds.errors.${feeds.error}`)}
            </Alert>
          )}
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("datasets.feeds.empty")}
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("datasets.feeds.set")}</TableCell>
                    <TableCell>{t("datasets.type")}</TableCell>
                    <TableCell align="right">{t("datasets.feeds.entries")}</TableCell>
                    <TableCell>{t("datasets.feeds.version")}</TableCell>
                    <TableCell>{t("datasets.feeds.state")}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((feed) => (
                    <TableRow key={feed.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {titleOf(feed, locale)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="div">
                          <code>{feed.id}</code>
                          {descOf(feed, locale) !== "" && ` · ${descOf(feed, locale)}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={t(`datasets.types.${feed.type}`)} />
                      </TableCell>
                      <TableCell align="right">{feed.count}</TableCell>
                      <TableCell>
                        {feed.installed === null
                          ? feed.version
                          : feed.update
                            ? `${feed.installed.version} → ${feed.version}`
                            : feed.version}
                      </TableCell>
                      <TableCell>
                        {feed.installed === null ? (
                          <Chip size="small" variant="outlined" label={t("datasets.feeds.notInstalled")} />
                        ) : feed.update ? (
                          <Chip size="small" color="warning" label={t("datasets.feeds.updateAvailable")} />
                        ) : (
                          <Chip
                            size="small"
                            color="success"
                            variant="outlined"
                            label={t("datasets.feeds.installedAs", { name: feed.installed.name })}
                          />
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {feed.installed === null ? (
                          <Button
                            size="small"
                            variant="contained"
                            disabled={busy !== null}
                            onClick={() => void dispatch(installFeedThunk({ scope, id: feed.id }))}
                          >
                            {busy === feed.id ? t("datasets.feeds.working") : t("datasets.feeds.download")}
                          </Button>
                        ) : feed.update ? (
                          <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            disabled={busy !== null}
                            onClick={() => void dispatch(updateFeedThunk({ scope, id: feed.id }))}
                          >
                            {busy === feed.id ? t("datasets.feeds.working") : t("datasets.feeds.update")}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {updates.length > 0 && (
          <Button
            size="small"
            variant="contained"
            color="warning"
            disabled={busy !== null}
            onClick={() => {
              void (async () => {
                for (const feed of updates) {
                  await dispatch(updateFeedThunk({ scope, id: feed.id }));
                }
              })();
            }}
          >
            {t("datasets.feeds.updateAll", { count: updates.length })}
          </Button>
        )}
        <Button size="small" variant="outlined" onClick={onClose}>
          {t("common.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
