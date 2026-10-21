/**
 * npm run backup:key                       → creates the encryption key (once; never overwritten)
 * npm run backup:verify -- <file.gpbk>     → decrypts and tests a restore in a throw-away database
 * npm run backup:restore -- <file.gpbk> <postgresql://…/new_empty_db>
 *                                          → restores into a NEW, EMPTY database (never over the live one)
 */
import { readFile } from "node:fs/promises";
import { backupConfig } from "./config.mjs";
import { createKeyFile, defaultKeyFile, loadKey, restoreInto, verifyBackup } from "./lib.mjs";

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "key") {
    const file = process.env.BACKUP_KEY_FILE || defaultKeyFile();
    await createKeyFile(file);
    console.log(`\n  ✔ Clé créée : ${file}`);
    console.log("  ⚠ Gardez une COPIE de ce fichier ailleurs (clé USB rangée, coffre) : sans elle, aucune sauvegarde ne peut être relue.");
    console.log("    Ne la mettez jamais dans le dossier du projet ni sur GitHub.\n");
  } else if (cmd === "verify") {
    if (!a) throw new Error("Indiquez le fichier .gpbk à vérifier.");
    const cfg = backupConfig();
    const manifest = await readFile(`${a}.json`, "utf8").then(JSON.parse).catch(() => null);
    const r = await verifyBackup(a, await loadKey(cfg.keyFile), { expectedSha256: manifest?.sha256Plain, counts: manifest?.counts, restoreAdminUrl: cfg.restoreAdminUrl });
    console.log(`\n  ✔ ${a} : ${r.level === "restore" ? `restauration testée (${r.tables} tables, ${r.rows} lignes identiques)` : "déchiffrement et intégrité OK (pas de serveur de test)"}\n`);
  } else if (cmd === "restore") {
    if (!a || !b) throw new Error("Usage : npm run backup:restore -- <fichier.gpbk> <postgresql://…/base_neuve_vide>");
    const cfg = backupConfig();
    await restoreInto(a, await loadKey(cfg.keyFile), b);
    console.log(`\n  ✔ Restauré dans ${new URL(b).pathname.slice(1)}. Vérifiez, puis pointez DATABASE_URL vers cette base (voir docs/SAUVEGARDES.md).\n`);
  } else {
    console.log("Commandes : key | verify <fichier> | restore <fichier> <url-base-neuve>");
  }
} catch (e) {
  console.error(`\n  ✖ ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
}
