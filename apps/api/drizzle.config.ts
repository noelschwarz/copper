import type { Config } from "drizzle-kit";

const config: Config = {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://aloy:aloy@localhost:5432/aloy",
  },
  strict: true,
  verbose: true,
};

export default config;
