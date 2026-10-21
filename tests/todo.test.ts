/** V10.4 — "À traiter": who sees what, grouping and links (pure rules). */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { groupTodos, TODO_DEFS, TODO_KEYS, todoKeysFor, type TodoCounts } from "@/lib/todo";
import { helpAr } from "@/lib/i18n/help-ar";
import { helpEn } from "@/lib/i18n/help-en";
import { helpFr } from "@/lib/i18n/help-fr";
import { todoAr } from "@/lib/i18n/todo-ar";
import { todoEn } from "@/lib/i18n/todo-en";
import { todoFr } from "@/lib/i18n/todo-fr";

const ROLES: Role[] = ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER", "SELLER", "SHOWROOM_MANAGER", "HR", "ACCOUNTANT"];
const approvals = (role: Role) => todoKeysFor(role).filter((k) => TODO_DEFS[k].group === "approval");
const all: TodoCounts = Object.fromEntries(TODO_KEYS.map((k) => [k, 2]));

describe("V10.4 à traiter — visibility", () => {
  it("approvals only for the roles allowed to decide", () => {
    expect(approvals("MECHANIC")).toEqual([]);
    expect(approvals("RECEPTION")).toEqual(["contractsToSign"]);
    expect(approvals("ADMIN")).toEqual(["leaves", "purchaseOrders", "qualityChecks", "contractsToApprove", "contractsToSign", "warrantyDecisions"]);
    // The manager approves leaves, quality checks, contracts and warranty answers; purchase orders stay with the administrator (approvePurchase).
    expect(approvals("MANAGER")).toEqual(["leaves", "qualityChecks", "contractsToApprove", "contractsToSign", "warrantyDecisions"]);
    // HR: leaves and employment contracts only.
    expect(approvals("HR")).toEqual(["leaves", "contractsToApprove", "contractsToSign"]);
  });

  it("each role sees only its own work", () => {
    for (const role of ROLES) expect(todoKeysFor(role).length, role).toBeGreaterThan(0);
    expect(todoKeysFor("MECHANIC")).toEqual(["vehicleInfo", "warrantyOpen"]);
    expect(todoKeysFor("SELLER")).toEqual(["unreadMessages"]);
    expect(todoKeysFor("STOREKEEPER")).toEqual(["missingParts", "lowStock"]);
    expect(todoKeysFor("ACCOUNTANT")).toEqual(["overdueInvoices", "contractsExpiring"]);
    expect(todoKeysFor("ADMIN")).toEqual([...TODO_KEYS]);
  });

  it("per-user access (V10.3) applies: a granted permission adds the item, a denied one removes it", () => {
    const mechanic = { role: "MECHANIC" as Role, perms: { grant: ["approvePurchase", "manageTeam"] as const, deny: ["viewWorkOrders"] as const } };
    expect(todoKeysFor(mechanic)).toEqual(["warrantyOpen", "leaves", "purchaseOrders"]);
    const admin = { role: "ADMIN" as Role, perms: { grant: [] as const, deny: ["manageSettings", "approvePurchase"] as const } };
    expect(todoKeysFor(admin)).not.toContain("backup");
    expect(groupTodos(all, admin).approval.map((i) => i.key)).not.toContain("purchaseOrders");
    // Without overrides the user object behaves exactly like its role.
    expect(todoKeysFor({ role: "STOREKEEPER", perms: { grant: [], deny: [] } })).toEqual(todoKeysFor("STOREKEEPER"));
  });
});

describe("V10.4 à traiter — grouping", () => {
  it("drops zero counts, keeps the fixed order, splits in two sections and totals", () => {
    const list = groupTodos({ leaves: 3, vehicleInfo: 1, lowStock: 0, overdueInvoices: 4, purchaseOrders: 2 }, "MANAGER");
    expect(list.incomplete.map((i) => i.key)).toEqual(["vehicleInfo", "overdueInvoices"]);
    expect(list.approval.map((i) => [i.key, i.count])).toEqual([["leaves", 3]]); // purchase orders: not for the manager
    expect(list.total).toBe(1 + 4 + 3);
    expect(list.approval[0]?.href).toBe("/garage/equipe");
  });

  it("nothing to do → empty sections", () => {
    expect(groupTodos({}, "ADMIN")).toEqual({ incomplete: [], approval: [], total: 0 });
    expect(groupTodos(all, "MECHANIC").approval).toEqual([]);
  });

  it("every link points to an existing staff page", () => {
    for (const k of TODO_KEYS) {
      const page = (TODO_DEFS[k].href.split("?")[0] ?? "").replace("/garage", "");
      expect(existsSync(path.resolve("src/app/(garage)/garage", `.${page}`, "page.tsx")), k).toBe(true);
    }
  });

  it("every item is translated in the 3 languages", () => {
    for (const d of [todoFr, todoEn, todoAr]) for (const k of TODO_KEYS) expect(d.items[k].length).toBeGreaterThan(3);
  });
});

describe("V10.4 aide", () => {
  it("same sections and links in the 3 languages, all to existing pages", () => {
    const shape = (h: typeof helpFr) => h.sections.map((s) => [s.id, s.links.map((l) => l.href)]);
    expect(shape(helpEn)).toEqual(shape(helpFr));
    expect(shape(helpAr)).toEqual(shape(helpFr));
    expect(helpEn.faq.length).toBe(helpFr.faq.length);
    expect(helpAr.faq.length).toBe(helpFr.faq.length);
    for (const s of helpFr.sections) {
      for (const l of s.links) {
        const p = l.href.split(/[?#]/)[0] ?? "";
        const file = p.startsWith("/garage")
          ? path.resolve("src/app/(garage)/garage", `.${p.replace("/garage", "")}`, "page.tsx")
          : null;
        if (file) expect(existsSync(file), l.href).toBe(true);
      }
    }
  });
});
