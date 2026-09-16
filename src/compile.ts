import { join } from "node:path";

import { compileIp, type IpCompileResult } from "./compile/ip.ts";
import {
  IP_BLOB_TTL_SEC,
  IP_PROCESS,
  ipBlobItems,
  packIp,
  pointerOf,
  type IpPackPointer,
  type IpPackTook,
} from "./compile/ip-pack.ts";
import type {
  InspectorSettings,
  InspectorSettingsSource,
} from "./inspector-settings.ts";
import { MODSEC_PROCESS } from "./rules-manifest.ts";
import { BLOB_PREFIX, BLOB_TTL_SEC, type RulesPackPointer } from "./compile/pointer.ts";
import { blobKey, packSource } from "./compile/pack.ts";
import type { CompileRedis } from "./compile/redis.ts";
import { compileRules, type RuleCompileResult } from "./compile/rules.ts";
import type { DesiredStore } from "./desired.ts";
import type { IpProfileRepo } from "./ip-profiles.ts";
import type { RuleFileRepo } from "./rule-files.ts";
import type { RuleSetRepo } from "./rule-sets.ts";
import {
  packNginx,
  pointerOf as nginxPointerOf,
  blobKey as nginxBlobKey,
  type NginxPackPointer,
  type NginxPageFile,
} from "./compile/nginx-pack.ts";
import {
  compileNginx,
  inspectorProfilesOf,
  NginxCompileError,
  certificateStoreIds,
  validateNginxExport,
  type NginxExport,
  type NginxCompileResult,
} from "./compile/nginx.ts";
import { WafCompileError } from "./compile/nginx-emit.ts";
import type { StoreRepo } from "./store.ts";

export interface RuleCompilePublished extends RuleCompileResult {
  sha256: string;
  pointer: RulesPackPointer | null;
}

export interface BlobItems {
  sha256: string;
  items: { key: string; value: Buffer }[];
}

function blobItemsOf(
  blobs: Map<string, Buffer>,
  keyOf: (hash: string) => string,
): { key: string; value: Buffer }[] {
  return [...blobs.entries()].map(([hash, value]) => ({ key: keyOf(hash), value }));
}

export interface RulesPlan {
  sha256: string;
  profiles: string[];
  source: Awaited<ReturnType<RuleSetRepo["exportCompile"]>>;
  settings: InspectorSettings;
  packed: ReturnType<typeof packSource>;
}

export class RulesCompiler {
  private readonly root: string;
  private readonly files: RuleFileRepo;
  private readonly sets: RuleSetRepo;
  private readonly settingsOf: InspectorSettingsSource;
  private readonly redis: CompileRedis | null;
  private readonly desired: DesiredStore | null;

  constructor(
    root: string,
    files: RuleFileRepo,
    sets: RuleSetRepo,
    settingsOf: InspectorSettingsSource,
    redis: CompileRedis | null = null,
    desired: DesiredStore | null = null,
  ) {
    this.root = root;
    this.files = files;
    this.sets = sets;
    this.settingsOf = settingsOf;
    this.redis = redis;
    this.desired = desired;
  }

  async plan(httpSpaceId: string): Promise<RulesPlan> {
    const source = await this.sets.exportCompile(httpSpaceId, this.files);
    const settings = await this.settingsOf(httpSpaceId, MODSEC_PROCESS);
    const packed = packSource(source, settings);
    return {
      sha256: packed.sha256,
      profiles: Object.keys(packed.profiles).sort(),
      source,
      settings,
      packed,
    };
  }

  async blobItems(httpSpaceId: string): Promise<BlobItems> {
    const { packed } = await this.plan(httpSpaceId);
    return { sha256: packed.sha256, items: blobItemsOf(packed.blobs, blobKey) };
  }

