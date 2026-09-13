/*
 * Сборщик MaxMind DB для тестов.
 *
 * Выгрузки MaxMind в репозиторий не кладутся (лицензия и размер), поэтому
 * базу собирает сам тест: дерево на 24-битных записях, секция данных и
 * метаданные -- ровно столько формата, сколько читает geo-mmdb.ts.
 */

export type MmdbValue = string | number | MmdbValue[] | { [key: string]: MmdbValue };

export interface MmdbNetwork {
  /** `8.8.8.0/24` или `2a02:6b8::/32`. IPv4 ложится под ::/96, как в выгрузках MaxMind. */
  cidr: string;
  record: MmdbValue;
}

type Slot = { node: number } | { data: number } | null;

const MARKER = Buffer.from("\xab\xcd\xefMaxMind.com", "binary");

export const TEST_BUILD_EPOCH = 1723644981;

export function buildMmdb(input: {
  type: string;
  networks?: MmdbNetwork[];
  /** Псевдонимы IPv4 (::ffff:0:0/96, 2002::/16) на узел ::/96 -- как у настоящих выгрузок. */
  alias?: boolean;
  /** Указатель первой сети -- за краем файла: битая выгрузка. */
  brokenPointer?: boolean;
}): Buffer {
  const nodes: [Slot, Slot][] = [[null, null]];
  const data: Buffer[] = [];
  const offsets = new Map<string, number>();
  let dataSize = 0;

  const set = (bits: number[], slot: Slot): void => {
    let node = 0;

    for (const bit of bits.slice(0, -1)) {
      let next = nodes[node][bit];

      if (next === null) {
        nodes.push([null, null]);
        next = { node: nodes.length - 1 };
        nodes[node][bit] = next;
      }

      if (!("node" in next)) {
        throw new Error("network under a network");
      }

      node = next.node;
    }

    nodes[node][bits[bits.length - 1]] = slot;
  };

  for (const [index, net] of (input.networks ?? []).entries()) {
    const key = JSON.stringify(net.record);
    let offset = offsets.get(key);

    if (offset === undefined) {
      const bytes = encode(net.record);
      offset = dataSize;
      data.push(bytes);
      dataSize += bytes.length;
      offsets.set(key, offset);
    }

    set(bitsOf(net.cidr), { data: index === 0 && input.brokenPointer === true ? 1 << 20 : offset });
  }

  if (input.alias === true) {
    let ipv4 = 0;

    for (let depth = 0; depth < 96; depth++) {
      const next = nodes[ipv4][0];

      if (next === null || !("node" in next)) {
        throw new Error("alias needs an IPv4 network");
      }

      ipv4 = next.node;
    }

    set(bitsOf("::ffff:0:0/96"), { node: ipv4 });
    set(bitsOf("2002::/16"), { node: ipv4 });
  }

  const nodeCount = nodes.length;
  const tree = Buffer.alloc(nodeCount * 6);
  const record = (slot: Slot): number =>
    slot === null ? nodeCount : "node" in slot ? slot.node : nodeCount + 16 + slot.data;

  nodes.forEach(([left, right], index) => {
    tree.writeUIntBE(record(left), index * 6, 3);
    tree.writeUIntBE(record(right), index * 6 + 3, 3);
  });

  const meta = encode({
    node_count: nodeCount,
    record_size: 24,
    ip_version: 6,
    database_type: input.type,
    build_epoch: TEST_BUILD_EPOCH,
    binary_format_major_version: 2,
    binary_format_minor_version: 0,
    languages: ["en", "ru"],
  });

  return Buffer.concat([tree, Buffer.alloc(16), ...data, MARKER, meta]);
}

function bitsOf(cidr: string): number[] {
  const [addr, lenText] = cidr.split("/");
  const len = Number(lenText);

  if (addr.includes(".")) {
    const bits = new Array<number>(96).fill(0);

    for (const octet of addr.split(".").map(Number)) {
      for (let i = 7; i >= 0; i--) {
        bits.push((octet >> i) & 1);
      }
    }

    return bits.slice(0, 96 + len);
  }

  const [head, tail = ""] = addr.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === "" ? [] : tail.split(":");
  const groups = [
    ...left,
    ...new Array<string>(8 - left.length - right.length).fill("0"),
    ...right,
  ];
  const bits: number[] = [];

  for (const group of groups) {
    const n = parseInt(group, 16);

    for (let i = 15; i >= 0; i--) {
      bits.push((n >> i) & 1);
    }
  }

  return bits.slice(0, len);
}

/** Секция данных: строки, беззнаковые целые, карты, массивы. */
function encode(value: MmdbValue): Buffer {
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([control(2, bytes.length), bytes]);
  }

  if (typeof value === "number") {
    const bytes: number[] = [];

    for (let n = value; n > 0; n = Math.floor(n / 256)) {
      bytes.unshift(n % 256);
    }

    return Buffer.concat([control(value > 0xffffffff ? 9 : 6, bytes.length), Buffer.from(bytes)]);
  }

  if (Array.isArray(value)) {
    return Buffer.concat([control(11, value.length), ...value.map(encode)]);
  }

  const entries = Object.entries(value);

  return Buffer.concat([
    control(7, entries.length),
    ...entries.flatMap(([key, item]) => [encode(key), encode(item)]),
  ]);
}

function control(type: number, size: number): Buffer {
  const extended = type > 7;
  let bits = size;
  let tail: number[] = [];

  if (size >= 65821) {
    const rest = size - 65821;
    bits = 31;
    tail = [(rest >> 16) & 255, (rest >> 8) & 255, rest & 255];
  } else if (size >= 285) {
    const rest = size - 285;
    bits = 30;
    tail = [(rest >> 8) & 255, rest & 255];
  } else if (size >= 29) {
    bits = 29;
    tail = [size - 29];
  }

  const head = [((extended ? 0 : type) << 5) | bits];

  if (extended) {
    head.push(type - 7);
  }

  return Buffer.from([...head, ...tail]);
}
