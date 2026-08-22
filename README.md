# reqlo [![Framework][framework-img]][framework] [![Bundler][bundler-img]][bundler] [![TypeScript][ts-img]][ts] [![Release][release-img]][release]

``reqlo`` is a local-first HTTP client built with [React](https://reactjs.org) and [TanStack](https://tanstack.com) tooling.

Everything you compose — requests, collections, environments, history — lives in the browser via [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) (through [Dexie](https://dexie.org)), so there's no account, no sync server, and no request ever leaves your machine except the one you actually send.

``reqlo`` may look like [Postman](https://www.postman.com/) or [Insomnia](https://insomnia.rest/) at a glance, but it's built from scratch for a single workflow: open it, paste a cURL command or build a request by hand, send it, and keep working — no cloud workspace required.

**Non-goal:** an account or login is never required to use ``reqlo``'s core features — composing requests, collections, environments, history. That's a hard line, not a default that hasn't been challenged yet; any future sync/team feature has to stay optional on top of it, never a gate in front of it.

Features
--------

* **Collections & nested folders** — organize requests in folders nested to any depth; drag-and-drop to reorder or re-parent.
* **Environments** — swap `{{VARIABLE}}` values per environment without touching the request itself.
* **cURL import** — paste a curl command from your terminal or devtools, get a full request back.
* **Postman import** — import a Postman v2.1 collection directly; anything that can't translate 1:1 (OAuth2, form-data files) surfaces as a clear warning instead of failing silently.
* **Git-friendly export** — export a collection as a folder of plain files instead of one giant JSON blob, so diffs in version control are actually readable.
* **Request chaining** — extract a value from one response (status, header, JSON path) and feed it into a later request.
* **Assertions** — simple pass/fail checks on status or JSON body — no scripting engine, no `eval`.
* **Local mock responses** — flip a request into mock mode and get a saved response back instantly, with zero network calls.
* **History** — every send is recorded and searchable, with side-by-side comparison.
* **Installable & offline** — reqlo is a PWA; install it and it keeps working without a network connection.
* **Durable storage** — asks the browser to treat its IndexedDB data as persistent rather than evictable under disk pressure.

Why this name?
---------------

``req`` for **request**, ``lo`` for **local** — the whole point of the app is that requests stay local. I wanted a name as short as the workflow it describes.

Installation
------------

Clone and install dependencies:

    git clone git@github.com:warriors-vn/reqlo.git
    cd reqlo
    npm ci

Then run the dev server:

    npm run dev
    # open http://localhost:8080

Or run it with Docker (see [Docker](#docker) below).

Usage
-----

``reqlo`` opens with a seeded "Getting Started" collection so there's always something to click. From there:

<h3>Compose a request</h3>
Pick a method, paste a URL, add headers/params/body in the request builder. Every field saves to IndexedDB as you type — there's no save button.<br>

<h3>Import from cURL</h3>
Paste a curl command straight from your terminal or browser devtools; ``reqlo`` parses it into a full request.<br>

```bash
curl -X POST https://api.example.com/v1/items \
  -H 'Content-Type: application/json' \
  -d '{"name": "widget"}'
```

<h3>Template with environments</h3>
Define variables once per environment and reference them anywhere in the URL, headers, or body.<br>

```
{{BASE_URL}}/v1/items/{{ITEM_ID}}
```

<h3>Everything is local history</h3>
Every send is recorded — status, timing, size, response body — searchable and comparable side by side, without ever touching a server you don't control.<br>

Performance
-----------

Large collections and long history lists are virtualized, and Monaco/code-editor bundles are split out of the main chunk so the app stays snappy. Open an issue if you find a slow path — profiling contributions are always welcome.

Docker
------

A multi-stage `Dockerfile` and `docker-compose.yml` are included for a reproducible dev environment.

    docker-compose up --build
    # open http://localhost:8080

Production image:

    docker build --target build -t reqlo:build .
    docker build -t reqlo:prod .
    docker run --rm -p 80:80 reqlo:prod

Git Flow
--------

* Branch off `main`: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`
* Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat(sidebar): add collection delete confirm`)
* Run `npm run lint` before opening a PR
* Open a PR into `main` — squash-merge once it's reviewed, delete the branch after merge
* `main` is always deployable; nothing lands there without a PR

Contributing
------------

* Ping me on Instagram [@tuanelnino9](https://www.instagram.com/tuanelnino9) or [Facebook](https://www.facebook.com/tuanelnino9) or LinkedIn [Tuan Nguyen Van](https://www.linkedin.com/in/tuan-nguyen-van-555315156), DMs, mentions, whatever, [send email](mailto:nguyenvantuan2391996@gmail.com) :))
* Fork the [project](https://github.com/warriors-vn/reqlo)
* Fix [open issues](https://github.com/warriors-vn/reqlo/issues) or request new features

Don't hesitate :))

Authors
-------

* Tuan Nguyen Van

[framework-img]: https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=white
[framework]: https://reactjs.org
[bundler-img]: https://img.shields.io/badge/Bundler-Vite-646cff?logo=vite&logoColor=white
[bundler]: https://vitejs.dev
[ts-img]: https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white
[ts]: https://www.typescriptlang.org
[release-img]: https://img.shields.io/github/v/release/warriors-vn/reqlo
[release]: https://github.com/warriors-vn/reqlo/releases
