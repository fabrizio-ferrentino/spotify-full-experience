// Extracts the persisted-query fields from a Pathfinder request.
// Shape from project research (CLAUDE.md §1): operationName + variables +
// extensions.persistedQuery.sha256Hash, in the query string (GET) or JSON body (POST).
// NOT yet verified on live traffic (Phase 0).

export interface PathfinderRequestInfo {
  operationName: string | null;
  hash: string | null;
  variables: unknown;
}

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readHash(extensions: unknown): string | null {
  const persisted = asRecord(asRecord(extensions)?.['persistedQuery']);
  const hash = persisted?.['sha256Hash'];
  return typeof hash === 'string' ? hash : null;
}

export function parsePathfinderRequest(url: URL, body: string | null): PathfinderRequestInfo {
  const fromBody = asRecord(parseJson(body));
  if (fromBody) {
    const name = fromBody['operationName'];
    return {
      operationName: typeof name === 'string' ? name : null,
      hash: readHash(fromBody['extensions']),
      variables: fromBody['variables'],
    };
  }
  const params = url.searchParams;
  return {
    operationName: params.get('operationName'),
    hash: readHash(parseJson(params.get('extensions'))),
    variables: parseJson(params.get('variables')),
  };
}
