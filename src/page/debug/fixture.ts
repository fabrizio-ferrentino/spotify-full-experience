// Builds an anonymized fixture from a captured request.
import { anonymize, anonymizeString } from '../../shared/anonymize';
import { findSensitivePatterns } from '../../shared/fixtureSafety';
import type { CapturedRequest } from '../core/interceptor';
import { describeEndpoint } from './requestLog';

export const FIXTURE_FORMAT = 'sfe-fixture/v1';

export interface Fixture {
  format: typeof FIXTURE_FORMAT;
  capturedOn: string;
  request: {
    transport: CapturedRequest['transport'];
    kind: CapturedRequest['kind'];
    method: string;
    /** Pathfinder: host and path. spclient: host, service and version only (later segments may be personal). */
    endpoint: string;
    pathfinderVersion: number | null;
    operationName: string | null;
    hash: string | null;
    variables: unknown;
    requestHeaderNames: string[];
  };
  response: {
    status: number;
    contentType: string | null;
    responseHeaderNames: string[];
    json: unknown;
  };
}

export type FixtureResult = { ok: true; fileName: string; text: string } | { ok: false; problems: string[] };

function endpointOf(capture: CapturedRequest): string {
  if (capture.kind !== 'pathfinder') return describeEndpoint(capture.url);
  const url = new URL(capture.url);
  return anonymizeString(`${url.host}${url.pathname}`);
}

export function buildFixture(capture: CapturedRequest, now: Date): Fixture {
  return {
    format: FIXTURE_FORMAT,
    capturedOn: now.toISOString().slice(0, 10),
    request: {
      transport: capture.transport,
      kind: capture.kind,
      method: capture.method,
      endpoint: endpointOf(capture),
      pathfinderVersion: capture.pathfinderVersion,
      operationName: capture.operationName,
      hash: capture.hash,
      variables: anonymize(capture.variables ?? null),
      requestHeaderNames: capture.requestHeaderNames,
    },
    response: {
      status: capture.status,
      contentType: capture.contentType,
      responseHeaderNames: capture.responseHeaderNames,
      json: anonymize(capture.json ?? null),
    },
  };
}

function fileNameFor(capture: CapturedRequest, day: string): string {
  const base = capture.operationName ?? describeEndpoint(capture.url).split('/').slice(1).join('-');
  const safe = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'request';
  return `${safe}.${day}.json`;
}

/** Anonymizes and serializes; refuses if any sensitive pattern survives. */
export function exportFixture(capture: CapturedRequest, now = new Date()): FixtureResult {
  const fixture = buildFixture(capture, now);
  const text = `${JSON.stringify(fixture, null, 2)}\n`;
  const problems = findSensitivePatterns(text);
  if (problems.length) return { ok: false, problems };
  return { ok: true, fileName: fileNameFor(capture, fixture.capturedOn), text };
}
