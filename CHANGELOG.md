# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This changelog starts at v1.5.2 — earlier releases aren't backfilled here;
see the git history for that history.

## [1.5.2]

### Fixed

- Collection/folder `defaults` no longer leak secret-marked variables into
  exported workspaces, and are no longer silently dropped by the git-tree
  export or omitted (with no warning) by the Postman exporter.
- Deleting a folder or collection now closes any open WebSocket sessions
  among the deleted requests, fixes up `activeTabId` when the active tab's
  request was removed, and correctly clears the sidebar selection — all
  three delete actions (request/folder/collection) now share one cleanup
  path instead of drifting independently.
- The Python code-snippet generator no longer emits invalid syntax for a
  JSON body (`true`/`false`/`null` aren't valid Python literals) and now
  actually includes `import requests`. The fetch and Node generators no
  longer send a JSON body as the literal text `"[object Object]"`.

### Changed

- Removed 38 unused `src/components/ui/` scaffold files and the 27
  dependencies used only by them, plus one independently-unused dependency
  (`zod`).
- Updated all dependencies within their existing `package.json` semver
  ranges.

### Added

- Unit test coverage for `compare.ts`, `fuzzy.ts`, and
  `download-response.ts`, previously untested; raised the coverage floor in
  `vitest.config.ts` to match.
- A `version` field on `package.json`.
- This changelog.
