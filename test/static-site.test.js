const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
const references = fs.readFileSync(path.join(root, "references.html"), "utf8");
const html = `${index}\n${privacy}\n${references}`;

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

test("VK and MAX contacts are external, privacy-preserving links", () => {
  for (const host of ["vk.com", "max.ru"]) {
    const links = [...index.matchAll(new RegExp(`<a\\b[^>]*href="https:\\/\\/${host.replace(".", "\\.")}[^\"]*"[^>]*>`, "gi"))];
    assert.ok(links.length >= 1, `${host} contact link is missing`);
    for (const [link] of links) {
      assert.match(link, /target="_blank"/i);
      assert.match(link, /rel="[^"]*noopener[^"]*noreferrer[^"]*"/i);
    }
  }
  assert.doesNotMatch(index, /telegram|t\.me\//i);
});

test("references page lists every local reference image", () => {
  const links = [...references.matchAll(/assets\/references\/(reference-\d{2}\.jpg)/g)];
  const unique = new Set(links.map(([, name]) => name));
  assert.equal(unique.size, 49);
  assert.ok(!unique.has("reference-23.jpg"));
  assert.ok(!unique.has("reference-25.jpg"));
  for (const name of unique) {
    assert.ok(fs.existsSync(path.join(root, "assets", "references", name)), `${name} is missing`);
  }
});

test("external links use safe new-window attributes", () => {
  const links = [...html.matchAll(/<a\b[^>]*href="https:\/\/[^\"]+"[^>]*>/gi)];
  for (const [link] of links) {
    assert.match(link, /target="_blank"/i);
    assert.match(link, /rel="[^"]*noopener[^"]*noreferrer[^"]*"/i);
  }
});

test("content security policy blocks scripts, connections and forms", () => {
  for (const page of [index, privacy, references]) {
    assert.match(page, /script-src 'none'/i);
    assert.match(page, /connect-src 'none'/i);
    assert.match(page, /form-action 'none'/i);
  }
});
