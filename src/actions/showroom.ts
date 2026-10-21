"use server";

import { revalidatePath } from "next/cache";
import { fmt } from "@/lib/format";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { isListingStatus, type PublishProblem } from "@/lib/showroom";
import { listingSchema } from "@/lib/showroom-validators";
import { formToObject, id } from "@/lib/validators";
import { createListing, historyDraft, removeListingMedia, setListingStatus, updateListing, updateListingMedia, type MediaPatch } from "@/server/showroom";

/** Showroom (V9). Each server function checks ownership again (seller = own listings only). */

function refresh(listingId?: string) {
  revalidatePath("/garage/showroom");
  if (listingId) revalidatePath(`/garage/showroom/${listingId}`);
  revalidatePath("/showroom");
}

/** "Publication impossible : il manque le prix, une photo visible." — in the reader's language. */
async function explain(error: unknown) {
  if (error instanceof AppError && error.code === "listingIncomplete") {
    const { t } = await getI18n();
    const names = String(error.vars.missing ?? "")
      .split(",")
      .filter(Boolean)
      .map((k) => t.showroom.staff.publishMissing[k as PublishProblem] ?? k);
    return { ok: false as const, error: fmt(t.errors.listingIncomplete, { missing: names.join(", ") }) };
  }
  return toActionError(error);
}

export async function createListingAction(form: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const actor = await requirePermission("createListing");
    const listing = await createListing(actor, listingSchema.parse(formToObject(form)));
    refresh();
    return { ok: true, data: { redirectTo: `/garage/showroom/${listing.id}` } };
  } catch (error) {
    return explain(error);
  }
}

export async function updateListingAction(listingId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("createListing");
    await updateListing(actor, id.parse(listingId), listingSchema.parse(formToObject(form)));
    refresh(listingId);
    return { ok: true, data: null };
  } catch (error) {
    return explain(error);
  }
}

export async function setListingStatusAction(listingId: string, to: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("createListing");
    if (!isListingStatus(to)) throw new AppError("invalid", {}, 422);
    await setListingStatus(actor, id.parse(listingId), to);
    refresh(listingId);
    return { ok: true, data: null };
  } catch (error) {
    return explain(error);
  }
}

const MEDIA_OPS = ["show", "hide", "cover", "up", "down", "remove"] as const;

export async function listingMediaAction(mediaId: string, op: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("createListing");
    const mid = id.parse(mediaId);
    if (!(MEDIA_OPS as readonly string[]).includes(op)) throw new AppError("invalid", {}, 422);
    let listingId: string;
    if (op === "remove") listingId = await removeListingMedia(actor, mid);
    else {
      const patch: MediaPatch =
        op === "show" ? { isPublic: true } : op === "hide" ? { isPublic: false } : op === "cover" ? { cover: true } : { move: op as "up" | "down" };
      listingId = await updateListingMedia(actor, mid, patch);
    }
    refresh(listingId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Draft of the public history summary (the form shows it; nothing is saved here). */
export async function historyDraftAction(listingId: string): Promise<ActionResult<{ text: string }>> {
  try {
    const actor = await requirePermission("createListing");
    return { ok: true, data: { text: await historyDraft(actor, id.parse(listingId)) } };
  } catch (error) {
    return toActionError(error);
  }
}
