import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Ensures at least one admin account exists, seeded from env vars, so a
// fresh database always has a way to log in and start creating more users.
export async function bootstrapAdminUser() {
  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  const email = (process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
  const passwordHash =
    process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(process.env.ADMIN_PASSWORD || "changeme123", 10);

  await prisma.user.create({
    data: { email, passwordHash, role: "admin" },
  });

  // eslint-disable-next-line no-console
  console.log(`> Seeded initial admin user: ${email}`);
}
