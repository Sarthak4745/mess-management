
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const Admin = require("./models/AddAdmin");
const Vendor = require("./models/Vendor");
const Student = require("./models/Student");
const User = require("./models/User");

const isBcryptHash = (value) =>
  typeof value === "string" &&
  /^\$2[aby]\$\d{2}\$/.test(value);

async function migrateCollection(Model, label, dryRun) {
  const records = await Model.find({});
  let hashed = 0;
  let alreadyHashed = 0;
  let missing = 0;

  for (const record of records) {
    const password = record.password;

    if (typeof password !== "string" || !password) {
      missing++;
      continue;
    }

    if (isBcryptHash(password)) {
      alreadyHashed++;
      continue;
    }
    if (dryRun) {
        hashed++;
        continue;
    }
    const hash = await bcrypt.hash(password, 12);

    const result = await Model.updateOne(
      { _id: record._id },
      { $set: { password: hash } }
    );

    if(!result.acknowledged){
        throw new Error(
            `Failed to update password for ${label}, record ${record._id}`
        )
    }

    hashed++;
  }

  console.log(
    `${label}: total=${records.length}, newly hashed=${hashed}, ` +
    `already hashed=${alreadyHashed}, missing=${missing}`
  );
}

async function main() {
  try {
    const dryRun = process.argv.includes("--dry-run");
    console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE MIGRATION"}`);
    await mongoose.connect("mongodb://127.0.0.1:27017/adminDB");
    console.log("Connected to adminDB");

    // User.js manages its own studentDB connection.
    await User.db.asPromise();
    console.log("Connected to studentDB");

    await migrateCollection(Admin, "admins", dryRun);
    await migrateCollection(Vendor, "Vendors", dryRun);
    await migrateCollection(Student, "SDetails", dryRun);
    await migrateCollection(User, "users", dryRun);

    console.log("Password migration finished.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await User.db.close();
    await mongoose.disconnect();
  }
}

main();
