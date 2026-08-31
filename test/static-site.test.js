const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
const references = fs.readFileSync(path.join(root, "references.html"), "utf8");
const galleryScript = fs.readFileSync(path.join(root, "gallery.js"), "utf8");
const html = `${index}\n${privacy}\n${references}`;

test("site contains no data-entry or submission mechanisms", () => {
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<(?:input|textarea|select)\b/i);
  assert.doesNotMatch(`${html}\n${galleryScript}`, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage)\b/i);
  assert.doesNotMatch(html, /href="(?:mailto|tel):/i);
  assert.doesNotMatch(index, /<script\b/i);
  assert.doesNotMatch(privacy, /<script\b/i);
  assert.match(references, /<script\s+src="gallery\.js[^\"]*"\s+defer><\/script>/i);
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
  const links = [...references.matchAll(/assets\/references\/(reference-\d{3}\.jpg)/g)];
  const unique = new Set(links.map(([, name]) => name));
  assert.equal(unique.size, 288);
  for (const name of unique) {
    assert.ok(fs.existsSync(path.join(root, "assets", "references", name)), `${name} is missing`);
  }
  const localFiles = fs.readdirSync(path.join(root, "assets", "references")).filter((name) => /\.jpg$/i.test(name));
  assert.equal(localFiles.length, 288);
  const digests = localFiles.map((name) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "assets", "references", name))).digest("hex"));
  assert.equal(new Set(digests).size, 288);
  assert.match(references, /class="gallery-lightbox"/i);
  assert.match(galleryScript, /touchstart/);
  assert.match(galleryScript, /touchend/);
});

test("external links use safe new-window attributes", () => {
  const links = [...html.matchAll(/<a\b[^>]*href="https:\/\/[^\"]+"[^>]*>/gi)];
  for (const [link] of links) {
    assert.match(link, /target="_blank"/i);
    assert.match(link, /rel="[^"]*noopener[^"]*noreferrer[^"]*"/i);
  }
});

test("content security policy blocks connections and forms", () => {
  for (const page of [index, privacy, references]) {
    assert.match(page, /connect-src 'none'/i);
    assert.match(page, /form-action 'none'/i);
  }
  assert.match(index, /script-src 'none'/i);
  assert.match(privacy, /script-src 'none'/i);
  assert.match(references, /script-src 'self'/i);
});
