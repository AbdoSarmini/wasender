import { defineConfig, env } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // .env file is optional (e.g. env vars provided by the host/container)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
