#!/usr/bin/env node
/**
 * GaragePro health check — one command that verifies everything the app needs:
 *   npm run doctor
 *
 * Node, dependencies, .env, database (both URLs), photo storage, e-mails (Resend),
 * every AI key and model, and the addresses to open the app from a phone.
 * Never prints a secret (keys are masked). Exit code 1 if something blocking is wrong.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activeDemoAccounts } from "./lib/accounts.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const C = process.stdout.isTTY ? { g: "\x1b[32m", y: "\x1b[33m", r: "\x1b[31m", b: "\x1b[1m", d: "\x1b[2m", x: "\x1b[0m" } : { g: "", y: "", r: "", b: "", d: "", x: "" };
let blocking = 0;
let warnings = 0;
const ok = (msg) => console.log(`  ${C.g}✓${C.x} ${msg}`);
const warn = (msg, fix) => {
  warnings++;
  console.log(`  ${C.y}⚠${C.x} ${msg}${fix ? `\n      ${C.d}→ ${fix}${C.x}` : ""}`);
};
/** Red cross. Only blocking problems (app cannot start or work) stop start.cmd. */
let problems = 0;
const fail = (msg, fix, isBlocking = true) => {
  if (isBlocking) blocking++;
  else problems++;
  console.log(`  ${C.r}✗${C.x} ${msg}${fix ? `\n      ${C.d}→ ${fix}${C.x}` : ""}`);
};
const title = (t) => console.log(`\n${C.b}${t}${C.x}`);
const mask = (s) => (s && s.length > 8 ? `…${s.slice(-4)}` : "…");
const split = (v) => (v ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

async function get(url, headers = {}, ms = 10_000) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
    let body = null;
    try {
      body = await res.json();
    } catch {}
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, error: e?.name === "TimeoutError" ? "trop lent (timeout)" : "pas de connexion" };
  }
}

console.log(`${C.b}GaragePro — vérification complète${C.x}  ${C.d}${ROOT}${C.x}`);

// ── 1. Outils ───────────────────────────────────────────────────────────────
title("1. Outils");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20) fail(`Node.js ${process.versions.node} trop ancien`, "installez Node 22 LTS : winget install -e --id OpenJS.NodeJS.LTS");
else if (major < 22 || (major === 22 && minor < 12)) warn(`Node.js ${process.versions.node} : l'app marche, mais les tests demandent 22.12+`, "winget upgrade -e --id OpenJS.NodeJS.LTS");
else ok(`Node.js ${process.versions.node}`);

if (!existsSync("node_modules")) fail("Dépendances non installées", "npm install");
else {
  try {
    require("@prisma/client");
    ok("Dépendances installées (Prisma prêt)");
  } catch {
    fail("Client Prisma non généré", "npx prisma generate");
  }
}
// A package-lock.json in a parent folder confuses Next.js ("multiple lockfiles").
for (let dir = path.dirname(ROOT); dir !== path.dirname(dir); dir = path.dirname(dir)) {
  const stray = path.join(dir, "package-lock.json");
  if (existsSync(stray) && !existsSync(path.join(dir, "package.json"))) warn(`Fichier inutile trouvé : ${stray}`, `supprimez-le : del "${stray}"`);
}

