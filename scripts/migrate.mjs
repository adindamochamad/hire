import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL missing");
}

const local = url.includes("localhost") || url.includes("127.0.0.1");
const client = new pg.Client({
  connectionString: url,
  ssl: local ? undefined : { rejectUnauthorized: false },
});

const sqlPath = join(dirname(fileURLToPath(import.meta.url)), "..", "sql", "schema.sql");
await client.connect();
await client.query(readFileSync(sqlPath, "utf8"));
await client.end();
console.log("schema ready");
