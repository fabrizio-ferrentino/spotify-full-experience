// Passive wrappers around fetch and XMLHttpRequest.
// Rules (CLAUDE.md §2.6): the original Response/XHR is always handed back untouched,
// bodies are read only from clones, and any internal error is swallowed.
// Header VALUES are never read into captures: only header names. The only consumer of values
// is onPathfinderRequest, which feeds the in-memory session (core/session).
import { matchEndpoint, type EndpointKind } from '../adapters/endpoints';
import { parsePathfinderRequest } from '../adapters/pathfinderRequest';

export interface CapturedRequest {
  id: number;
  transport: 'fetch' | 'xhr';
  kind: EndpointKind;
  method: string;
  /** Full URL, kept in memory only. Logs and fixtures must sanitize it. */
  url: string;
  pathfinderVersion: number | null;
  operationName: string | null;
  hash: string | null;
  variables: unknown;
  requestHeaderNames: string[];
  status: number;
  responseHeaderNames: string[];
  contentType: string | null;
  /** Parsed JSON body, or undefined when the response is not JSON or could not be read. */
  json: unknown;
  durationMs: number;
}

export interface PathfinderRequestEvent {
  operationName: string | null;
  hash: string | null;
  /** Request headers WITH values (token included): memory-only consumers. */
  headers: Headers;
}

export interface InterceptorHooks {
  /** Asked once per matching request, before anything is cloned or parsed. */
  shouldCapture(kind: EndpointKind): boolean;
  onCapture(request: CapturedRequest): void;
  /** Every Pathfinder fetch of the player, captured or not (session headers, hash registry). */
  onPathfinderRequest?(event: PathfinderRequestEvent): void;
  /** Every spclient fetch of the player: URL and string body (Connect device and play params). */
  onSpclientRequest?(url: string, body: string | null): void;
}

interface RequestPart {
  transport: CapturedRequest['transport'];
  method: string;
  url: URL;
  kind: EndpointKind;
  pathfinderVersion: number | null;
  requestHeaderNames: Set<string>;
  startedAt: number;
}

interface ResponsePart {
  status: number;
  responseHeaderNames: string[];
  contentType: string | null;
  json: unknown;
}

type FetchArgs = Parameters<typeof globalThis.fetch>;

let nextId = 1;

function baseUrl(): string | undefined {
  return globalThis.location?.href;
}

function beginRequest(
  transport: RequestPart['transport'],
  method: string,
  rawUrl: string,
  hooks: InterceptorHooks,
): RequestPart | null {
  const match = matchEndpoint(rawUrl, baseUrl());
  if (!match || !hooks.shouldCapture(match.kind)) return null;
  return {
    transport,
    method: method.toUpperCase(),
    url: new URL(rawUrl, baseUrl()),
    kind: match.kind,
    pathfinderVersion: match.pathfinderVersion,
    requestHeaderNames: new Set(),
    startedAt: performance.now(),
  };
}

function buildCapture(req: RequestPart, body: string | null, res: ResponsePart): CapturedRequest {
  const query =
    req.kind === 'pathfinder'
      ? parsePathfinderRequest(req.url, body)
      : { operationName: null, hash: null, variables: undefined };
  return {
    id: nextId++,
    transport: req.transport,
    kind: req.kind,
    method: req.method,
    url: req.url.href,
    pathfinderVersion: req.pathfinderVersion,
    operationName: query.operationName,
    hash: query.hash,
    variables: query.variables,
    requestHeaderNames: [...req.requestHeaderNames].sort(),
    status: res.status,
    responseHeaderNames: [...res.responseHeaderNames].sort(),
    contentType: res.contentType,
    json: res.json,
    durationMs: Math.round(performance.now() - req.startedAt),
  };
}

function emit(hooks: InterceptorHooks, capture: CapturedRequest): void {
  try {
    hooks.onCapture(capture);
  } catch {
    // Consumers must never affect the player.
  }
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType !== null && /\bjson\b/i.test(contentType);
}

// ---------------------------------------------------------------- fetch

function collectHeaderNames(target: Set<string>, init: HeadersInit | undefined): void {
  if (!init) return;
  // Copying into a throwaway Headers only to read the names; values are discarded.
  for (const name of new Headers(init).keys()) target.add(name);
}

