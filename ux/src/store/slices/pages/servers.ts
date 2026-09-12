import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  bindServerCertificate,
  bindServerPort,
  createServer,
  deleteServer,
  fetchCertificates,
  fetchPorts,
  fetchServerCertificates,
  fetchServerListens,
  fetchServers,
  unbindServerCertificate,
  unbindServerPort,
  updateServer,
  updateServerListen,
  type Certificate,
  type CertificateKind,
  type ListenPort,
  type RouteServer,
  type ServerCertificateBind,
  type ServerInput,
  type ServerListen,
} from "../../../api.ts";

interface ServersState {
  rows: RouteServer[];
  ports: ListenPort[];
  listens: ServerListen[];
  certificates: Certificate[];
  certBinds: ServerCertificateBind[];
  panelId: string | null | undefined;
  loading: boolean;
  error: string | null;
}

const initialState: ServersState = {
  rows: [],
  ports: [],
  listens: [],
  certificates: [],
  certBinds: [],
  panelId: undefined,
  loading: true,
  error: null,
};

export const loadServers = createAsyncThunk(
  "pages/servers/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return {
        rows: [] as RouteServer[],
        ports: [] as ListenPort[],
        certificates: [] as Certificate[],
      };
    }
    try {
      const [rows, ports, certificates] = await Promise.all([
        fetchServers(scope),
        fetchPorts(scope),
        fetchCertificates(scope),
      ]);
      return { rows, ports, certificates };
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadServerListens = createAsyncThunk(
  "pages/servers/listens",
  async (input: { scope: string; serverId: string }, { rejectWithValue }) => {
    try {
      return await fetchServerListens(input.scope, input.serverId);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const bindPortThunk = createAsyncThunk(
  "pages/servers/bind",
  async (
    input: {
      scope: string;
      serverId: string;
      port_id: string;
      default_server: boolean;
    },
    { rejectWithValue },
  ) => {
    try {
      return await bindServerPort(input.scope, input.serverId, {
        port_id: input.port_id,
        default_server: input.default_server,
      });
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const updateListenThunk = createAsyncThunk(
  "pages/servers/listen",
  async (
    input: {
      scope: string;
      serverId: string;
      bindId: string;
      default_server: boolean;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateServerListen(
        input.scope,
        input.serverId,
        input.bindId,
        { default_server: input.default_server },
      );
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadServerCertificates = createAsyncThunk(
  "pages/servers/certs",
  async (input: { scope: string; serverId: string }, { rejectWithValue }) => {
    try {
      return await fetchServerCertificates(input.scope, input.serverId);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const bindCertificateThunk = createAsyncThunk(
  "pages/servers/bindCert",
  async (
    input: {
      scope: string;
      serverId: string;
      certificate_id: string;
      kind: CertificateKind;
    },
    { rejectWithValue },
  ) => {
    try {
      return await bindServerCertificate(input.scope, input.serverId, {
        certificate_id: input.certificate_id,
        kind: input.kind,
      });
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const unbindCertificateThunk = createAsyncThunk(
  "pages/servers/unbindCert",
  async (
    input: { scope: string; serverId: string; bindId: string },
    { rejectWithValue },
  ) => {
    try {
      return await unbindServerCertificate(
        input.scope,
        input.serverId,
        input.bindId,
      );
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const unbindPortThunk = createAsyncThunk(
  "pages/servers/unbind",
  async (
    input: { scope: string; serverId: string; bindId: string },
    { rejectWithValue },
  ) => {
    try {
      return await unbindServerPort(input.scope, input.serverId, input.bindId);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export interface ServerBindDraft {
  port_id: string;
  default_server: boolean;
  bind_id?: string | null;
}

export interface ServerCertDraft {
  certificate_id: string;
  kind: CertificateKind;
  bind_id?: string | null;
}

/**
 * Сохранение карточки сервера целиком: поля и привязки одним действием.
 *
 * Привязки существующего сервера раньше писались в базу прямо из таблицы --
 * галочка `default_server`, отвязка порта, отвязка сертификата уезжали мимо
 * кнопки «Сохранить». Оператор менял конфигурацию контура, думая, что ещё
 * редактирует карточку, а «Отмена» ничего не отменяла. Теперь таблица правит
 * черновик, а сюда приходит пара «что хотим» и «что есть», и разница
 * превращается в bind/unbind/update.
 */
export const saveServerThunk = createAsyncThunk(
  "pages/servers/save",
  async (
    input: {
      scope: string;
      id: string | null;
      body: ServerInput;
      binds?: ServerBindDraft[];
      certs?: ServerCertDraft[];
      currentBinds?: ServerListen[];
      currentCerts?: ServerCertificateBind[];
    },
    { rejectWithValue },
  ) => {
    try {
      const row =
        input.id === null
          ? await createServer(input.scope, input.body)
          : await updateServer(input.scope, input.id, input.body);

      const binds = input.binds ?? [];
      const certs = input.certs ?? [];
      const currentBinds = input.currentBinds ?? [];
      const currentCerts = input.currentCerts ?? [];

      const keptBinds = new Set(
        binds.map((bind) => bind.bind_id).filter((id): id is string => Boolean(id)),
      );
      const keptCerts = new Set(
        certs.map((cert) => cert.bind_id).filter((id): id is string => Boolean(id)),
      );

      /*
       * Сначала снять, потом привязать: `default_server` на порту занимает
       * один сервер, и перестановка «сняли у одного -- дали другому» в другом
       * порядке упёрлась бы в занятость.
       */
      for (const bind of currentBinds) {
        if (!keptBinds.has(bind.uuid)) {
          await unbindServerPort(input.scope, row.uuid, bind.uuid);
        }
      }
      for (const bind of currentCerts) {
        if (!keptCerts.has(bind.uuid)) {
          await unbindServerCertificate(input.scope, row.uuid, bind.uuid);
        }
      }

      let touchedPorts = currentBinds.length !== binds.length;

      for (const bind of binds) {
        if (bind.bind_id === undefined || bind.bind_id === null) {
          await bindServerPort(input.scope, row.uuid, {
            port_id: bind.port_id,
            default_server: bind.default_server,
          });
          touchedPorts = true;
          continue;
        }

        const was = currentBinds.find((item) => item.uuid === bind.bind_id);
        if (was !== undefined && was.default_server !== bind.default_server) {
          await updateServerListen(input.scope, row.uuid, bind.bind_id, {
            default_server: bind.default_server,
          });
          touchedPorts = true;
        }
      }

      for (const cert of certs) {
        if (cert.bind_id === undefined || cert.bind_id === null) {
          await bindServerCertificate(input.scope, row.uuid, {
            certificate_id: cert.certificate_id,
            kind: cert.kind,
          });
        }
      }

      /*
       * Привязки уезжают после самого сервера, поэтому в его ответе их ещё
       * нет: строка таблицы показывала бы порты, которые были до сохранения.
       * Перечитываем их, а не собираем из черновика: bind_id новых привязок
       * знает только контроллер, и без него строка не пережила бы правку.
       */
      const listens = touchedPorts
        ? await fetchServerListens(input.scope, row.uuid)
        : row.listens;

      return {
        row: { ...row, listens, listen_count: listens.length },
        // Каталог портов показывает, кто занял `default_server`: после
        // перестановки его надо перечитать, иначе чужая строка врёт.
        ports: touchedPorts ? await fetchPorts(input.scope) : undefined,
      };
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const deleteServerThunk = createAsyncThunk(
  "pages/servers/delete",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      return await deleteServer(input.scope, input.id);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const serversPageSlice = createSlice({
  name: "pages/servers",
  initialState,
  reducers: {
    openPanel(state, action: PayloadAction<string | null>) {
      state.panelId = action.payload;
    },
    closePanel(state) {
      state.panelId = undefined;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadServers.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadServers.fulfilled, (state, action) => {
      state.rows = action.payload.rows;
      state.ports = action.payload.ports;
      state.certificates = action.payload.certificates;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadServers.rejected, (state, action) => {
      state.rows = [];
      state.ports = [];
      state.certificates = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadServerListens.pending, (state) => {
      state.listens = [];
    });
    builder.addCase(loadServerListens.fulfilled, (state, action) => {
      state.listens = action.payload;
    });
    builder.addCase(loadServerCertificates.pending, (state) => {
      state.certBinds = [];
    });
    builder.addCase(loadServerCertificates.fulfilled, (state, action) => {
      state.certBinds = action.payload;
    });
    builder.addCase(bindCertificateThunk.fulfilled, (state, action) => {
      state.certBinds = [...state.certBinds, action.payload];
      state.error = null;
    });
    builder.addCase(bindCertificateThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(unbindCertificateThunk.fulfilled, (state, action) => {
      state.certBinds = state.certBinds.filter(
        (row) => row.uuid !== action.payload.uuid,
      );
      state.error = null;
    });
    builder.addCase(bindPortThunk.fulfilled, (state, action) => {
      state.listens = [...state.listens, action.payload];
      const server = state.rows.find((row) => row.uuid === action.payload.server_id);
      if (server !== undefined) {
        server.listen_count += 1;
      }
      if (action.payload.default_server) {
        state.ports = state.ports.map((row) =>
          row.uuid === action.payload.port_id
            ? { ...row, default_server_id: action.payload.server_id }
            : row,
        );
      }
      state.error = null;
    });
    builder.addCase(bindPortThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(updateListenThunk.fulfilled, (state, action) => {
      state.listens = state.listens.map((row) =>
        row.uuid === action.payload.uuid ? action.payload : row,
      );
      state.ports = state.ports.map((row) => {
        if (row.uuid !== action.payload.port_id) {
          return row;
        }
        if (action.payload.default_server) {
          return { ...row, default_server_id: action.payload.server_id };
        }
        if (row.default_server_id === action.payload.server_id) {
          return { ...row, default_server_id: null };
        }
        return row;
      });
      state.error = null;
    });
    builder.addCase(unbindPortThunk.fulfilled, (state, action) => {
      state.listens = state.listens.filter((row) => row.uuid !== action.payload.uuid);
      const server = state.rows.find((row) => row.uuid === action.payload.server_id);
      if (server !== undefined && server.listen_count > 0) {
        server.listen_count -= 1;
      }
      if (
        action.payload.default_server &&
        state.ports.some(
          (row) =>
            row.uuid === action.payload.port_id &&
            row.default_server_id === action.payload.server_id,
        )
      ) {
        state.ports = state.ports.map((row) =>
          row.uuid === action.payload.port_id
            ? { ...row, default_server_id: null }
            : row,
        );
      }
      state.error = null;
    });
    builder.addCase(saveServerThunk.fulfilled, (state, action) => {
      const next = action.payload.row;
      if (action.payload.ports !== undefined) {
        state.ports = action.payload.ports;
      }
      const index = state.rows.findIndex((row) => row.uuid === next.uuid);
      if (index === -1) {
        state.rows = [...state.rows, next].sort((a, b) => a.name.localeCompare(b.name));
      } else {
        state.rows[index] = next;
      }
      state.panelId = undefined;
      state.error = null;
    });
    builder.addCase(saveServerThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(deleteServerThunk.fulfilled, (state, action) => {
      state.rows = state.rows.filter((row) => row.uuid !== action.payload.uuid);
      state.panelId = undefined;
      state.error = null;
    });
    builder.addCase(deleteServerThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { openPanel, closePanel } = serversPageSlice.actions;
export default serversPageSlice.reducer;