// ── 2. Fichier .env ─────────────────────────────────────────────────────────
title("2. Configuration (.env)");
if (!existsSync(".env")) {
  fail("Fichier .env absent", "copy .env.example .env  puis  notepad .env");
} else {
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  const seen = new Map();
  for (const line of lines) {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (m) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupes.length) warn(`Variables en double dans .env : ${dupes.join(", ")}`, "gardez une seule ligne par variable (la dernière l'emporte)");
  for (const legacy of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "INGEST_WEBHOOK_SECRET"]) if (seen.has(legacy)) warn(`${legacy} ne sert pas à GaragePro`, "supprimez la ligne");
  try {
    process.loadEnvFile(".env");
    ok(".env lu");
  } catch (e) {
    fail(".env illisible (guillemet oublié ?)", String(e?.message ?? e));
  }
}
const env = process.env;
const placeholder = /PASSWORD\]|NOUVEAU_MDP|\[YOUR-PASSWORD\]|:PASSWORD@|postgres\.xxxx|NOUVELLE_CLE|ta_clé/i;
for (const k of ["DATABASE_URL", "DIRECT_URL"]) {
  if (!env[k]) fail(`${k} manquant`, "Supabase → Connect → ORMs → Prisma");
  else if (placeholder.test(env[k])) fail(`${k} contient encore un texte d'exemple (mot de passe non remplacé)`, "remplacez-le par le vrai mot de passe");
}
if (env.DATABASE_URL && !/pgbouncer=true/.test(env.DATABASE_URL)) warn("DATABASE_URL sans ?pgbouncer=true", "ajoutez ?pgbouncer=true à la fin (port 6543)");
if (!env.AUTH_SECRET) fail("AUTH_SECRET manquant", `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
else if (env.AUTH_SECRET.length < 32) warn("AUTH_SECRET trop court", "générez-en un nouveau (32 caractères ou plus)");
else ok("AUTH_SECRET présent");

// ── 3. Base de données ──────────────────────────────────────────────────────
title("3. Base de données (Supabase)");
const DB_HINTS = {
  P1000: "mot de passe refusé : refaites Reset database password et recopiez-le dans DATABASE_URL ET DIRECT_URL",
  P1001: "serveur injoignable : Internet ? projet Supabase en pause ?",
  P1002: "serveur trop lent : réessayez",
  P1003: "base introuvable : vérifiez la fin de l'adresse (/postgres)",
  P1013: "adresse mal écrite : un caractère spécial (@ # / %) dans le mot de passe ?",
  P2021: "tables absentes : npx prisma migrate deploy",
};
async function checkDb(label, url) {
  if (!url || blocking && placeholder.test(url)) return false;
  let PrismaClient;
  try {
    ({ PrismaClient } = require("@prisma/client"));
  } catch {
    return false;
  }
  const prisma = new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    await Promise.race([prisma.$queryRawUnsafe("SELECT 1"), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "P1002" })), 15_000))]);
    ok(`${label} : connexion OK`);
    return prisma;
  } catch (e) {
    const code = e?.errorCode ?? e?.code ?? /P\d{4}/.exec(String(e?.message))?.[0];
    fail(`${label} : connexion impossible${code ? ` (${code})` : ""}`, DB_HINTS[code] ?? String(e?.message ?? e).split("\n").filter(Boolean).slice(-1)[0]);
    await prisma.$disconnect().catch(() => {});
    return false;
  }
}
const db = await checkDb("DATABASE_URL (app, port 6543)", env.DATABASE_URL);
const direct = await checkDb("DIRECT_URL (migrations, port 5432)", env.DIRECT_URL);
if (direct) await direct.$disconnect();
if (db) {
  try {
    const [settings, users, admins, activeUsers] = await Promise.all([
      db.setting.count(),
      db.user.count({ where: { isActive: true } }),
      db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } }),
      db.user.findMany({ where: { isActive: true }, select: { email: true, role: true, isActive: true } }),
    ]);
    ok(`Tables présentes · ${users} utilisateur(s) actif(s)`);
    if (!settings) warn("Paramètres du garage absents", "npm run db:seed (ajoute les données de base sans rien effacer)");
    if (!admins.length) fail("Aucun administrateur actif", "personne ne peut gérer le garage");
    // Every role: any active demo account (public password "password123") gives that role to anyone.
    const demo = activeDemoAccounts(activeUsers);
    if (demo.length) {
      warn(
        `Compte(s) de démo encore actif(s) : ${demo.map((a) => `${a.email} (${a.role})`).join(", ")}`,
        'mot de passe public "password123" : créez votre admin (npm run reset-access -- --create-admin EMAIL MOTDEPASSE "Nom"), puis désactivez TOUS les comptes @garage.tn (Paramètres → Équipe)',
      );
    }
    const applied = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`).catch(() => null);
    if (applied) ok(`Migrations appliquées : ${applied[0].n}`);
    else warn("Historique des migrations absent", "voir README → Migrations Prisma");
  } catch (e) {
    const code = e?.code;
    fail(`Lecture des tables impossible${code ? ` (${code})` : ""}`, DB_HINTS[code] ?? "npx prisma migrate deploy");
  }
  await db.$disconnect();
}

