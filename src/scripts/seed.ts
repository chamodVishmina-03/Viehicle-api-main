import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import { UserModel, UserRole } from "../models/user.model"

const users = [
  { name: "Admin", email: "admin@vsrms.com", roles: [UserRole.ADMIN] },
  { name: "Mike Mechanic", email: "mechanic@vsrms.com", roles: [UserRole.MECHANIC] },
  { name: "Cathy Customer", email: "customer@vsrms.com", roles: [UserRole.CUSTOMER] }
]

async function run() {
  await mongoose.connect(process.env.MONGO_LOCAL_URL || "")
  const password = await bcrypt.hash("Password@123", 10)
  for (const u of users) {
    await UserModel.updateOne(
      { email: u.email },
      { $setOnInsert: { ...u, password, approve: true } },
      { upsert: true }
    )
    console.log("seeded", u.email)
  }
  await mongoose.disconnect()
}
run()
