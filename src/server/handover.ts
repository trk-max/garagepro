import "server-only";
import type { Prisma } from "@prisma/client";
import { createId } from "@/lib/id";
import { displayPlate, woNumber } from "@/lib/format";
import { OLD_PARTS_FR, readChecklist, type HandoverChecklist } from "@/lib/handover";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { cleanSignerName, parseSignaturePng, recordSignatureTx, sha256, storeSignatureFiles, type SignatureInput } from "@/server/signatures";

/**
 * V16 Lot 4 — vehicle handover (bon de restitution): mileage and fuel at departure, checklist (work explained,
 * replaced parts returned / left / kept for the warranty, keys returned, cleanliness), DELIVERY photos (media stage)
 * and the customer's DELIVERY signature. Append-only rows (VehicleHandover + Signature). Required before
 * READY → DELIVERED for orders of Lot 4 on (setting requireSignedHandover), see changeStatusTx.
 */

type Tx = Prisma.TransactionClient;

export type HandoverInput = SignatureInput & { mileageOut: number; fuelLevelOut?: number | null; checklist: HandoverChecklist; notes?: string | null };

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function handoverDocument(d: {
  number: number;
  garage: string;
  customer: string;
  plate: string;
  vehicle: string;
  mileageIn: number | null;
  input: HandoverInput;
  lines: string[];
  signer: string;
  at: Date;
  imageHash: string;
}) {
  const c = d.input.checklist;
  const yes = (b: boolean) => (b ? "Oui" : "Non");
  const rows = [
    ["Kilométrage à l'entrée", d.mileageIn !== null ? `${d.mileageIn} km` : "—"],
    ["Kilométrage à la sortie", `${d.input.mileageOut} km`],
    ["Carburant à la sortie", d.input.fuelLevelOut ? `${d.input.fuelLevelOut}/4` : "—"],
    ["Travaux expliqués au client", yes(c.workExplained)],
    ["Pièces remplacées", OLD_PARTS_FR[c.oldParts]],
    ["Clés rendues", yes(c.keysReturned)],
    ["Véhicule propre", yes(c.clean)],
    ["Remarques", d.input.notes || "—"],
  ];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon de restitution ${esc(woNumber(d.number))}</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:24px auto;max-width:760px;padding:0 16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:start}</style></head><body>
