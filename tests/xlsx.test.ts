import { describe, expect, it } from "vitest";
import { buildXlsx, columnName, crc32 } from "@/lib/xlsx";

/** Reads a "stored" ZIP back (central directory → local entries), checking every CRC. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const offset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const start = offset + 30 + view.getUint16(offset + 26, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, dec.decode(data));
    p += 46 + nameLen;
  }
  return out;
}

describe("Excel export (.xlsx)", () => {
  it("CRC-32 of a known string", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("column letters", () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });

  it("a valid package: all parts present, every CRC correct", () => {
    const files = unzip(buildXlsx([{ name: "Résumé", rows: [["a"]] }, { name: "Présence", rows: [[1]] }]));
    expect([...files.keys()].sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"].sort(),
    );
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Résumé" sheetId="1" r:id="rId1"/>');
    expect(files.get("[Content_Types].xml")).toContain("/xl/worksheets/sheet2.xml");
  });

  it("numbers stay numbers, text is escaped, formulas are never evaluated, Arabic is kept", () => {
    const files = unzip(buildXlsx([{ name: "S", boldRows: [0], rows: [["Heures", 7.5], ['<b>&"x"', "=SUM(A1)"], ["محمد", null, ""]] }]));
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="B1" s="1"><v>7.5</v></c>');
    expect(sheet).toContain("&lt;b&gt;&amp;&quot;x&quot;");
    expect(sheet).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">=SUM(A1)</t></is></c>');
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("محمد");
    expect(sheet).not.toContain('r="B3"');
  });

  it("control characters are removed (Excel would refuse the file)", () => {
    const sheet = unzip(buildXlsx([{ name: "S", rows: [["a\u0001b\u0008c"]] }])).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain(">abc<");
  });

  it("sheet names: forbidden characters replaced, 31 characters max, duplicates numbered", () => {
    const wb = unzip(buildXlsx([{ name: "a/b?c", rows: [] }, { name: "x".repeat(40), rows: [] }, { name: "A B C", rows: [] }])).get("xl/workbook.xml")!;
    expect(wb).toContain('name="a b c"');
    expect(wb).toContain(`name="${"x".repeat(31)}"`);
    expect(wb).toContain('name="A B C 2"');
  });
});
