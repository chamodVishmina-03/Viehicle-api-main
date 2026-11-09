import { Document, Schema, model, Types } from "mongoose"

export enum JobStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  IN_PROGRESS = "IN_PROGRESS",
  WAITING_PARTS = "WAITING_PARTS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED"
}

export const SERVICE_TYPES = [
  "GENERAL_SERVICE",
  "OIL_CHANGE",
  "BRAKE_REPAIR",
  "ENGINE_REPAIR",
  "TIRE_SERVICE",
  "ELECTRICAL",
  "AC_SERVICE",
  "BODY_WORK",
  "DIAGNOSTIC",
  "OTHER"
]

export interface IPart {
  name: string
  quantity: number
  unitPrice: number
}

export interface IServiceJob extends Document {
  jobNumber: string
  vehicle: Types.ObjectId
  customer: Types.ObjectId
  mechanic?: Types.ObjectId | null
  serviceType: string
  title: string
  description: string
  priority: "LOW" | "NORMAL" | "URGENT"
  status: JobStatus
  scheduledDate?: Date
  parts: IPart[]
  laborCost: number
  totalCost: number
  mechanicNotes: string
  aiDiagnosis: string
  completedAt?: Date
  paymentStatus: "UNPAID" | "PAID"
  paymentMethod: string
  paidAt?: Date
  invoiceSentAt?: Date
  statusHistory: {
    status: JobStatus
    changedBy: Types.ObjectId
    note: string
    at: Date
  }[]
  createdAt: Date
  updatedAt: Date
}

const jobSchema = new Schema<IServiceJob>(
  {
    jobNumber: { type: String, unique: true },
    vehicle: { type: Schema.Types.ObjectId, ref: "vehicles", required: true },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "system_users",
      required: true
    },
    mechanic: { type: Schema.Types.ObjectId, ref: "system_users", default: null },
    serviceType: { type: String, enum: SERVICE_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    priority: {
      type: String,
      enum: ["LOW", "NORMAL", "URGENT"],
      default: "NORMAL"
    },
    status: {
      type: String,
      enum: Object.values(JobStatus),
      default: JobStatus.PENDING
    },
    scheduledDate: { type: Date },
    parts: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 }
      }
    ],
    laborCost: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0 },
    mechanicNotes: { type: String, default: "" },
    aiDiagnosis: { type: String, default: "" },
    completedAt: { type: Date },
    paymentStatus: { type: String, enum: ["UNPAID", "PAID"], default: "UNPAID" },
    paymentMethod: {
      type: String,
      enum: ["", "CASH", "CARD", "BANK_TRANSFER", "ONLINE"],
      default: ""
    },
    paidAt: { type: Date },
    invoiceSentAt: { type: Date },
    statusHistory: [
      {
        status: { type: String, enum: Object.values(JobStatus) },
        changedBy: { type: Schema.Types.ObjectId, ref: "system_users" },
        note: { type: String, default: "" },
        at: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
)

jobSchema.pre("save", function () {
  if (!this.jobNumber) {
    this.jobNumber = `SJ-${Date.now().toString(36).toUpperCase()}${Math.floor(
      Math.random() * 36
    ).toString(36).toUpperCase()}`
  }
  const partsTotal = (this.parts || []).reduce(
    (sum, p) => sum + p.quantity * p.unitPrice,
    0
  )
  this.totalCost = partsTotal + (this.laborCost || 0)
})

export const ServiceJob = model<IServiceJob>("service_jobs", jobSchema)
