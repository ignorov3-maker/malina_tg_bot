const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
const html = `${index}\n${privacy}`;

test("site contains no data-entry or submission mechanisms", () => {
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<(?:input|textarea|select)\b/i);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage)\b/i);
  assert.doesNotMatch(html, /href="(?:mailto|tel):/i);
});

test("site contains no analytics or embedded third-party content", () => {
  assert.doesNotMatch(html, /<(?:iframe|embed|object)\b/i);
  assert.doesNotMatch(html, /(?:metrika|analytics|googletagmanager|gtag\s*\(|ym\s*\(|pixel)/i);
});

test("consultation is an external, privacy-preserving link", () => {
  const links = [...index.matchAll(/<a\b[^>]*href="https:\/\/t\.me\/malinaprinting_bot"[^>]*>/gi)];

  assert.ok(links.length >= 1, "external consultation link is missing");
  for (const [link] of links) {
    assert.match(link, /target="_blank"/i);
    assert.match(link, /rel="[^"]*noopener[^"]*noreferrer[^"]*"/i);
  }
});

test("content security policy blocks scripts, connections and forms", () => {
  for (const page of [index, privacy]) {
    assert.match(page, /script-src 'none'/i);
    assert.match(page, /connect-src 'none'/i);
    assert.match(page, /form-action 'none'/i);
  }
});