function notifyPathfinder(args: FetchArgs, rawUrl: string, hooks: InterceptorHooks): void {
  const kind = matchEndpoint(rawUrl, baseUrl())?.kind;
  const [input, init] = args;
  if (kind === 'spclient' && hooks.onSpclientRequest) {
    hooks.onSpclientRequest(new URL(rawUrl, baseUrl()).href, typeof init?.body === 'string' ? init.body : null);
    return;
  }
  if (!hooks.onPathfinderRequest || kind !== 'pathfinder') return;
  const headers = new Headers(typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
  if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  const body = typeof init?.body === 'string' ? init.body : null;
  const query = parsePathfinderRequest(new URL(rawUrl, baseUrl()), body);
  hooks.onPathfinderRequest({ operationName: query.operationName, hash: query.hash, headers });
}

function startFetchObservation(args: FetchArgs, hooks: InterceptorHooks) {
  const [input, init] = args;
  const isRequest = typeof Request !== 'undefined' && input instanceof Request;
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : isRequest ? input.url : null;
  if (rawUrl === null) return null;

  try {
    notifyPathfinder(args, rawUrl, hooks);
  } catch {
    // Consumers must never affect the player.
  }

  const method = init?.method ?? (isRequest ? input.method : 'GET');
  const req = beginRequest('fetch', method, rawUrl, hooks);
  if (!req) return null;

  if (isRequest) collectHeaderNames(req.requestHeaderNames, input.headers);
  collectHeaderNames(req.requestHeaderNames, init?.headers);

  // The body must be cloned BEFORE the original fetch consumes the Request.
  let body: Promise<string | null> = Promise.resolve(null);
  if (init?.body !== undefined && init.body !== null) {
    body = Promise.resolve(typeof init.body === 'string' ? init.body : null);
  } else if (isRequest && req.method !== 'GET' && req.method !== 'HEAD') {
    body = input
      .clone()
      .text()
      .catch(() => null);
  }

  return {
    attach(promise: Promise<Response>): void {
      promise.then(
        (response) => {
          // Clone synchronously: this callback was registered before the caller's,
          // so the clone is taken before the player starts reading the body.
          const contentType = response.headers.get('content-type');
          const clone = isJsonContentType(contentType) ? response.clone() : null;
          const responseHeaderNames = [...response.headers.keys()];
          const json = clone ? clone.json().catch(() => undefined) : Promise.resolve(undefined);
          Promise.all([body, json])
            .then(([bodyText, parsed]) => {
              emit(
                hooks,
                buildCapture(req, bodyText, { status: response.status, responseHeaderNames, contentType, json: parsed }),
              );
            })
            .catch(() => {});
        },
        () => {
          // Network errors belong to the player; nothing to capture.
        },
      );
    },
  };
}

/** Wraps target.fetch and returns the original, for our own requests (not observed). */
export function installFetchInterceptor(target: { fetch: typeof fetch }, hooks: InterceptorHooks): typeof fetch | null {
  const original = target.fetch;
  if (typeof original !== 'function') return null;

  target.fetch = function fetch(this: unknown, ...args: FetchArgs): Promise<Response> {
    let observation: ReturnType<typeof startFetchObservation> = null;
    try {
      observation = startFetchObservation(args, hooks);
    } catch {
      observation = null;
    }
    const promise: Promise<Response> = Reflect.apply(original, this, args);
    if (observation) {
      try {
        observation.attach(promise);
      } catch {
        // Ignore: the original promise is returned regardless.
      }
    }
    return promise;
  };
  return original.bind(target);
}

// ---------------------------------------------------------------- XHR

function headerNamesFromRaw(raw: string): string[] {
  const names: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0) names.push(line.slice(0, index).trim().toLowerCase());
  }
  return names;
}

function readXhrJson(xhr: XMLHttpRequest, contentType: string | null): unknown {
  if (xhr.responseType === 'json') return xhr.response ?? undefined;
  if ((xhr.responseType === '' || xhr.responseType === 'text') && isJsonContentType(contentType)) {
    try {
      return JSON.parse(xhr.responseText);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function installXhrInterceptor(target: { XMLHttpRequest: typeof XMLHttpRequest }, hooks: InterceptorHooks): void {
  const proto = target.XMLHttpRequest?.prototype;
  if (!proto) return;
  const states = new WeakMap<XMLHttpRequest, RequestPart>();
  const originalOpen = proto.open;
  const originalSetRequestHeader = proto.setRequestHeader;
  const originalSend = proto.send;

  proto.open = function open(this: XMLHttpRequest, ...args: unknown[]): void {
    const result: void = Reflect.apply(originalOpen, this, args);
    try {
      states.delete(this);
      const [method, url] = args;
      const req = beginRequest('xhr', String(method), String(url), hooks);
      if (req) states.set(this, req);
    } catch {
      // Ignore.
    }
    return result;
  } as typeof proto.open;

  proto.setRequestHeader = function setRequestHeader(this: XMLHttpRequest, name: string, value: string): void {
    const result: void = Reflect.apply(originalSetRequestHeader, this, [name, value]);
    try {
      states.get(this)?.requestHeaderNames.add(String(name).toLowerCase());
    } catch {
      // Ignore.
    }
    return result;
  };

  proto.send = function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    try {
      const req = states.get(this);
      if (req) {
        req.startedAt = performance.now();
        const bodyText = typeof body === 'string' ? body : null;
        this.addEventListener(
          'loadend',
          () => {
            try {
              const contentType = this.getResponseHeader('content-type');
              emit(
                hooks,
                buildCapture(req, bodyText, {
                  status: this.status,
                  responseHeaderNames: headerNamesFromRaw(this.getAllResponseHeaders()),
                  contentType,
                  json: readXhrJson(this, contentType),
                }),
              );
            } catch {
              // Ignore.
            }
          },
          { once: true },
        );
      }
    } catch {
      // Ignore.
    }
    return Reflect.apply(originalSend, this, [body]);
  };
}