// ── 4. Photos ───────────────────────────────────────────────────────────────
title("4. Photos (Supabase Storage)");
if (!env.SUPABASE_STORAGE_BUCKET) warn("Stockage Supabase non configuré : photos enregistrées dans le dossier ./storage du PC", "obligatoire pour Vercel : SUPABASE_STORAGE_BUCKET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
else if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail("Stockage incomplet", "il faut aussi NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY", false);
else {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await get(`${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/bucket/${env.SUPABASE_STORAGE_BUCKET}`, { apikey: key, Authorization: `Bearer ${key}` });
  if (r.status === 200) ok(`Bucket « ${env.SUPABASE_STORAGE_BUCKET} » OK${r.body?.public ? " ⚠ public" : " (privé)"}`);
  else if (r.status === 0) fail(`Supabase Storage injoignable : ${r.error}`, "vérifiez NEXT_PUBLIC_SUPABASE_URL", false);
  else if (r.status === 404 || r.status === 400) fail(`Bucket « ${env.SUPABASE_STORAGE_BUCKET} » introuvable`, "Supabase → Storage → New bucket (non public)", false);
  else fail(`Clé Storage refusée (HTTP ${r.status}, clé ${mask(key)})`, "Supabase → API Keys → nouvelle clé secrète", false);
}

// ── 5. E-mails ──────────────────────────────────────────────────────────────
title("5. E-mails (Resend puis Gmail/SMTP)");
if (!env.RESEND_API_KEY) console.log(`    ${C.d}Resend non configuré${C.x}`);
else {
  const r = await get("https://api.resend.com/domains", { Authorization: `Bearer ${env.RESEND_API_KEY}` });
  if (r.status === 200) ok(`Clé Resend valide (${mask(env.RESEND_API_KEY)}) · domaines vérifiés : ${(r.body?.data ?? []).filter((d) => d.status === "verified").map((d) => d.name).join(", ") || "aucun"}`);
  else if (r.status === 401 && /restricted/i.test(JSON.stringify(r.body))) ok(`Clé Resend valide (accès envoi uniquement, ${mask(env.RESEND_API_KEY)})`);
  else if (r.status === 0) warn(`Resend injoignable : ${r.error}`);
  else fail(`Clé Resend refusée (HTTP ${r.status}, clé ${mask(env.RESEND_API_KEY)})`, "resend.com → API Keys → Create API Key", false);
  if (!env.SUPPORT_FROM_EMAIL) fail("SUPPORT_FROM_EMAIL manquant", 'SUPPORT_FROM_EMAIL="Garage <onboarding@resend.dev>"', false);
  else if (/resend\.dev/.test(env.SUPPORT_FROM_EMAIL) && !env.SMTP_USER) warn("Expéditeur onboarding@resend.dev : e-mails envoyés UNIQUEMENT à l'adresse de votre compte Resend", "ajoutez votre Gmail (SMTP_USER + SMTP_PASS) : il prendra le relais pour les clients");
  else ok(`Expéditeur : ${env.SUPPORT_FROM_EMAIL}`);
}

if (env.SMTP_USER || env.SMTP_PASS) {
  if (!env.SMTP_USER || !env.SMTP_PASS) fail("SMTP incomplet", "il faut SMTP_USER et SMTP_PASS", false);
  else {
    try {
      const nodemailer = require("nodemailer");
      const port = Number(env.SMTP_PORT || 465);
      const t = nodemailer.createTransport({
        host: env.SMTP_HOST || "smtp.gmail.com",
        port,
        secure: port === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s+/g, "") },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
      });
      await t.verify();
      ok(`SMTP (${env.SMTP_HOST || "Gmail"}) : connexion OK avec ${env.SMTP_USER}`);
    } catch (e) {
      const m = String(e?.message ?? e);
      if (/535|not accepted|BadCredentials/i.test(m)) fail(`SMTP : mot de passe refusé pour ${env.SMTP_USER}`, "il faut un « mot de passe d'application » Google (16 lettres), pas le mot de passe normal", false);
      else fail(`SMTP injoignable : ${m.split("\n")[0]}`, "connexion Internet ? port 465 bloqué par le réseau ?", false);
    }
  }
} else if (!env.RESEND_API_KEY) warn("Ni Gmail (SMTP) ni Resend : aucun e-mail automatique", "le plus simple : SMTP_USER + SMTP_PASS (voir .env.example)");

// ── 6. Assistant IA ─────────────────────────────────────────────────────────
title("6. Assistant IA (le guide à choix marche toujours, même sans IA)");
const { providers } = JSON.parse(readFileSync("src/server/ai-providers.json", "utf8"));
const checks = [];
for (const [id, p] of Object.entries(providers)) {
  const keys = [...new Set([...split(env[`${p.env}_API_KEY`] ?? env[`${p.env}_API_KEYS`]), ...(id === "gemini" && !env.AI_BASE_URL ? split(env.AI_API_KEY) : [])])];
  const custom = split(env[`${p.env}_MODEL`]);
  const models = custom.length ? custom : p.models;
  for (const key of keys) checks.push({ label: p.label, base: p.baseUrl, key, models, keyUrl: p.keyUrl });
}
if (env.AI_BASE_URL) for (const key of split(env.AI_API_KEY)) checks.push({ label: "Serveur perso", base: env.AI_BASE_URL.replace(/\/?$/, "/"), key, models: split(env.AI_MODEL), keyUrl: "" });

