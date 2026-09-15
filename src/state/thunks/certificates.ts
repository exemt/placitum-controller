import { createAsyncThunk } from "@reduxjs/toolkit";

import { isRejectPayload, pgWriteReject } from "../../http-error.ts";
import type { Certificate, CertificateKind } from "../../model/listen.ts";
import type { BoundCertificate } from "../../model/server.ts";
import type { CertificateCrlUpdate, CertificateInsert } from "../../certificates.ts";
import type { ThunkExtra } from "../extra.ts";

type ThunkCfg = { extra: ThunkExtra; rejectValue: { status: number; error: string } };

export const createCertificate = createAsyncThunk<
  Certificate,
  CertificateInsert,
  ThunkCfg
>("certificates/create", async (input, { extra, rejectWithValue }) => {
  try {
    return await extra.certificates.insert(input);
  } catch (err) {
    const mapped = pgWriteReject(err, "certificate");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const deleteCertificate = createAsyncThunk<
  Certificate,
  { id: string },
  ThunkCfg
>("certificates/delete", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.certificates.delete(id);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "certificate");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const setCertificateCrl = createAsyncThunk<
  Certificate,
  { id: string; crl: CertificateCrlUpdate },
  ThunkCfg
>("certificates/setCrl", async ({ id, crl }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.certificates.setCrl(id, crl);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "certificate");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const clearCertificateCrl = createAsyncThunk<
  Certificate,
  { id: string },
  ThunkCfg
>("certificates/clearCrl", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.certificates.clearCrl(id);

    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }

    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "certificate");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const bindCertificate = createAsyncThunk<
  BoundCertificate,
  { serverId: string; certificateId: string; kind: CertificateKind },
  ThunkCfg
>("certificates/bind", async (input, { extra, rejectWithValue }) => {
  try {
    return await extra.certificates.bind(input);
  } catch (err) {
    if (isRejectPayload(err)) {
      return rejectWithValue(err);
    }
    const mapped = pgWriteReject(err, "certificate");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});

export const unbindCertificate = createAsyncThunk<
  BoundCertificate,
  { id: string },
  ThunkCfg
>("certificates/unbind", async ({ id }, { extra, rejectWithValue }) => {
  try {
    const row = await extra.certificates.unbind(id);
    if (row === null) {
      return rejectWithValue({ status: 404, error: "not_found" });
    }
    return row;
  } catch (err) {
    const mapped = pgWriteReject(err, "certificate");
    return mapped === undefined ? Promise.reject(err) : rejectWithValue(mapped);
  }
});
