// Removes personal data from captured JSON before it can be saved as a fixture.
// Deliberately aggressive: a fixture only needs the structure and catalog data.

export const REDACTED = '<redacted>';

const DENY_KEYS = new Set([
  'username',
  'email',
  'emailaddress',
  'displayname',
  'birthdate',
  'phonenumber',
  'postalcode',
  'zip',
  'interactionid',
  'shareid',
  'revisionid',
]);

/** Keys kept even inside user objects: they describe the schema, not the person. */
const SCHEMA_KEYS = new Set(['__typename', 'type']);

const STRING_RULES: ReadonlyArray<[RegExp, string]> = [
  [/Bearer\s+\S+/gi, '<bearer>'],
  [/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '<jwt>'],
  [/\bsp_[a-z]+=[^;\s"]*/gi, '<cookie>'],
  [/spotify:user:[^:\s"'<>]+/gi, '<user-uri>'],
  [/\/user\/[^\s"/?#<]+/gi, `/user/${REDACTED}`],
  // Share links carry a per-share tracking id tied to the sharing session.
  [/([?&])si=[^&#\s"]*/g, `$1si=${REDACTED}`],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>'],
];

const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{100,}$/;

export function anonymizeString(value: string): string {
  if (OPAQUE_TOKEN.test(value)) return '<opaque>';
  let out = value;
  for (const [pattern, replacement] of STRING_RULES) out = out.replace(pattern, replacement);
  return out;
}

function isUserObject(record: Record<string, unknown>): boolean {
  const typename = record['__typename'];
  const uri = record['uri'];
  return (
    (typeof typename === 'string' && typename.toLowerCase() === 'user') ||
    (typeof uri === 'string' && /^spotify:user:[^:]+$/i.test(uri))
  );
}

/** Replaces every string below a user object, keeping numbers, booleans and the shape. */
function redactAll(value: unknown, key: string | null): unknown {
  if (typeof value === 'string') return key !== null && SCHEMA_KEYS.has(key) ? value : REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactAll(item, null));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [anonymizeString(k), redactAll(v, k)]),
    );
  }
  return value;
}

export function anonymize(value: unknown): unknown {
  if (typeof value === 'string') return anonymizeString(value);
  if (Array.isArray(value)) return value.map(anonymize);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (isUserObject(record)) return redactAll(record, null);
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => [
        anonymizeString(key),
        DENY_KEYS.has(key.toLowerCase()) ? REDACTED : anonymize(child),
      ]),
    );
  }
  return value;
}
