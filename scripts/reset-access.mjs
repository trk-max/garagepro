/**
 * Unblock a team login from the command line (no need to be logged in).
 *
 *   npm run reset-access                         → list accounts (active? blocked?)
 *   npm run reset-access -- email@garage.tn      → unblock + reactivate that account
 *   npm run reset-access -- email@garage.tn Pass → same, and set a new password (8+ chars)
 *   npm run reset-access -- --create-admin you@example.com "Password" "Your name"
 *                                                → create the FIRST admin (no demo seed needed)
 *
 * Touches only that user (and the failed-login counters). Never deletes data.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { activeDemoAccounts, validateNewAdmin } from "./lib/accounts.mjs";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const LOCK_MINUTES = 15;

try {
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  if (args[0] === "--create-admin") {
    // First install on a real database: create your own admin instead of seeding
    // the demo accounts (public password "password123").
    const input = validateNewAdmin({ email: args[1], password: args[2], name: args.slice(3).join(" ") });
    if (!input.ok) {
      console.error(`\n✗ ${input.error}\n  Usage : npm run reset-access -- --create-admin EMAIL MOTDEPASSE "Votre nom"\n`);
      process.exitCode = 1;
    } else if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      console.error(`\n✗ Le compte ${input.email} existe déjà. Pour changer son mot de passe : npm run reset-access -- ${input.email} NOUVEAU_MOT_DE_PASSE\n`);
      process.exitCode = 1;
    } else {
      await prisma.user.create({
        data: { email: input.email, name: input.name, role: "ADMIN", isActive: true, passwordHash: await bcrypt.hash(input.password, 12) },
      });
      console.log(`\n✓ Administrateur créé : ${input.name} (${input.email}). Connectez-vous sur /login.`);
      const demo = activeDemoAccounts(await prisma.user.findMany({ select: { email: true, isActive: true } }));
      if (demo.length) console.log(`  ⚠ Comptes de démo encore actifs : ${demo.map((u) => u.email).join(", ")} → désactivez-les (Paramètres → Équipe).`);
      console.log("");
    }
  } else if (!args[0]) {
    const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: { email: true, name: true, role: true, isActive: true } });
    console.log("\nComptes de l'équipe :\n");
    for (const u of users) {
      const fails = await prisma.portalAttempt.count({ where: { key: `login:email:${u.email}`, ok: false, createdAt: { gte: since } } });
      const state = !u.isActive ? "DÉSACTIVÉ" : fails >= 5 ? "BLOQUÉ 15 min" : "ok";
      console.log(`  ${u.email.padEnd(32)} ${u.role.padEnd(12)} ${state.padEnd(14)} ${u.name}`);
    }
    console.log("\nDébloquer :           npm run reset-access -- EMAIL");
    console.log("Nouveau mot de passe : npm run reset-access -- EMAIL MOTDEPASSE");
    console.log('Premier admin :        npm run reset-access -- --create-admin EMAIL MOTDEPASSE "Votre nom"\n');
  } else {
    const [emailArg, password] = args;
    const email = emailArg.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`\n✗ Aucun compte avec l'e-mail ${email}. Lancez "npm run reset-access" pour voir la liste.\n`);
      process.exitCode = 1;
    } else if (password !== undefined && password.length < 8) {
      console.error("\n✗ Le mot de passe doit contenir au moins 8 caractères.\n");
      process.exitCode = 1;
    } else {
      const data = { isActive: true, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) };
      await prisma.user.update({ where: { id: user.id }, data });
      // Clear failed logins for this e-mail and every IP (the lock is per e-mail AND per IP).
      const cleared = await prisma.portalAttempt.deleteMany({ where: { OR: [{ key: `login:email:${email}` }, { key: { startsWith: "login:ip:" } }] } });
      console.log(`\n✓ ${user.name} (${email}) : compte actif, ${cleared.count} tentative(s) effacée(s)${password ? ", nouveau mot de passe enregistré" : ""}.`);
      console.log("  Reconnectez-vous sur /login.\n");
    }
  }
} finally {
  await prisma.$disconnect();
}
