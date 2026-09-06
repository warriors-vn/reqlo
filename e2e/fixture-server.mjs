// A dependency-free stand-in for the public API the e2e specs used to call.
// Started by playwright.config.ts alongside the dev server; see e2e/fixture.ts
// for why the suite no longer talks to a third party.
import { createServer } from "node:http";

const port = Number(process.env.REQLO_E2E_FIXTURE_PORT ?? 8181);

/** Mirrors the shape of the resource the specs used to fetch, so the
 * assertions ("userId", "id": 2) still describe a realistic JSON body. */
function todo(id) {
  return { userId: 1, id, title: "delectus aut autem", completed: false };
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://127.0.0.1:${port}`);
  const match = pathname.match(/^\/todos\/(\d+)$/);

  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body, null, 2));
  };

  if (pathname === "/health") return send(200, { ok: true });
  if (match) return send(200, todo(Number(match[1])));
  send(404, { error: `No fixture for ${pathname}` });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`e2e fixture server listening on http://127.0.0.1:${port}`);
});
