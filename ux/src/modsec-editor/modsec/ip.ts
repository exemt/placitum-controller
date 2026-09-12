/**
 * Проверка записей IP-списка (`@ipMatch` и подобные).
 *
 * Список — это адреса и сети через запятую, IPv4 и IPv6 вперемешку,
 * каждая запись — отдельный чип в конструкторе. Опечатка в одной из них
 * тихо превращает сеть в адрес или обрезает маску, и правило перестаёт
 * ловить то, что должно, — заметить это в строке из десятка записей
 * почти невозможно, поэтому каждая проверяется по отдельности.
 *
 * Макрос (`%{tx.allowed_ips}`) проверке не подлежит: что в нём окажется,
 * известно только во время исполнения правила.
 */

/** Запись выглядит как макрос — что в нём окажется, знает только движок. */
function isMacroLike(value: string): boolean {
  return /%\{[^}]*\}/.test(value);
}

/** Четыре десятичных октета, каждый 0–255, без лишних нулей впереди. */
function isValidIpv4(value: string): boolean {
  const octets = value.split('.');
  if (octets.length !== 4) return false;
  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    if (octet.length > 1 && octet.startsWith('0')) return false;
    return Number(octet) <= 255;
  });
}

/** Группа адреса: до четырёх шестнадцатеричных цифр. */
function isHexGroup(group: string): boolean {
  return /^[0-9a-fA-F]{1,4}$/.test(group);
}

/**
 * Разбирает половину адреса (до или после `::`) на группы.
 *
 * Пустая строка — половины без единой группы, например у самого `::`.
 * `null` — в строке лишнее двоеточие (`1:::2`), группа между двумя
 * разделителями пуста, а это не сжатие нулей, а опечатка.
 */
function splitIpv6Half(half: string): string[] | null {
  if (half === '') return [];
  const groups = half.split(':');
  return groups.some((group) => group === '') ? null : groups;
}

/**
 * IPv6-адрес, включая сжатие `::` и внедрённый IPv4 в последней группе
 * (`::ffff:192.168.1.1`).
 *
 * Считает группы, а не сравнивает со списком шаблонов: 16-битных групп
 * должно быть ровно восемь, а `::` заменяет один и более нулевых —
 * поэтому явных групп при нём не может быть восемь, для скрытых не
 * останется места.
 */
function isValidIpv6(value: string): boolean {
  if (value === '' || value.includes('%')) return false;

  const sides = value.split('::');
  if (sides.length > 2) return false;

  const compressed = sides.length === 2;
  const headGroups = splitIpv6Half(sides[0]);
  const tailGroups = compressed ? splitIpv6Half(sides[1]) : [];
  if (headGroups === null || tailGroups === null) return false;

  // Внедрённый IPv4 занимает две 16-битные группы и стоит только в самом
  // конце адреса — это его законное место в этой записи.
  const last = tailGroups.length > 0 ? tailGroups : headGroups;
  let ipv4Groups = 0;
  if (last.length > 0 && last[last.length - 1].includes('.')) {
    if (!isValidIpv4(last[last.length - 1])) return false;
    last.pop();
    ipv4Groups = 2;
  }

  if (!headGroups.every(isHexGroup) || !tailGroups.every(isHexGroup)) return false;

  const total = headGroups.length + tailGroups.length + ipv4Groups;
  // Без `::` группы обязаны заполнить адрес целиком; с ним обязаны
  // оставить хотя бы одну на долю сжатых нулей.
  return compressed ? total <= 7 : total === 8;
}

/**
 * Одна запись списка `@ipMatch`: адрес или сеть CIDR, IPv4 или IPv6.
 *
 * Пустую строку проверять смысла нет — она и в списке ничего не
 * значит, и в интерфейсе ей соответствует ещё не набранный чип.
 */
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