  async compile(httpSpaceId: string): Promise<RuleCompilePublished> {
    const { source, packed } = await this.plan(httpSpaceId);
    const out = {
      ...(await compileRules(join(this.root, httpSpaceId, "rules"), source)),
      sha256: packed.sha256,
    };

    if (this.redis === null || this.desired === null) {
      return { ...out, pointer: null };
    }

    const current = await this.desired.getRulesPack().catch(() => null);

    const put = await this.redis.setNxExpireMany(
      blobItemsOf(packed.blobs, blobKey),
      BLOB_TTL_SEC,
    );

    if (current !== null && current.sha256 === packed.sha256) {
      await this.desired.markPublished("rules");
      return { ...out, pointer: { ...current, wrote: put.wrote, reused: put.reused } };
    }

    const pointer: RulesPackPointer = {
      v: 1,
      kind: "rules-pack",
      rev: (current?.rev ?? 0) + 1,
      sha256: packed.sha256,
      prefix: BLOB_PREFIX,
      files: packed.files,
      profiles: packed.profiles,
      data: packed.data,
      policies: packed.policies,
      ...(packed.settings === undefined ? {} : { settings: packed.settings }),
      blobs: packed.blobs.size,
      wrote: put.wrote,
      reused: put.reused,
      bytes: packed.bytes,
    };

    await this.desired.putRulesPack(pointer);
    return { ...out, pointer };
  }
}

export interface IpCompilePublished extends IpCompileResult {
  sha256: string;
  pointer: IpPackPointer | null;
  took: IpPackTook;
}

export interface IpPlan {
  sha256: string;
  profiles: string[];
  source: Awaited<ReturnType<IpProfileRepo["exportCompile"]>>;
  settings: InspectorSettings;
  packed: ReturnType<typeof packIp>;
  took: { load_ms: number; pack_ms: number };
}

function tookMs(from: number): number {
  return Math.round((performance.now() - from) * 10) / 10;
}

export class IpCompiler {
  private readonly root: string;
  private readonly profiles: IpProfileRepo;
  private readonly settingsOf: InspectorSettingsSource;
  private readonly redis: CompileRedis | null;
  private readonly desired: DesiredStore | null;

  constructor(
    root: string,
    profiles: IpProfileRepo,
    settingsOf: InspectorSettingsSource,
    redis: CompileRedis | null = null,
    desired: DesiredStore | null = null,
  ) {
    this.root = root;
    this.profiles = profiles;
    this.settingsOf = settingsOf;
    this.redis = redis;
    this.desired = desired;
  }

  async plan(httpSpaceId: string): Promise<IpPlan> {
    const t0 = performance.now();
    const source = await this.profiles.exportCompile(httpSpaceId);
    const settings = await this.settingsOf(httpSpaceId, IP_PROCESS);
    const loadMs = tookMs(t0);

    const t1 = performance.now();
    const packed = packIp(source, settings);
    const packMs = tookMs(t1);

    return {
      sha256: packed.sha256,
      profiles: Object.keys(packed.profiles).sort(),
      source,
      settings,
      packed,
      took: { load_ms: loadMs, pack_ms: packMs },
    };
  }

  async blobItems(httpSpaceId: string): Promise<BlobItems> {
    const { packed } = await this.plan(httpSpaceId);
    return { sha256: packed.sha256, items: ipBlobItems(packed) };
  }

  async compile(httpSpaceId: string): Promise<IpCompilePublished> {
    const t0 = performance.now();
    const planned = await this.plan(httpSpaceId);
    const { source, packed } = planned;
    const loadMs = planned.took.load_ms;
    const packMs = planned.took.pack_ms;

    const t2 = performance.now();
    const disk = await compileIp(join(this.root, httpSpaceId, "ip"), source);
    const writeMs = tookMs(t2);

    const took = (
      redisMs: number,
      kvMs: number,
    ): IpPackTook => ({
      load_ms: loadMs,
      pack_ms: packMs,
      write_ms: writeMs,
      redis_ms: redisMs,
      kv_ms: kvMs,
      total_ms: tookMs(t0),
    });

    if (this.redis === null || this.desired === null) {
      return {
        ...disk,
        sha256: packed.sha256,
        pointer: null,
        took: took(0, 0),
      };
    }

    const current = await this.desired.getIpPack().catch(() => null);
    const t3 = performance.now();
    const put = await this.redis.setNxExpireMany(
      ipBlobItems(packed),
      IP_BLOB_TTL_SEC,
    );
    const redisMs = tookMs(t3);

    if (current !== null && current.sha256 === packed.sha256) {
      const pointer = { ...current, wrote: put.wrote, reused: put.reused };
      const t4 = performance.now();
      await this.desired.putIpPack(pointer);
      return { ...disk, sha256: packed.sha256, pointer, took: took(redisMs, tookMs(t4)) };
    }

    const pointer = pointerOf(
      packed,
      (current?.rev ?? 0) + 1,
      put.wrote,
      put.reused,
    );
    const t4 = performance.now();
    await this.desired.putIpPack(pointer);
    return { ...disk, sha256: packed.sha256, pointer, took: took(redisMs, tookMs(t4)) };
  }
}

