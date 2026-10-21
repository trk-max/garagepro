/**
 * V10.5 — the full stock list on the real database: every part (beyond the old 500 cap), the
 * « stock bas » filter, totals, and prices only for finance / stock managers. Run: npm run test:db
 */
import { describe, expect, it } from "vitest";
import { updatePart } from "@/server/parts";
import { stockList } from "@/server/stock-list";
import { makeUser, prisma } from "./helpers/db";

const tag = `sl${Date.now().toString(36)}`;

describe("stockList", () => {
  it("lists all matching parts in pages of 50, with totals over all of them", async () => {
    await prisma.part.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({ sku: `${tag}-${i}`, name: `Pièce ${tag} ${String(i).padStart(3, "0")}`, stockX100: i < 10 ? 0 : 500, minStockX100: i < 30 ? 600 : 100, costPrice: 1_000, salePrice: 2_000 })),
    });
    const admin = await makeUser("ADMIN");
    const p1 = await stockList(admin, { q: tag });
    expect(p1.totals.parts).toBe(120);
    expect(p1.items).toHaveLength(50);
    expect(p1.pages).toBe(3);
    expect((await stockList(admin, { q: tag, page: 3 })).items).toHaveLength(20);
    expect(p1.totals.out).toBe(10);
    expect(p1.totals.low).toBe(20);
    expect(p1.totals.value).toBe(110 * 5_000);
    const low = await stockList(admin, { q: tag, lowOnly: true, sort: "qty", dir: "asc" });
    expect(low.totals.parts).toBe(30);
    expect(low.items[0]?.stockX100).toBe(0);
  });

  it("mechanics: viewStock without prices or value sort; edits are seen right away", async () => {
    const mech = await makeUser("MECHANIC");
    const list = await stockList(mech, { q: tag, sort: "value" });
    expect(list.showMoney).toBe(false);
    expect(list.totals.value).toBe(0);
    expect(list.items.every((r) => r.costPrice === 0 && r.salePrice === 0)).toBe(true);
    expect(list.items[0]?.name).toBe(`Pièce ${tag} 000`);

    const keeper = await makeUser("ADMIN");
    const first = list.items[0]!;
    await updatePart(first.id, { name: `Pièce ${tag} 000 modifiée`, minStockX100: 50 }, keeper);
    const after = await stockList(keeper, { q: `${tag} 000` });
    expect(after.items[0]).toMatchObject({ id: first.id, name: `Pièce ${tag} 000 modifiée`, minStockX100: 50, costPrice: 1_000 });
  });
});
