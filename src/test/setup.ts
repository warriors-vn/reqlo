// Polyfills `indexedDB` for every test run so any pure-logic module that
// transitively imports db.ts (whose bottom evaluates `new ReqloDB()`) is safe to
// import in Node. In-memory only — never touches a real browser profile.
import "fake-indexeddb/auto";
