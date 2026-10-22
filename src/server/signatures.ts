import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, SignatureKind } from "@prisma/client";
import { createId } from "@/lib/id";
import { displayPlate, formatMoney, woNumber } from "@/lib/format";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { SIGNATURE_MAX_BYTES, SIGNER_NAME_MIN, WARNING_LIGHT_FR, readWarningLights } from "@/lib/handover";
import { BODY_ZONE_FR, PARTS_ORIGIN_FR, cleanBodyZones, dtPlain, isPartsOrigin, readRepairClauses, renderRepairClauses } from "@/lib/repair-order";
import { audit, type AuditActor } from "@/server/audit";
import { readObject, putObject } from "@/server/storage";
import { isFinal } from "@/server/workflow";

/**
 * V16 Lot 4 — customer signatures on the counter tablet (home-made canvas, src/components/garage/signature-pad.tsx).
 *
 * - The browser sends a small PNG (data URL, < 300 KB: far below Vercel's 4.5 MB). It is checked here (real PNG
 *   bytes, size) and stored through putObject (local disk on the garage PC, Supabase Storage online) — the hub's
 *   file sync (scripts/hub/media-sync.mjs) copies it to the other side.
 * - A signed document (intake, handover) is frozen as an HTML file stored the same way; its SHA-256 is kept on the
 *   Signature row (documentHash) and checked again when it is displayed.
 * - Signature rows are APPEND-ONLY (database trigger; the hub sync passes): a proof is never changed.
 */

type Tx = Prisma.TransactionClient;

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG bytes of the drawn signature (data URL from the canvas); refused if not a real PNG or too big / empty. */
export function parseSignaturePng(dataUrl: unknown): Buffer {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) throw new AppError("signatureRequired", {}, 422);
  const b64 = dataUrl.slice("data:image/png;base64,".length);
  if (b64.length > Math.ceil((SIGNATURE_MAX_BYTES * 4) / 3) + 4) throw new AppError("signatureTooLarge", {}, 413);
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length < 100 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) throw new AppError("signatureRequired", {}, 422);
  if (bytes.length > SIGNATURE_MAX_BYTES) throw new AppError("signatureTooLarge", {}, 413);
  return bytes;
}

export function cleanSignerName(name: unknown): string {
  const n = typeof name === "string" ? name.trim().slice(0, 120) : "";
  if (n.length < SIGNER_NAME_MIN) throw new AppError("signerNameRequired", {}, 422);
  return n;
}

export type SignatureInput = { signerName: string; image: string; ip?: string | null; userAgent?: string | null };
export type StoredFiles = { imageKey: string; imageHash: string; documentKey: string | null; documentHash: string };

/** Uploads the PNG (and the frozen document) BEFORE the database transaction, like the workshop photos. */
export async function storeSignatureFiles(workOrderId: string, png: Buffer, document?: string): Promise<StoredFiles> {
  const base = `signatures/${workOrderId}/${createId()}`;
  const imageKey = `${base}.png`;
  await putObject(imageKey, png, "image/png");
  const imageHash = sha256(png);
  if (document === undefined) return { imageKey, imageHash, documentKey: null, documentHash: imageHash };
  const documentKey = `${base}.html`;
  const bytes = Buffer.from(document, "utf8");
  await putObject(documentKey, bytes, "text/html; charset=utf-8");
  return { imageKey, imageHash, documentKey, documentHash: sha256(bytes) };
}

/** Writes the append-only Signature row (in the caller's transaction) + journal line. */
export async function recordSignatureTx(
  tx: Tx,
  actor: AuditActor,
  input: { workOrderId: string; kind: SignatureKind; signerName: string; files: StoredFiles; refId?: string | null; ip?: string | null; userAgent?: string | null; id?: string },
) {
  const sig = await tx.signature.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      workOrderId: input.workOrderId,
      kind: input.kind,
      signerName: input.signerName,
      imageKey: input.files.imageKey,
      documentKey: input.files.documentKey,
      documentHash: input.files.documentHash,
      refId: input.refId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      recordedById: actor?.id ?? null,
    },
    select: { id: true, signedAt: true },
  });
  await audit(tx, actor, "signature.create", "Signature", sig.id, {
    after: { workOrderId: input.workOrderId, kind: input.kind, signerName: input.signerName, documentSha256: input.files.documentHash, imageSha256: input.files.imageHash, refId: input.refId ?? null },
    ip: input.ip ?? null,
  });
  return sig;
}

/** Latest signature of a kind on an order (null if none). */
export async function latestSignature(db: Pick<Tx, "signature">, workOrderId: string, kind: SignatureKind) {
  return db.signature.findFirst({ where: { workOrderId, kind }, orderBy: { signedAt: "desc" } });
}

/** The intake was signed by the customer (the intake form and INTAKE photos are then locked). */
export async function intakeSigned(db: Pick<Tx, "signature">, workOrderId: string): Promise<boolean> {
  return (await db.signature.count({ where: { workOrderId, kind: "INTAKE" } })) > 0;
}

