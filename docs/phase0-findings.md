# Phase 0 findings

Fill in from real debug logs and fixtures. Record the date and the web player version for every finding: operation names, hashes and DOM change with player releases.

- Date:
- Web player bundle (from the console stack traces, e.g. `web-player.<hash>.js`):
- Browsers checked:

## Injection and interception

| Browser | Page script start (ms) | readyState | Completed before injection | fetch / console already wrapped? | Coverage gaps |
|---|---|---|---|---|---|
| Chrome | 924 | interactive | 0 / 0 | | |
| Brave | 348 | loading | 0 / 0 | | |
| Firefox | 608 | interactive | 0 / 0 | | |

Pathfinder method and version used by the player (GET v1 / POST v2):

## 1. Album: play count per track

- Operation:
- Hash:
- Variable keys:
- Play count path (if any):
- Fixture:

## 2. Artist: "Popular" section

- Operation:
- Hash:
- Variable keys:
- Play count path (if any):
- Fixture:

## 3. Liked Songs: library pagination

- Operation:
- Hash:
- Variable keys (offset/limit?):
- Maximum accepted limit:
- `totalCount` path:
- Artists path (is the first artist the primary one?):
- `addedAt` path:
- Fixture:

## 4. Like / unlike

- Add operation:
- Remove operation:
- Fixture:

## 5. DOM structure

- Album tracklist container and rows (data-testid, roles):
- `grid-template-columns` of the rows:
- Header row:
- Artist "Popular" section:

## 6. (Optional) "Liked songs by artist" route

- Desktop route:
- Does the web player resolve it?

## Open questions
