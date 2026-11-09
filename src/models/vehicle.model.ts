import { Document, Schema, model, Types } from "mongoose"

export interface IVehicle extends Document {
  owner: Types.ObjectId
  make: string
  vehicleModel: string
  year: number
  plateNumber: string
  vin: string
  color: string
  fuelType: string
  mileage: number
  imageURL: string
  createdAt: Date
  updatedAt: Date
}

const vehicleSchema = new Schema<IVehicle>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "system_users", required: true },
    make: { type: String, required: true, trim: true },
    vehicleModel: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    plateNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    vin: { type: String, default: "", trim: true },
    color: { type: String, default: "" },
    fuelType: {
      type: String,
      enum: ["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "OTHER"],
      default: "PETROL"
    },
    mileage: { type: Number, default: 0 },
    imageURL: { type: String, default: "" }
  },
  { timestamps: true }
)

export const Vehicle = model<IVehicle>("vehicles", vehicleSchema)
