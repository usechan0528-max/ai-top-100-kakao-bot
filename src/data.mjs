const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
const segments = text => segmenter ? (function* () { for (const part of segmenter.segment(text)) yield part.segment; })() : text;

export function truncateText(text, limit) {
  if (text.length <= limit) return text;
  let result = '';
  for (const segment of segments(text)) {
    if (result.length + segment.length > limit - 1) break;
    result += segment;
  }
  return result + '…';
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// Inspect descriptors before copying. Never run getters or toJSON methods on tool data.
export function snapshotJson(value, { maxDepth = 8, maxNodes = 1000 } = {}) {
  let nodes = 0, chars = 0;
  const ancestors = new Set();
  function copy(item, depth) {
    if (++nodes > maxNodes || depth > maxDepth) throw new Error('Invalid data');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string') {
      chars += item.length;
      if (chars > 1000000) throw new Error('Invalid data');
      return item;
    }
    const array = Array.isArray(item);
    if (!array && !isRecord(item)) throw new Error('Invalid data');
    if (ancestors.has(item)) throw new Error('Invalid data');
    if (array && item.length > maxNodes) throw new Error('Invalid data');
    const keys = Reflect.ownKeys(item);
    if (keys.length > maxNodes + 1) throw new Error('Invalid data');
    const result = array ? [] : Object.create(null);
    ancestors.add(item);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string') throw new Error('Invalid data');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error('Invalid data');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) throw new Error('Invalid data');
      chars += key.length;
      if (chars > 1000000) throw new Error('Invalid data');
      result[key] = copy(descriptor.value, depth + 1);
    }
    if (array && result.length !== item.length) throw new Error('Invalid data');
    if (array && keys.length !== item.length + 1) throw new Error('Invalid data');
    ancestors.delete(item);
    return Object.freeze(result);
  }
  return copy(value, 0);
}

export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

export function trustedContext(context) {
  if (!isRecord(context)) throw new Error('Invalid context');
  const keys = Reflect.ownKeys(context);
  if (keys.length > 20 || keys.some(key => typeof key !== 'string' || key.length > 64)) throw new Error('Invalid context');
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(context, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error('Invalid context');
    const value = descriptor.value;
    if (!(value === null || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= 200))) throw new Error('Invalid context');
    Object.defineProperty(result, key, { value, enumerable: true });
  }
  return Object.freeze(result);
}

// Cap the entire history entry, including JSON escaping and metadata, in UTF-16 units.
export function toolEntry(name, value, limit) {
  const entry = { source: 'untrusted-tool-result', name, result: value };
  if (JSON.stringify(entry).length <= limit) return entry;
  const result = { truncated: true, preview: '' };
  const truncated = { source: 'untrusted-tool-result', name, result };
  let budget = limit - JSON.stringify(truncated).length - 1;
  for (const segment of segments(JSON.stringify(value))) {
    const size = JSON.stringify(segment).length - 2;
    if (size > budget) break;
    result.preview += segment;
    budget -= size;
  }
  result.preview += '…';
  return truncated;
}
