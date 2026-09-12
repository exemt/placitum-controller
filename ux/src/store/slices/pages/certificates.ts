import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import {
  createCertificateRecord,
  createStoreObject,
  deleteCertificateCrl,
  deleteCertificateRecord,
  fetchCertificates,
  fetchCrypto,
  setCertificateCrl,
  type Certificate,
  type CertificateType,
  type ContourCrypto,
} from "../../../api.ts";
import {
  checkFingerprint,
  importContourPublicKey,
  sealPemToBase64,
  type FingerprintCheck,
} from "../../../crypto/seal.ts";

interface CryptoStatus {
  crypto: ContourCrypto;
  check: FingerprintCheck;
}

interface CertificatesState {
  rows: Certificate[];
  loading: boolean;
  error: string | null;
  cryptoStatus: CryptoStatus | null;
  cryptoError: string | null;
  panelOpen: boolean;
  /** uuid корня, которому грузят CRL; null -- панель закрыта. */
  crlPanelFor: string | null;
  submitting: boolean;
  submitError: string | null;
}

const initialState: CertificatesState = {
  rows: [],
  loading: true,
  error: null,
  cryptoStatus: null,
  cryptoError: null,
  panelOpen: false,
  crlPanelFor: null,
  submitting: false,
  submitError: null,
};

export const loadCertificates = createAsyncThunk(
  "pages/certificates/load",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return [] as Certificate[];
    }
    try {
      return await fetchCertificates(scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const loadCryptoStatus = createAsyncThunk(
  "pages/certificates/cryptoStatus",
  async (scope: string | null, { rejectWithValue }) => {
    if (scope === null) {
      return null;
    }
    try {
      const crypto = await fetchCrypto(scope);
      return { crypto, check: checkFingerprint(crypto.fingerprint) };
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/**
 * Полный аплоад: браузер сам шифрует PEM (docs/crypto-service.md), затем
 * кладёт ciphertext в store_objects и только потом привязывает их в
 * certificates. Метаданные (SAN, срок, fingerprint) в ответе -- от
 * crypto-сервиса, этот thunk их не считает.
 */
export const uploadCertificateThunk = createAsyncThunk(
  "pages/certificates/upload",
  async (
    input: {
      scope: string;
      name: string;
      type: CertificateType;
      certPem: string;
      /** Только для `type: "server"`; у корня mTLS ключа нет. */
      keyPem?: string;
      chainPem?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const crypto = await fetchCrypto(input.scope);
      if (checkFingerprint(crypto.fingerprint) === "mismatch") {
        return rejectWithValue("fingerprint_mismatch");
      }

      const publicKey = await importContourPublicKey(crypto.public_key);

      // client_ca лежит в store как `ca`, а не `certificate`: тип объекта
      // описывает, что внутри, и по нему видно, что приватной половины у
      // него нет и не ожидается.
      const certObject = await createStoreObject(input.scope, {
        type: input.type === "client_ca" ? "ca" : "certificate",
        blob: await sealPemToBase64(input.certPem, publicKey),
      });
      const keyObject =
        input.keyPem === undefined || input.keyPem === ""
          ? undefined
          : await createStoreObject(input.scope, {
              type: "private_key",
              blob: await sealPemToBase64(input.keyPem, publicKey),
            });
      const chainObject =
        input.chainPem === undefined
          ? undefined
          : await createStoreObject(input.scope, {
              type: "chain",
              blob: await sealPemToBase64(input.chainPem, publicKey),
            });

      await createCertificateRecord(input.scope, {
        name: input.name,
        type: input.type,
        cert_store_id: certObject.uuid,
        key_store_id: keyObject?.uuid,
        chain_store_id: chainObject?.uuid,
      });

      return await fetchCertificates(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

/**
 * Загрузка списка отзыва к уже существующему корню mTLS. Тот же конверт,
 * что у сертификата: браузер шифрует, контроллер видит только ciphertext,
 * разбирает crypto-сервис.
 */
export const uploadCrlThunk = createAsyncThunk(
  "pages/certificates/uploadCrl",
  async (
    input: { scope: string; id: string; crlPem: string },
    { rejectWithValue },
  ) => {
    try {
      const crypto = await fetchCrypto(input.scope);
      if (checkFingerprint(crypto.fingerprint) === "mismatch") {
        return rejectWithValue("fingerprint_mismatch");
      }

      const publicKey = await importContourPublicKey(crypto.public_key);

      const crlObject = await createStoreObject(input.scope, {
        type: "crl",
        blob: await sealPemToBase64(input.crlPem, publicKey),
      });

      await setCertificateCrl(input.scope, input.id, crlObject.uuid);

      return await fetchCertificates(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const removeCrlThunk = createAsyncThunk(
  "pages/certificates/removeCrl",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      await deleteCertificateCrl(input.scope, input.id);
      return await fetchCertificates(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

export const deleteCertificateThunk = createAsyncThunk(
  "pages/certificates/delete",
  async (input: { scope: string; id: string }, { rejectWithValue }) => {
    try {
      await deleteCertificateRecord(input.scope, input.id);
      return await fetchCertificates(input.scope);
    } catch (err: unknown) {
      return rejectWithValue(String(err));
    }
  },
);

const certificatesSlice = createSlice({
  name: "pages/certificates",
  initialState,
  reducers: {
    openPanel(state) {
      state.panelOpen = true;
      state.submitError = null;
    },
    closePanel(state) {
      state.panelOpen = false;
      state.submitError = null;
    },
    openCrlPanel(state, action: { payload: string }) {
      state.crlPanelFor = action.payload;
      state.submitError = null;
    },
    closeCrlPanel(state) {
      state.crlPanelFor = null;
      state.submitError = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadCertificates.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(loadCertificates.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(loadCertificates.rejected, (state, action) => {
      state.rows = [];
      state.loading = false;
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(loadCryptoStatus.fulfilled, (state, action) => {
      state.cryptoStatus = action.payload;
      state.cryptoError = null;
    });
    builder.addCase(loadCryptoStatus.rejected, (state, action) => {
      state.cryptoStatus = null;
      state.cryptoError =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(uploadCertificateThunk.pending, (state) => {
      state.submitting = true;
      state.submitError = null;
    });
    builder.addCase(uploadCertificateThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.submitting = false;
      state.panelOpen = false;
    });
    builder.addCase(uploadCertificateThunk.rejected, (state, action) => {
      state.submitting = false;
      state.submitError =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(uploadCrlThunk.pending, (state) => {
      state.submitting = true;
      state.submitError = null;
    });
    builder.addCase(uploadCrlThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
      state.submitting = false;
      state.crlPanelFor = null;
    });
    builder.addCase(uploadCrlThunk.rejected, (state, action) => {
      state.submitting = false;
      state.submitError =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(removeCrlThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
    });
    builder.addCase(removeCrlThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
    builder.addCase(deleteCertificateThunk.fulfilled, (state, action) => {
      state.rows = action.payload;
    });
    builder.addCase(deleteCertificateThunk.rejected, (state, action) => {
      state.error =
        typeof action.payload === "string" ? action.payload : String(action.error);
    });
  },
});

export const { openPanel, closePanel, openCrlPanel, closeCrlPanel } =
  certificatesSlice.actions;
export default certificatesSlice.reducer;