// ── Frozen HTML documents ────────────────────────────────────────────────────

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dt = (d: Date) => d.toLocaleString("fr-FR", { timeZone: "Africa/Tunis" });

function page(title: string, body: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:24px auto;max-width:760px;color:#111;padding:0 16px}h1{font-size:20px}h2{font-size:15px;margin:18px 0 6px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:start;vertical-align:top}small{color:#555}.sig{border:1px solid #999;padding:8px}</style></head><body>${body}</body></html>`;
}

const row = (label: string, value: unknown) => `<tr><th>${esc(label)}</th><td>${esc(value === null || value === undefined || value === "" ? "—" : value)}</td></tr>`;

/** Everything printed on the intake (prise en charge) + the signer: the document frozen at the intake signature. */
export async function buildIntakeDocument(tx: Tx, workOrderId: string, signer: { name: string; at: Date; imageHash: string }) {
  const [wo, s] = await Promise.all([
    tx.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        customer: true,
        vehicle: true,
        lines: { where: { voidedAt: null, approvalStatus: { not: "REFUSED" } }, orderBy: { position: "asc" } },
        media: { where: { stage: "INTAKE" }, orderBy: { createdAt: "asc" }, select: { id: true, storageKey: true, caption: true, createdAt: true } },
      },
    }),
    tx.setting.findUnique({ where: { id: "garage" } }),
  ]);
  if (!wo || !s) throw new AppError("notFound", {}, 404);
  const zones = cleanBodyZones(wo.bodyChecklist).map((z) => BODY_ZONE_FR[z]);
  const lights = readWarningLights(wo.warningLights).map((w) => WARNING_LIGHT_FR[w]);
  const clauses = renderRepairClauses(readRepairClauses(s.repairClauses), s);
  const body = `
<h1>Ordre de réparation et prise en charge — ${esc(woNumber(wo.number))}</h1>
<p><b>${esc(s.legalName || s.garageName)}</b><br>${esc(s.legalAddress || s.address || "")} ${esc(s.phone ?? "")}</p>
<h2>Client</h2><table>${row("Nom", wo.customer.name)}${row("Téléphone", wo.customer.phone)}${row("CIN", wo.customer.nationalId)}${row("Adresse", wo.customer.address)}</table>
<h2>Véhicule</h2><table>${row("Immatriculation", displayPlate(wo.vehicle.plate))}${row("Marque / modèle", `${wo.vehicle.make} ${wo.vehicle.model}`)}${row("VIN", wo.vehicle.vin)}${row("Année", wo.vehicle.year)}${row("Kilométrage à l'entrée", wo.mileageIn !== null ? `${wo.mileageIn} km` : null)}${row("Carburant", wo.fuelLevel ? `${wo.fuelLevel}/4` : null)}</table>
<h2>État à l'arrivée</h2><table>${row("Carrosserie (zones)", zones.join(", "))}${row("Constat", wo.bodyDamageNotes)}${row("Voyants allumés", lights.join(", "))}${row("Objets laissés dans le véhicule", wo.itemsLeft)}${row("Nombre de clés remises", wo.keyCount)}</table>
<h2>Demande et accords</h2><table>${row("Demande du client", wo.complaint)}${row("Origine des pièces acceptée", wo.partsOrigin && isPartsOrigin(wo.partsOrigin) ? PARTS_ORIGIN_FR[wo.partsOrigin] : null)}${row("Estimation TTC", wo.estimateTtc ? `${dtPlain(wo.estimateTtc)} DT` : null)}${row("Plafond d'autorisation (travaux sans nouvel accord) TTC", wo.authorizationCeiling ? `${dtPlain(wo.authorizationCeiling)} DT` : null)}${row("Frais de diagnostic acceptés", wo.diagnosticFeeAccepted === null ? null : wo.diagnosticFeeAccepted ? "Oui" : "Non")}${row("Acompte versé", wo.depositAmount ? `${dtPlain(wo.depositAmount)} DT (${wo.depositMethod ?? "CASH"})` : null)}${row("Date promise", wo.promisedAt ? dt(wo.promisedAt) : null)}</table>
${wo.lines.length ? `<h2>Travaux prévus</h2><table><tr><th>Désignation</th><th>Qté</th><th>Total HT</th></tr>${wo.lines.map((l) => `<tr><td>${esc(l.description)}</td><td>${l.quantityX100 / 100}</td><td>${esc(formatMoney(Math.round((l.quantityX100 * l.unitPrice) / 100), "fr"))}</td></tr>`).join("")}</table>` : ""}
<h2>Photos de réception (${wo.media.length})</h2>${wo.media.length ? `<ul>${wo.media.map((m) => `<li>${esc(m.caption ?? "photo")} — ${esc(m.storageKey)} — ${esc(dt(m.createdAt))}</li>`).join("")}</ul>` : "<p>Aucune.</p>"}
<h2>Conditions</h2>${clauses.map((c) => `<p><b>${esc(c.title)}</b><br>${esc(c.body)}</p>`).join("")}
<h2>Signature</h2><div class="sig">Signé sur tablette par <b>${esc(signer.name)}</b> le ${esc(dt(signer.at))}.<br><small>Empreinte SHA-256 de l'image de la signature : ${esc(signer.imageHash)}</small></div>`;
  return page(`Prise en charge ${woNumber(wo.number)}`, body);
}