if (!checks.length) warn("Aucune clé IA : seul le guide à choix est proposé", "ajoutez GEMINI_API_KEY, GROQ_API_KEY… (voir .env.example)");
// Anthropic (Claude) lists its models with its own headers, not "Authorization: Bearer".
const authHeaders = (c) =>
  /anthropic\.com/i.test(c.base) ? { "x-api-key": c.key, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${c.key}` };
const results = await Promise.all(checks.map(async (c) => ({ c, r: await get(`${c.base}models`, authHeaders(c)) })));
let aiOk = 0;
for (const { c, r } of results) {
  const name = `${c.label} (clé ${mask(c.key)})`;
  if (r.status === 0) {
    warn(`${name} : ${r.error}`, c.label === "Serveur perso" ? "le serveur (Ollama…) est-il lancé ?" : "connexion Internet ?");
    continue;
  }
  if (r.status === 401 || r.status === 403 || (r.status === 400 && /key/i.test(JSON.stringify(r.body)))) {
    fail(`${name} : clé refusée`, `recopiez la clé en entier, ou créez-en une nouvelle : ${c.keyUrl}`, false);
    continue;
  }
  if (r.status !== 200) {
    const detail = r.body?.error?.message ?? r.body?.message ?? "";
    warn(`${name} : réponse HTTP ${r.status}${detail ? ` (${String(detail).slice(0, 140)})` : ""}`);
    continue;
  }
  const available = new Set((r.body?.data ?? r.body?.models ?? []).map((m) => String(m.id ?? m.name ?? "").replace(/^models\//, "")));
  // An alias ("claude-haiku-4-5") counts when a dated version of it is listed.
  const exists = (m) => available.has(m) || [...available].some((id) => id.startsWith(`${m}-`));
  const usable = c.models.filter((m) => !available.size || exists(m));
  const missing = c.models.filter((m) => available.size && !exists(m));
  if (usable.length) {
    aiOk++;
    ok(`${name} : clé valide · modèles utilisables : ${usable.join(", ")}`);
  } else {
    // OpenRouter lists hundreds of paid models: only suggest the free ones (":free").
    const all = [...available];
    const free = /openrouter/i.test(c.base) ? all.filter((m) => m.endsWith(":free")) : all;
    const tip = free.length ? `choisissez parmi : ${free.slice(0, 6).join(", ")}` : "aucun modèle gratuit disponible avec cette clé : supprimez-la du .env";
    fail(`${name} : clé valide mais aucun modèle configuré n'existe`, tip, false);
  }
  if (missing.length && usable.length) warn(`${c.label} : modèle(s) introuvable(s), ignoré(s) automatiquement : ${missing.join(", ")}`);
}
if (checks.length) (aiOk ? ok : warn)(`${aiOk} clé(s) IA prête(s) sur ${checks.length}`);

// ── 7. Ouvrir sur un téléphone / autre PC ───────────────────────────────────
title("7. Ouvrir l'application sur un autre appareil du même Wi-Fi");
const addrs = Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
  (list ?? []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => ({ name, ip: a.address })),
);
const virtual = (a) => /virtual|vbox|vmware|hyper-v|vethernet|wsl|docker/i.test(a.name) || a.ip.startsWith("192.168.56.");
const real = addrs.filter((a) => !virtual(a));
if (!real.length) warn("Aucun réseau Wi-Fi / Ethernet détecté");
for (const a of real) ok(`http://${a.ip}:3000   ${C.d}(${a.name})${C.x}`);
for (const a of addrs.filter(virtual)) console.log(`    ${C.d}ignoré : ${a.ip} (${a.name}, réseau virtuel, pas joignable depuis un téléphone)${C.x}`);
console.log(`    ${C.d}Au premier lancement, Windows demande l'accès réseau pour Node.js : cochez « Réseaux privés » → Autoriser.${C.x}`);

// ── Bilan ───────────────────────────────────────────────────────────────────
console.log(
  `\n${blocking ? `${C.r}${C.b}✗ ${blocking} problème(s) bloquant(s)` : `${C.g}${C.b}✓ L'application peut démarrer`}${C.x}` +
    (problems ? `  ${C.r}${problems} option(s) en erreur (photos, e-mails ou IA)${C.x}` : "") +
    (warnings ? `  ${C.y}${warnings} avertissement(s)${C.x}` : "") +
    "\n",
);
process.exit(blocking ? 1 : 0);