<h1>Bon de restitution — ${esc(woNumber(d.number))}</h1><p><b>${esc(d.garage)}</b></p>
<p>Client : ${esc(d.customer)}<br>Véhicule : ${esc(d.vehicle)} — ${esc(d.plate)}</p>
<table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
<h2>Travaux réalisés</h2><ul>${d.lines.map((l) => `<li>${esc(l)}</li>`).join("") || "<li>—</li>"}</ul>
<p>Véhicule restitué et signé sur tablette par <b>${esc(d.signer)}</b> le ${esc(d.at.toLocaleString("fr-FR", { timeZone: "Africa/Tunis" }))}.<br><small>Empreinte SHA-256 de l'image de la signature : ${esc(d.imageHash)}</small></p>
</body></html>`;
}

/** Records the signed handover of a READY order (permission recordHandover). */
export async function recordHandover(workOrderId: string, input: HandoverInput, actor: StaffUser) {
  if (!can(actor, "recordHandover")) throw new AppError("forbidden", {}, 403);
  const signerName = cleanSignerName(input.signerName);
  const png = parseSignaturePng(input.image);
  if (!Number.isInteger(input.mileageOut) || input.mileageOut < 0 || input.mileageOut > 10_000_000) throw new AppError("invalid", {}, 422);
  if (input.fuelLevelOut !== null && input.fuelLevelOut !== undefined && (input.fuelLevelOut < 1 || input.fuelLevelOut > 4)) throw new AppError("invalid", {}, 422);
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      number: true,
      status: true,
      mileageIn: true,
      customer: { select: { name: true } },
      vehicle: { select: { id: true, plate: true, make: true, model: true, mileage: true } },
      lines: { where: { voidedAt: null, approvalStatus: "APPROVED" }, orderBy: { position: "asc" }, select: { description: true } },
    },
  });
  if (!wo) throw new AppError("notFound", {}, 404);
  if (wo.status !== "READY") throw new AppError("handoverNotReady", {}, 409);
  if (wo.mileageIn !== null && input.mileageOut < wo.mileageIn) throw new AppError("mileageOutLower", { km: wo.mileageIn }, 422);
  const settings = await prisma.setting.findUnique({ where: { id: "garage" }, select: { garageName: true, legalName: true } });
  const at = new Date();
  const checklist = readChecklist(input.checklist);
  const html = handoverDocument({
    number: wo.number,
    garage: settings?.legalName || settings?.garageName || "",
    customer: wo.customer.name,
    plate: displayPlate(wo.vehicle.plate),
    vehicle: `${wo.vehicle.make} ${wo.vehicle.model}`,
    mileageIn: wo.mileageIn,
    input: { ...input, checklist },
    lines: wo.lines.map((l) => l.description),
    signer: signerName,
    at,
    imageHash: sha256(png),
  });
  const files = await storeSignatureFiles(workOrderId, png, html);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WorkOrder" WHERE id = ${workOrderId} FOR UPDATE`;
    const now = await tx.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { status: true } });
    if (now.status !== "READY") throw new AppError("handoverNotReady", {}, 409);
    // Both rows are written once, never updated: the handover id is chosen first so that the signature points to it.
    const handoverId = createId();
    const sig = await recordSignatureTx(tx, actor, { workOrderId, kind: "DELIVERY", signerName, files, refId: handoverId, ip: input.ip, userAgent: input.userAgent });
    const h = await tx.vehicleHandover.create({
      data: {
        id: handoverId,
        workOrderId,
        mileageOut: input.mileageOut,
        fuelLevelOut: input.fuelLevelOut ?? null,
        checklist: checklist as unknown as Prisma.InputJsonValue,
        notes: input.notes?.trim().slice(0, 1000) || null,
        signatureId: sig.id,
        handedOverById: actor.id,
      },
      select: { id: true, createdAt: true },
    });
    // The vehicle's mileage only goes up here (never lowered by a handover).
    if (wo.vehicle.mileage === null || input.mileageOut > wo.vehicle.mileage) {
      await tx.vehicle.update({ where: { id: wo.vehicle.id }, data: { mileage: input.mileageOut } });
    }
    await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { handover: h.id, signatureId: sig.id, mileageOut: input.mileageOut } } });
    await audit(tx, actor, "workOrder.handover", "VehicleHandover", h.id, {
      after: { workOrderId, mileageOut: input.mileageOut, fuelLevelOut: input.fuelLevelOut ?? null, checklist, signatureId: sig.id, documentSha256: files.documentHash },
      ip: input.ip ?? null,
    });
    return { id: h.id, signatureId: sig.id };
  });
}

/** A signed handover made since the order last became READY (delivery check). */
export async function handoverSinceReady(tx: Pick<Tx, "vehicleHandover">, workOrderId: string, readyAt: Date | null): Promise<boolean> {
  return (await tx.vehicleHandover.count({ where: { workOrderId, signatureId: { not: null }, ...(readyAt ? { createdAt: { gte: readyAt } } : {}) } })) > 0;
}

/** Handovers of an order (page and printable bon de restitution). */
export async function listHandovers(workOrderId: string) {
  const rows = await prisma.vehicleHandover.findMany({ where: { workOrderId }, orderBy: { createdAt: "desc" } });
  const ids = [...new Set(rows.map((r) => r.handedOverById).filter((x): x is string => !!x))];
  const sigIds = rows.map((r) => r.signatureId).filter((x): x is string => !!x);
  const [users, sigs] = await Promise.all([
    ids.length ? prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [],
    sigIds.length ? prisma.signature.findMany({ where: { id: { in: sigIds } }, select: { id: true, signerName: true, signedAt: true, documentHash: true, documentKey: true } }) : [],
  ]);
  return rows.map((r) => ({ ...r, checklist: readChecklist(r.checklist), by: users.find((u) => u.id === r.handedOverById)?.name ?? null, signature: sigs.find((s) => s.id === r.signatureId) ?? null }));
}