// ── Intake signature ─────────────────────────────────────────────────────────

/**
 * The customer signs the intake on the tablet (permission signIntake): frozen HTML document + SHA-256, Signature
 * INTAKE (append-only), event + journal. Afterwards the intake form, the check-in mileage and the INTAKE photos are
 * locked (photos can only be hidden). One intake signature per order.
 */
export async function signIntake(workOrderId: string, input: SignatureInput, actor: StaffUser) {
  if (!can(actor, "signIntake")) throw new AppError("forbidden", {}, 403);
  const signerName = cleanSignerName(input.signerName);
  const png = parseSignaturePng(input.image);
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
  if (!wo) throw new AppError("notFound", {}, 404);
  if (isFinal(wo.status)) throw new AppError("final", {}, 409);
  if (await intakeSigned(prisma, workOrderId)) throw new AppError("intakeAlreadySigned", {}, 409);
  const at = new Date();
  const imageHash = sha256(png);
  const html = await buildIntakeDocument(prisma as unknown as Tx, workOrderId, { name: signerName, at, imageHash });
  const files = await storeSignatureFiles(workOrderId, png, html);
  return prisma.$transaction(async (tx) => {
    // Row lock: two clicks at once record ONE signature (the second sees the first one and stops).
    await tx.$queryRaw`SELECT id FROM "WorkOrder" WHERE id = ${workOrderId} FOR UPDATE`;
    if (await intakeSigned(tx, workOrderId)) throw new AppError("intakeAlreadySigned", {}, 409);
    const sig = await recordSignatureTx(tx, actor, { workOrderId, kind: "INTAKE", signerName, files, ip: input.ip, userAgent: input.userAgent });
    await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { intakeSigned: true, signatureId: sig.id, signerName, documentSha256: files.documentHash } } });
    await audit(tx, actor, "workOrder.intakeSigned", "WorkOrder", workOrderId, { after: { signatureId: sig.id, signerName, documentSha256: files.documentHash }, ip: input.ip ?? null });
    return { id: sig.id, documentHash: files.documentHash };
  });
}

/**
 * V16 Lot 3 → Lot 4: the safety waiver signed on the tablet (instead of paper): Signature SAFETY_WAIVER + the
 * same waiver event as the paper box (covers the refused SAFETY lines), journal. Permission recordSafetyWaiver.
 */
export async function signSafetyWaiver(workOrderId: string, lineIds: string[], input: SignatureInput, actor: StaffUser) {
  if (!can(actor, "recordSafetyWaiver")) throw new AppError("forbidden", {}, 403);
  if (lineIds.length === 0) throw new AppError("invalid", {}, 422);
  const signerName = cleanSignerName(input.signerName);
  const files = await storeSignatureFiles(workOrderId, parseSignaturePng(input.image));
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (isFinal(wo.status)) throw new AppError("final", {}, 409);
    const eventId = createId();
    const sig = await recordSignatureTx(tx, actor, { workOrderId, kind: "SAFETY_WAIVER", signerName, files, refId: eventId, ip: input.ip, userAgent: input.userAgent });
    await tx.workOrderEvent.create({ data: { id: eventId, workOrderId, actorId: actor.id, type: "NOTE", data: { safetyWaiver: true, lineIds, signedOnTablet: true, signatureId: sig.id } } });
    await audit(tx, actor, "workOrder.safetyWaiver", "WorkOrderEvent", eventId, { after: { workOrderId, lineIds, signedOnTablet: true, signatureId: sig.id } });
    return { id: sig.id };
  });
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** Signatures of an order (page), with the integrity of each frozen document checked on demand (API route). */
export async function listSignatures(workOrderId: string) {
  return prisma.signature.findMany({ where: { workOrderId }, orderBy: { signedAt: "asc" } });
}

/** Streams the signature image or its frozen document (staff only, checked by the route). */
export async function readSignatureFile(id: string, which: "image" | "document", range: string | null) {
  const sig = await prisma.signature.findUnique({ where: { id }, select: { imageKey: true, documentKey: true } });
  if (!sig) return null;
  if (which === "image") return readObject(sig.imageKey, "image/png", range);
  if (!sig.documentKey) return null;
  return readObject(sig.documentKey, "text/html; charset=utf-8", range);
}

/** Recomputes the SHA-256 of a stored frozen document (« copie intacte » or not). */
export async function documentIntact(id: string): Promise<boolean | null> {
  const sig = await prisma.signature.findUnique({ where: { id }, select: { documentKey: true, imageKey: true, documentHash: true } });
  if (!sig) return null;
  const res = await readObject(sig.documentKey ?? sig.imageKey, "application/octet-stream", null);
  if (!res.ok) return null;
  return sha256(Buffer.from(await res.arrayBuffer())) === sig.documentHash;
}
