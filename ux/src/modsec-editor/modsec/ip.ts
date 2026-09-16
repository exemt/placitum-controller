function isMacroLike(value: string): boolean {
  return /%\{[^}]*\}/.test(value);
}

function isValidIpv4(value: string): boolean {
  const octets = value.split('.');
  if (octets.length !== 4) return false;
  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    if (octet.length > 1 && octet.startsWith('0')) return false;
    return Number(octet) <= 255;
  });
}

function isHexGroup(group: string): boolean {
  return /^[0-9a-fA-F]{1,4}$/.test(group);
}

function splitIpv6Half(half: string): string[] | null {
  if (half === '') return [];
  const groups = half.split(':');
  return groups.some((group) => group === '') ? null : groups;
}

function isValidIpv6(value: string): boolean {
  if (value === '' || value.includes('%')) return false;

  const sides = value.split('::');
  if (sides.length > 2) return false;

  const compressed = sides.length === 2;
  const headGroups = splitIpv6Half(sides[0]);
  const tailGroups = compressed ? splitIpv6Half(sides[1]) : [];
  if (headGroups === null || tailGroups === null) return false;

  const last = tailGroups.length > 0 ? tailGroups : headGroups;
  let ipv4Groups = 0;
  if (last.length > 0 && last[last.length - 1].includes('.')) {
    if (!isValidIpv4(last[last.length - 1])) return false;
    last.pop();
    ipv4Groups = 2;
  }

  if (!headGroups.every(isHexGroup) || !tailGroups.every(isHexGroup)) return false;

  const total = headGroups.length + tailGroups.length + ipv4Groups;
  return compressed ? total <= 7 : total === 8;
}

export function isValidIpEntry(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (isMacroLike(trimmed)) return true;

  const parts = trimmed.split('/');
  if (parts.length > 2) return false;
  const [address, mask] = parts;

  const isV4 = isValidIpv4(address);
  const isV6 = !isV4 && isValidIpv6(address);
  if (!isV4 && !isV6) return false;
  if (mask === undefined) return true;

  if (!/^\d{1,3}$/.test(mask)) return false;
  return Number(mask) <= (isV4 ? 32 : 128);
}
