export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Properties = { [key: string]: Json };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isScalar(value: unknown): value is null | boolean | number | string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  return typeof value === 'number' && Number.isFinite(value);
}

export function assertJson(value: unknown, path = '$', depth = 0): asserts value is Json {
  if (depth > 64) throw new Error(`${path}: data is too deeply nested`);
  if (isScalar(value)) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertJson(value[i], `${path}[${i}]`, depth + 1);
    return;
  }
  if (isPlainObject(value)) {
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

type Shape<T extends Schema['type']> = Extract<Schema, { type: T }>;
export type ObjectSchema = Shape<'object'>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type OptionalKeys<P> = { [K in keyof P]: P[K] extends { optional: true } ? K : never }[keyof P];
type Fields<P> = Simplify<
  { [K in Exclude<keyof P, OptionalKeys<P>>]: Infer<P[K]> } & {
    [K in OptionalKeys<P>]?: Infer<P[K]>;
  }
>;
type Primitives = { number: number; string: string; boolean: boolean; null: null };

export type Infer<S> = S extends { type: 'string'; values: readonly (infer V extends string)[] }
  ? V
  : S extends { type: keyof Primitives }
    ? Primitives[S['type']]
    : S extends { type: 'array'; items: infer I }
      ? Infer<I>[]
      : S extends { type: 'object'; properties: infer P }
        ? ObjectSchema extends S
          ? Properties
          : Fields<P>
        : S extends { type: 'union'; variants: readonly (infer V)[] }
          ? Schema extends V
            ? Json
            : Infer<V>
          : never;

type Validated<S> = S extends { optional: true } ? Infer<S> | undefined : Infer<S>;

export function validate<S extends Schema>(
  schema: S,
  value: unknown,
  path = '$',
): asserts value is Validated<S> {
  if (value === undefined && schema.optional) return;
  if (schema.type === 'union') validateUnion(schema, value, path);
  else if (schema.type === 'object') validateObject(schema, value, path);
  else if (schema.type === 'array') validateArray(schema, value, path);
  else if (schema.type === 'null' ? value !== null : typeof value !== schema.type)
    throw new Error(`${path}: expected ${schema.type}`);
  else if (schema.type === 'number') validateNumber(schema, value as number, path);
  else if (schema.type === 'string') validateString(schema, value as string, path);
}

function validateUnion(schema: Shape<'union'>, value: unknown, path: string): void {
  for (const variant of schema.variants) {
    try {
      validate(variant, value, path);
      return;
    } catch {}
  }
  throw new Error(`${path}: does not match any allowed shape`);
}

function validateObject(schema: ObjectSchema, value: unknown, path: string): void {
  if (!isPlainObject(value)) throw new Error(`${path}: expected object`);
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(schema.properties, key)) throw new Error(`${path}.${key}: unknown setting`);
  }
  for (const [key, field] of Object.entries(schema.properties)) {
    validate(field, Object.hasOwn(value, key) ? value[key] : undefined, `${path}.${key}`);
  }
}

function validateArray(schema: Shape<'array'>, value: unknown, path: string): void {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  if (value.length < (schema.min ?? 0) || value.length > (schema.max ?? Infinity))
    throw new Error(`${path}: invalid array length`);
  for (let i = 0; i < value.length; i++) {
    if (value[i] === undefined) throw new Error(`${path}[${i}]: expected JSON data`);
    validate(schema.items, value[i], `${path}[${i}]`);
  }
}

function validateNumber(schema: Shape<'number'>, value: number, path: string): void {
  const inRange = value >= (schema.min ?? -Infinity) && value <= (schema.max ?? Infinity);
  const whole = !schema.integer || Number.isSafeInteger(value);
  if (!Number.isFinite(value) || !inRange || !whole) throw new Error(`${path}: invalid number`);
}

function validateString(schema: Shape<'string'>, value: string, path: string): void {
  const allowed = !schema.values || schema.values.includes(value);
  if (!allowed || value.length > (schema.maxLength ?? Infinity))
    throw new Error(`${path}: invalid string`);
}

export const number = { type: 'number' } as const satisfies Schema;
export const meters = { type: 'number', unit: 'm' } as const satisfies Schema;
export const degrees = { type: 'number', unit: '°' } as const satisfies Schema;
export const integer = { type: 'number', integer: true } as const satisfies Schema;
export const string = { type: 'string' } as const satisfies Schema;
export const boolean = { type: 'boolean' } as const satisfies Schema;
export const object = <P extends Record<string, Schema>>(properties: P) =>
  ({ type: 'object', properties }) as const;
export const array = <I extends Schema>(items: I) => ({ type: 'array', items }) as const;
export const nullable = <S extends Schema>(schema: S) =>
  ({ type: 'union', variants: [schema, { type: 'null' }] }) as const;
