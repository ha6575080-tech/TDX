import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { createCanvas, Image } from "@napi-rs/canvas";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
const web = path.resolve(import.meta.dirname, "..");
const output = path.join(web, ".regression-artifacts");
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.join(web, "lib/receipt-export.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const renderedText = [];
class LogoImage extends Image {
  set src(value) { super.src = fs.readFileSync(path.join(web, "public", value)); }
}
const testModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: testModule, exports: testModule.exports, require, Blob, File, Uint8Array, Uint8ClampedArray,
  setTimeout, clearTimeout, Image: LogoImage,
  document: { createElement(tag) {
    assert.equal(tag, "canvas");
    const canvas = createCanvas(1200, 1640);
    const context = canvas.getContext("2d");
    const drawText = context.fillText.bind(context);
    context.fillText = (...args) => { renderedText.push(args[0]); drawText(...args); };
    canvas.toBlob = (callback) => callback(new Blob([canvas.toBuffer("image/png")], { type: "image/png" }));
    return canvas;
  } },
});
const subject = testModule.exports;
const fixture = { type: "deposit", id: "00000000-0000-4000-8000-000000000001", user: "Sample Member", mobile: "0300-0000000", username: "sample.member", city: "Karachi", amount: 125000, status: "approved", date: "2026-10-29T10:00:00Z", language: "en" };

for (const language of ["en", "ur"]) {
  test(`professional ${language} receipt renders with branding and identical Word artwork`, async () => {
    renderedText.length = 0;
    const data = { ...fixture, language, ...(language === "ur" ? { user: "نمونہ ممبر", city: "کراچی" } : {}) };
    const png = await subject.createReceiptImage(data, language === "ur");
    const pngBytes = Buffer.from(await png.arrayBuffer());
    assert.equal(pngBytes.subarray(1, 4).toString(), "PNG");
    assert.equal(pngBytes.readUInt32BE(16), 1200);
    assert.equal(pngBytes.readUInt32BE(20), 1640);
    assert.ok(pngBytes.length > 40000);
    for (const required of ["TDX INVESTMENT", "0308-3958294", "DIGITALLY SIGNED", fixture.id, "125,000.00", language === "ur" ? "دستی دستخط کی ضرورت نہیں" : "No manual signature required"]) assert.ok(renderedText.includes(required), `missing ${required}`);
    fs.writeFileSync(path.join(output, `receipt-${language}.png`), pngBytes);

    const pdf = await subject.receiptPdf(png);
    const pdfBytes = Buffer.from(await pdf.arrayBuffer());
    assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdfBytes.length < 600000, "receipt PDF should remain practical to share on mobile");
    const pdfSource = pdfBytes.toString("latin1");
    assert.match(pdfSource, /\/Width 1200/);
    assert.match(pdfSource, /\/Height 1640/);
    assert.equal((pdfSource.match(/\/Type \/Page\b/g) ?? []).length, 1);
    fs.writeFileSync(path.join(output, `receipt-${language}.pdf`), pdfBytes);

    const word = await subject.receiptWord(data, png);
    const wordBytes = Buffer.from(await word.arrayBuffer());
    const archive = await JSZip.loadAsync(wordBytes);
    const images = Object.values(archive.files).filter((entry) => /^word\/media\/.*\.png$/.test(entry.name));
    assert.equal(images.length, 1);
    assert.deepEqual(await images[0].async("nodebuffer"), pngBytes);
    const xml = await archive.file("word/document.xml").async("string");
    assert.match(xml, /0308-3958294/);
    assert.match(xml, /DIGITALLY SIGNED/);
    assert.match(xml, /w:w="11906"/);
    fs.writeFileSync(path.join(output, `receipt-${language}.docx`), wordBytes);
  });
}