export function pageFilesOf(source: NginxExport): NginxPageFile[] {
  return source.contentObjects.map((object) => ({
    file: object.file,
    content: object.body,
  }));
}

export interface NginxCompilePublished extends NginxCompileResult {
  sha256: string;
  pointer: NginxPackPointer | null;
  errors: { code: string; message: string }[];
}

export interface NginxPlan {
  sha256: string;
  errors: { code: string; message: string; params?: Record<string, string | number> }[];
  compiled: NginxCompileResult;
  packed: ReturnType<typeof packNginx> | null;
  requires: Map<string, string>;
}

export class NginxCompiler {
  private readonly store: StoreRepo;
  private readonly redis: CompileRedis | null;
  private readonly desired: DesiredStore | null;

  constructor(
    store: StoreRepo,
    redis: CompileRedis | null = null,
    desired: DesiredStore | null = null,
  ) {
    this.store = store;
    this.redis = redis;
    this.desired = desired;
  }

  async plan(source: NginxExport): Promise<NginxPlan> {
    const empty: NginxCompileResult = { text: "", storeRefs: [] };
    const storeIds = certificateStoreIds(source);
    const errors = validateNginxExport(source, storeIds);

    let compiled: NginxCompileResult;
    try {
      compiled = compileNginx(source);
    } catch (err) {
      if (err instanceof NginxCompileError) {
        return {
          sha256: "",
          compiled: empty,
          packed: null,
          requires: new Map(),
          errors: err.names.map((name) => ({
            code: err.code,
            message: `inspector "${name}" is not in the catalog`,
          })),
        };
      }
      if (err instanceof WafCompileError) {
        return {
          sha256: "",
          compiled: empty,
          packed: null,
          requires: new Map(),
          errors: [
            { code: err.code, message: err.message, ...(err.params ? { params: err.params } : {}) },
          ],
        };
      }
      throw err;
    }

    const requires = inspectorProfilesOf(source);

    if (errors.length > 0) {
      return { sha256: "", compiled, packed: null, requires, errors };
    }

    const storeBlobs: { uuid: string; type: string; blob: Buffer }[] = [];
    for (const uuid of compiled.storeRefs) {
      const obj = await this.store.get(uuid);
      if (obj === null) {
        errors.push({
          code: "store_not_found",
          message: `store:${uuid} not found in database`,
        });
        continue;
      }
      storeBlobs.push({ uuid: obj.id, type: obj.type, blob: obj.blob });
    }

    if (errors.length > 0) {
      return { sha256: "", compiled, packed: null, requires, errors };
    }

    const packed = packNginx(compiled.text, storeBlobs, pageFilesOf(source));
    return { sha256: packed.sha256, compiled, packed, requires, errors: [] };
  }

  async blobItems(source: NginxExport): Promise<BlobItems | null> {
    const planned = await this.plan(source);

    if (planned.errors.length > 0 || planned.packed === null) {
      return null;
    }

    return {
      sha256: planned.packed.sha256,
      items: blobItemsOf(planned.packed.blobs, nginxBlobKey),
    };
  }

  async compile(source: NginxExport): Promise<NginxCompilePublished> {
    const planned = await this.plan(source);
    const compiled = planned.compiled;

    if (planned.errors.length > 0 || planned.packed === null) {
      return {
        ...compiled,
        sha256: "",
        pointer: null,
        errors: planned.errors,
      };
    }

    const packed = planned.packed;

    if (this.redis === null || this.desired === null) {
      return { ...compiled, sha256: packed.sha256, pointer: null, errors: [] };
    }

    const current = await this.desired.getNginxPack().catch(() => null);

    const put = await this.redis.setNxExpireMany(
      blobItemsOf(packed.blobs, nginxBlobKey),
      BLOB_TTL_SEC,
    );

    if (current !== null && current.sha256 === packed.sha256) {
      await this.desired.markPublished("nginx");
      return {
        ...compiled,
        sha256: packed.sha256,
        pointer: { ...current, wrote: put.wrote, reused: put.reused },
        errors: [],
      };
    }

    const pointer = nginxPointerOf(
      packed,
      (current?.rev ?? 0) + 1,
      put.wrote,
      put.reused,
    );

    await this.desired.putNginxPack(pointer);
    return { ...compiled, sha256: packed.sha256, pointer, errors: [] };
  }
}
