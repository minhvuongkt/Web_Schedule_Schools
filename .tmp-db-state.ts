import { prisma } from "./src/server/db";

async function main() {
  const users = await prisma.user.count();
  const admins = await prisma.user.findMany({
    where: { username: { in: ["admin", "tkbadmin"] } },
    select: { username: true, isActive: true, updatedAt: true },
  });
  const versions = await prisma.timetableVersion.count();
  console.log("users:", users, "versions:", versions, "admins:", JSON.stringify(admins));
  await prisma.$disconnect();
}

void main();
