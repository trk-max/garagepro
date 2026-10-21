import { z } from "zod";
import { MIN_PHONE_DIGITS } from "@/lib/booking";
import { normalizePlate } from "@/lib/format";
import { CONDITIONS, FUELS, GEARBOXES, MESSAGE_MAX, parseEquipment, parseSpecs } from "@/lib/showroom";
import { optionalMoney, optionalText, requiredText } from "@/lib/validators";
import { normalizeVin } from "@/lib/vehicle-info";

/** Showroom and buyer messaging forms (V9). Everything is checked again on the server. */

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optInt = (min: number, max: number) => z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional());
const optEnum = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(emptyToUndefined, z.enum(values).optional());
/** Browsers send textarea line breaks as CRLF: stored as LF, so saving unchanged text is not a change. */
const multiline = (max: number) => z.preprocess((v) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n") : v), optionalText(max));
const checkbox =z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false);

export const listingSchema = z.object({
  make: requiredText(60),
  model: requiredText(60),
  version: optionalText(80),
  year: optInt(1950, 2100),
  mileage: optInt(0, 2_000_000),
  fuel: optEnum(FUELS),
  gearbox: optEnum(GEARBOXES),
  engineCc: optInt(0, 10_000),
  powerHp: optInt(0, 2_000),
  fiscalHp: optInt(0, 100),
  doors: optInt(1, 9),
  seats: optInt(1, 12),
  colorExt: optionalText(40),
  colorInt: optionalText(40),
  condition: optEnum(CONDITIONS),
  /** Typed in dinars, stored in millimes. */
  price: optionalMoney,
  description: multiline(5000),
  equipment: z.string().max(8000).optional().default("").transform(parseEquipment),
  specs: z.string().max(8000).optional().default("").transform(parseSpecs),
  historySummary: multiline(3000),
  historyPublic: checkbox,
  plate: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(20).transform(normalizePlate).optional()),
  vin: z.preprocess(emptyToUndefined, z.string().trim().max(40).transform(normalizeVin).optional()),
  /** Only used when the actor may manage every listing (reassign to another seller). */
  sellerId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
});
export type ListingInput = z.infer<typeof listingSchema>;

const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+\d\s().-]+$/)
  .refine((p) => p.replace(/\D/g, "").length >= MIN_PHONE_DIGITS);

const body = z
  .string()
  .transform((s) => s.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim())
  .pipe(z.string().min(1).max(MESSAGE_MAX));

/** "Contacter le vendeur": no account — a name, a phone and/or an e-mail, a message. */
export const buyerContactSchema = z
  .object({
    name: requiredText(80),
    phone: z.preprocess(emptyToUndefined, phone.optional()),
    email: z.preprocess(emptyToUndefined, z.string().trim().email().max(120).optional()),
    message: body,
    /** Honeypot: hidden field, must stay empty (bots fill it). */
    website: z.string().max(0).optional().default(""),
  })
  .refine((v) => !!v.phone || !!v.email, { message: "contactRequired", path: ["phone"] });
export type BuyerContact = z.infer<typeof buyerContactSchema>;

export const messageSchema = z.object({ body, website: z.string().max(0).optional().default("") });
