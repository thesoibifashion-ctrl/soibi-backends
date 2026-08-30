import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

export async function connectDatabase(): Promise<void> {
  const client = await pool.connect();

  try {
    console.log("✅ Database connecteds");
  } finally {
    client.release();
  }
}