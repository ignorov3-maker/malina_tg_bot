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
const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const html = `${index}\n${privacy}\n${references}`;

test("site contains no data-entry or submission mechanisms", () => {
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<(?:input|textarea|select)\b/i);
  assert.doesNotMatch(`${html}\n${galleryScript}`, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage)\b/i);
  assert.match(index, /href="mailto:tipo\.malina@mail\.ru"/i);
  assert.match(index, /href="https:\/\/yandex\.ru\/maps\/959\/sevastopol\/house\/ulitsa_borisova_1_7\/Z0oYcgNjS0wHQFpufXl5dH5qZA==\/"/i);
  assert.match(index, /href="https:\/\/max\.ru\/u\/f9LHodD0cOIs1AilU30kqkItviyj9LB4zMN5PxjAgb7NSpBiFRblPg5MD1c"/i);
  assert.match(index, /href="https:\/\/max\.ru\/u\/f9LHodD0cOLRx4pXHHhTWx_PcOHrQflHXTTH00_vcAIuDhbOthbekw5eF5U"/i);
  assert.doesNotMatch(index, /href="tel:/i);
  assert.doesNotMatch(`${index}\n${references}`, /09:00|18:00/i);
  assert.doesNotMatch(index, /<script\b/i);
  assert.doesNotMatch(privacy, /<script\b/i);
  assert.match(references, /<script\s+src="gallery\.js[^\"]*"\s+defer><\/script>/i);
});

test("site contains no analytics or embedded third-party content", () => {
  assert.doesNotMatch(html, /<(?:iframe|embed|object)\b/i);
  assert.doesNotMatch(html, /(?:metrika|analytics|googletagmanager|gtag\s*\(|ym\s*\(|pixel)/i);
});

test("privacy policy matches the actual operator and site configuration", () => {
  assert.match(privacy, /ИП Романовская Светлана Евгеньевна/);
  assert.match(privacy, /ИНН[\s\S]*643890704502/);
  assert.match(privacy, /malina92\.ru/);
  assert.match(privacy, /Beget/);
  assert.match(privacy, /на сайте нет форм, личного кабинета, встроенного чата/i);
  assert.doesNotMatch(privacy, /Пузин|tipografiakrd|Onicon|LiveInternet|Яндекс\.Метрик|Google Analytics|регистрац|форма заявки/i);
});

test("production domain is declared consistently", () => {
  assert.match(index, /rel="canonical" href="https:\/\/malina92\.ru\/"/i);
  assert.match(privacy, /rel="canonical" href="https:\/\/malina92\.ru\/privacy\.html"/i);
  assert.match(references, /rel="canonical" href="https:\/\/malina92\.ru\/references\.html"/i);
  assert.match(robots, /Sitemap: https:\/\/malina92\.ru\/sitemap\.xml/i);
  for (const page of ["https://malina92.ru/", "https://malina92.ru/privacy.html", "https://malina92.ru/references.html"]) {
    assert.match(sitemap, new RegExp(`<loc>${page.replaceAll(".", "\\.")}</loc>`));
  }
});

test("public wording presents the image collection as completed work", () => {
  assert.match(index, /Смотреть всю галерею/);
  assert.match(references, /Галерея работ/);
  assert.doesNotMatch(`${index}\n${references}`, /референс/i);
});

test("VK, MAX and map contacts are external, privacy-preserving links", () => {
  for (const host of ["vk.ru", "max.ru", "yandex.ru"]) {
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

test("gallery uses sized previews and keeps originals for large viewing", () => {
  const cards = [...references.matchAll(/<a class="reference-card" href="assets\/references\/(reference-\d{3}\.jpg)"[^>]*><img src="assets\/references\/previews\/\1" width="(\d+)" height="(\d+)"[^>]*>/g)];
  assert.equal(cards.length, 288);
  for (const [, name, width, height] of cards) {
    assert.ok(Number(width) > 0 && Number(height) > 0);
    assert.ok(fs.existsSync(path.join(root, "assets", "references", "previews", name)));
  }
  assert.match(references, /class="pill-button" href="\.\/">На главную/);
});

test("services keep the requested order and eight distinct color themes", () => {
  const services = [...index.matchAll(/<article class="service-card ([^"]+)">[\s\S]*?<div class="service-number">(\d{2})<\/div>[\s\S]*?<h3>([^<]+)<\/h3>/g)]
    .map(([, theme, number, title]) => ({ theme, number, title }));
  assert.deepEqual(services.map(({ number, title }) => `${number} ${title}`), [
    "01 Полиграфия",
    "02 Сувенирная продукция",
    "03 Широкоформатная печать",
    "04 Наклейки и таблички",
    "05 Графический дизайн",
    "06 Одежда и текстиль",
    "07 Брендирование авто",
    "08 Вывески",
  ]);
  assert.equal(new Set(services.map(({ theme }) => theme)).size, 8);
});

test("MAX contacts are named in the requested order", () => {
  assert.match(index, /social-max-contacts[^>]*>\s*<a[^>]*>\s*Виктория\s*<\/a>\s*<a[^>]*>\s*Кристина\s*<\/a>/i);
});

test("featured work cards open the exact image in the gallery", () => {
  const workLinks = [...index.matchAll(/class="work-card-link"[^>]*href="references\.html\?work=([^"]+)"/g)];
  assert.equal(workLinks.length, 10);
  for (const [, slug] of workLinks) {
    assert.match(galleryScript, new RegExp(`slug: "${slug}"`));
  }
  assert.match(galleryScript, /URLSearchParams\(window\.location\.search\)/);
  assert.match(galleryScript, /open\(featuredItems, requestedIndex\)/);
});

test("gallery controls avoid iPhone double-tap zoom", () => {
  assert.match(galleryScript, /touchend[\s\S]*passive:\s*false/);
  assert.match(galleryScript, /event\.preventDefault\(\)/);
  assert.match(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /\.lightbox-close,[\s\S]*touch-action:\s*manipulation/);
});

test("external links use safe new-window attributes", () => {
  const links = [...html.matchAll(/<a\b[^>]*href="https:\/\/[^\"]+"[^>]*>/gi)];
  for (const [link] of links) {
    assert.match(link, /target="_blank"/i);
    assert.match(link, /rel="[^"]*noopener[^"]*noreferrer[^"]*"/i);
  }
});

test("footer keeps only the privacy link", () => {
  const footer = index.match(/<footer>[\s\S]*?<\/footer>/i)?.[0] ?? "";
  assert.match(footer, /href="privacy\.html"/i);
  assert.doesNotMatch(footer, /href="references\.html"|href="https:\/\/(?:vk\.ru|max\.ru)/i);
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
