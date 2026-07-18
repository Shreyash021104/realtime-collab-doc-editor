import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(
    path.join(__dirname, "migrations", "001_init.sql"),
    "utf-8"
  );
  await pool.query(sql);
  console.log("Migration applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
