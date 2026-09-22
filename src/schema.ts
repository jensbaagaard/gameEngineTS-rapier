export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Properties = { [key: string]: Json };

export function assertJson(value: unknown, path = '$', depth = 0): asserts value is Json {
  if (depth > 64) throw new Error(`${path}: data is too deeply nested`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertJson(value[i], `${path}[${i}]`, depth + 1);
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) assertJson(item, `${path}.${key}`, depth + 1);
    return;
  }
  throw new Error(`${path}: expected JSON data`);
}

export type Schema = (
  | { type: 'number'; min?: number; max?: number; integer?: boolean }
  | { type: 'string'; values?: readonly string[]; maxLength?: number }
  | { type: 'boolean' }
  | { type: 'null' }
  | { type: 'array'; items: Schema; min?: number; max?: number }
  | { type: 'object'; properties: Record<string, Schema> }
  | { type: 'union'; variants: readonly Schema[] }
) & { optional?: boolean; title?: string; unit?: string };

export function validate(schema: Schema, value: unknown, path = '$'): void {
  if (value === undefined && schema.optional) return;
  if (schema.type === 'union') {
    for (const variant of schema.variants) {
      try { validate(variant, value, path); return; } catch {}
    }
    throw new Error(`${path}: does not match any allowed shape`);
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${path}: expected object`);
    const data = value as Record<string, unknown>;
    for (const key of Object.keys(data)) if (!Object.hasOwn(schema.properties, key)) throw new Error(`${path}.${key}: unknown setting`);
    for (const [key, field] of Object.entries(schema.properties)) validate(field, Object.hasOwn(data, key) ? data[key] : undefined, `${path}.${key}`);
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.min ?? 0) || value.length > (schema.max ?? Infinity)) throw new Error(`${path}: invalid array length`);
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) throw new Error(`${path}[${i}]: expected JSON data`);
      validate(schema.items, value[i], `${path}[${i}]`);
    }
    return;
  }
  if (schema.type === 'null' ? value !== null : typeof value !== schema.type) throw new Error(`${path}: expected ${schema.type}`);
  if (schema.type === 'number' && (!Number.isFinite(value) || (value as number) < (schema.min ?? -Infinity) || (value as number) > (schema.max ?? Infinity) || (schema.integer && !Number.isSafeInteger(value)))) throw new Error(`${path}: invalid number`);
  if (schema.type === 'string' && ((schema.values && !schema.values.includes(value as string)) || (value as string).length > (schema.maxLength ?? Infinity))) throw new Error(`${path}: invalid string`);
}

export const number = { type: 'number' } as const satisfies Schema;
export const meters = { type: 'number', unit: 'm' } as const satisfies Schema;
export const integer = { type: 'number', integer: true } as const satisfies Schema;
export const string = { type: 'string' } as const satisfies Schema;
export const boolean = { type: 'boolean' } as const satisfies Schema;
export const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties });
export const array = (items: Schema): Schema => ({ type: 'array', items });
export const nullable = (schema: Schema): Schema => ({ type: 'union', variants: [schema, { type: 'null' }] });
