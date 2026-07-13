import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const unit = await prisma.unit.upsert({
    where: { uic: "DEV-505" },
    update: {},
    create: { name: "Dev Test Unit", uic: "DEV-505" },
  });

  const user = await prisma.user.upsert({
    where: { email: "jordan.lee@army.mil" },
    update: {},
    create: {
      id: "dev-maj-lee",
      supabaseId: "dev-maj-lee",
      email: "jordan.lee@army.mil",
      firstName: "Jordan",
      lastName: "Lee",
      rank: "MAJ",
      category: "OFFICER",
      mos: "11A",
      roles: ["SOLDIER", "SENIOR_RATER"],
      unitId: unit.id,
    },
    select: { id: true, email: true, rank: true, category: true, roles: true },
  });

  console.log("Persisted MAJ dev persona:", user);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());