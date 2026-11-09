import { Document, model, Schema } from "mongoose"

export enum UserRole {
  ADMIN = "ADMIN",
  MECHANIC = "MECHANIC",
  CUSTOMER = "CUSTOMER"
}

export interface IUser extends Document {
  name: string
  email: string
  phone: string
  password: string
  roles: UserRole[]
  approve: boolean
  resetPasswordToken?: string
  resetPasswordExpires?: Date
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, default: "" },
    password: { type: String, required: true },
    roles: {
      type: [String],
      enum: Object.values(UserRole),
      default: [UserRole.CUSTOMER]
    },
    approve: { type: Boolean, default: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false }
  },
  { timestamps: true }
)

export const UserModel = model<IUser>("system_users", userSchema)
