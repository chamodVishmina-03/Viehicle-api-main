import { Response } from "express"
import mongoose from "mongoose"
import { ServiceJob, JobStatus } from "../models/service-job.model"
import { Vehicle } from "../models/vehicle.model"
import { UserModel, UserRole } from "../models/user.model"
import { generateDiagnosis } from "../services/ai.service"
import { isMailConfigured, sendMail } from "../services/mail.service"
import { buildInvoiceEmail } from "../services/invoice.service"
import { AuthRequest } from "../middleware/auth"

const hasRole = (req: AuthRequest, role: UserRole) =>
  !!req.user?.roles?.includes(role)

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.PENDING]: [JobStatus.APPROVED, JobStatus.CANCELLED],
  [JobStatus.APPROVED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]: [
    JobStatus.WAITING_PARTS,
    JobStatus.COMPLETED,
    JobStatus.CANCELLED
  ],
  [JobStatus.WAITING_PARTS]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: []
}

const populateJob = (q: any) =>
  q
    .populate("vehicle", "make vehicleModel year plateNumber imageURL mileage")
    .populate("customer", "name email phone")
    .populate("mechanic", "name email")

const paginate = async (req: AuthRequest, res: Response, filter: any) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10

  const status = req.query.status as string
  if (status && Object.values(JobStatus).includes(status as JobStatus))
    filter.status = status

  const jobs = await populateJob(
    ServiceJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
  )
  const total = await ServiceJob.countDocuments(filter)

  res.status(200).json({
    data: jobs,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
  })
}

const canAccess = (req: AuthRequest, job: any) => {
  if (hasRole(req, UserRole.ADMIN)) return true
  const uid = req.user?.sub
  const customerId = (job.customer?._id ?? job.customer).toString()
  const mechanicId = job.mechanic ? (job.mechanic._id ?? job.mechanic).toString() : null
  return customerId === uid || mechanicId === uid
}

// ---------- Customer ----------
export const createJob = async (req: AuthRequest, res: Response) => {
  try {
    const { vehicleId, serviceType, title, description, priority, scheduledDate, aiDiagnosis } =
      req.body
    if (!vehicleId || !serviceType || !title)
      return res.status(400).json({ error: "vehicleId, serviceType and title required" })
    if (!mongoose.isValidObjectId(vehicleId))
      return res.status(400).json({ error: "Invalid vehicle ID" })

    const vehicle = await Vehicle.findById(vehicleId)
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" })

    const isAdmin = hasRole(req, UserRole.ADMIN)
    if (!isAdmin && vehicle.owner.toString() !== req.user?.sub)
      return res.status(403).json({ error: "You can only book service for your own vehicle" })

    const job = await ServiceJob.create({
      vehicle: vehicle._id,
      customer: vehicle.owner,
      serviceType,
      title,
      description,
      priority,
      scheduledDate: scheduledDate || undefined,
      aiDiagnosis: aiDiagnosis || "",
      statusHistory: [
        { status: JobStatus.PENDING, changedBy: req.user?.sub, note: "Job created" }
      ]
    })
    res.status(201).json(job)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const getMyJobs = async (req: AuthRequest, res: Response) => {
  try {
    await paginate(req, res, { customer: req.user?.sub })
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const cancelJob = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" })

    const job = await ServiceJob.findById(id)
    if (!job) return res.status(404).json({ error: "Job not found" })

    const isAdmin = hasRole(req, UserRole.ADMIN)
    if (!isAdmin && job.customer.toString() !== req.user?.sub)
      return res.status(403).json({ error: "Forbidden" })
    if (![JobStatus.PENDING, JobStatus.APPROVED].includes(job.status) && !isAdmin)
      return res.status(400).json({ error: "Job can no longer be cancelled" })
    if (!TRANSITIONS[job.status].includes(JobStatus.CANCELLED))
      return res.status(400).json({ error: "Job cannot be cancelled" })

    job.status = JobStatus.CANCELLED
    job.statusHistory.push({
      status: JobStatus.CANCELLED,
      changedBy: req.user?.sub as any,
      note: req.body?.note || "Cancelled",
      at: new Date()
    })
    await job.save()
    res.status(200).json(job)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

// ---------- Mechanic ----------
export const getAssignedJobs = async (req: AuthRequest, res: Response) => {
  try {
    await paginate(req, res, { mechanic: req.user?.sub })
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { status, note } = req.body
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" })
    if (!Object.values(JobStatus).includes(status))
      return res.status(400).json({ error: "Invalid status" })

    const job = await ServiceJob.findById(id)
    if (!job) return res.status(404).json({ error: "Job not found" })

    const isAdmin = hasRole(req, UserRole.ADMIN)
    if (!isAdmin && job.mechanic?.toString() !== req.user?.sub)
      return res.status(403).json({ error: "This job is not assigned to you" })

    if (!TRANSITIONS[job.status].includes(status))
      return res
        .status(400)
        .json({ error: `Cannot change status from ${job.status} to ${status}` })

    if (status === JobStatus.IN_PROGRESS && !job.mechanic)
      return res.status(400).json({ error: "Assign a mechanic first" })

    job.status = status
    if (status === JobStatus.COMPLETED) {
      job.completedAt = new Date()
      if (req.body.mileage) {
        await Vehicle.findByIdAndUpdate(job.vehicle, { mileage: Number(req.body.mileage) })
      }
    }
    job.statusHistory.push({
      status,
      changedBy: req.user?.sub as any,
      note: note || "",
      at: new Date()
    })
    await job.save()
    res.status(200).json(job)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const updateCosting = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { parts, laborCost, mechanicNotes } = req.body
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" })

    const job = await ServiceJob.findById(id)
    if (!job) return res.status(404).json({ error: "Job not found" })

    const isAdmin = hasRole(req, UserRole.ADMIN)
    if (!isAdmin && job.mechanic?.toString() !== req.user?.sub)
      return res.status(403).json({ error: "This job is not assigned to you" })
    if ([JobStatus.COMPLETED, JobStatus.CANCELLED].includes(job.status))
      return res.status(400).json({ error: "Closed jobs cannot be edited" })

    if (Array.isArray(parts)) job.parts = parts
    if (laborCost !== undefined) job.laborCost = Number(laborCost) || 0
    if (mechanicNotes !== undefined) job.mechanicNotes = mechanicNotes

    await job.save() // pre-save hook recalculates totalCost
    res.status(200).json(job)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

// ---------- Admin ----------
export const getAllJobs = async (req: AuthRequest, res: Response) => {
  try {
    const filter: any = {}
    const search = (req.query.search as string)?.trim()
    if (search) filter.jobNumber = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    await paginate(req, res, filter)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const assignMechanic = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { mechanicId } = req.body
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(mechanicId))
      return res.status(400).json({ error: "Invalid ID" })

    const mechanic = await UserModel.findById(mechanicId)
    if (!mechanic || !mechanic.roles.includes(UserRole.MECHANIC))
      return res.status(400).json({ error: "Selected user is not a mechanic" })

    const job = await ServiceJob.findById(id)
    if (!job) return res.status(404).json({ error: "Job not found" })
    if ([JobStatus.COMPLETED, JobStatus.CANCELLED].includes(job.status))
      return res.status(400).json({ error: "Closed jobs cannot be reassigned" })

    job.mechanic = mechanic._id as any
    if (job.status === JobStatus.PENDING) {
      job.status = JobStatus.APPROVED
      job.statusHistory.push({
        status: JobStatus.APPROVED,
        changedBy: req.user?.sub as any,
        note: `Assigned to ${mechanic.name}`,
        at: new Date()
      })
    }
    await job.save()
    res.status(200).json(await populateJob(ServiceJob.findById(id)))
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

// ---------- Shared ----------
export const getJobById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" })

    const job = await populateJob(ServiceJob.findById(id)).populate(
      "statusHistory.changedBy",
      "name"
    )
    if (!job) return res.status(404).json({ error: "Job not found" })
    if (!canAccess(req, job)) return res.status(403).json({ error: "Forbidden" })

    res.status(200).json(job)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const getAIDiagnosis = async (req: AuthRequest, res: Response) => {
  try {
    const { vehicleInfo, symptoms } = req.body
    if (!symptoms) return res.status(400).json({ error: "Symptoms required" })

    const diagnosis = await generateDiagnosis(vehicleInfo || "Unknown vehicle", symptoms)
    res.status(200).json({ diagnosis })
  } catch (error) {
    res.status(500).json({ error: "AI generation failed" })
  }
}

// ---------- Invoice & payment e-mails (Admin) ----------
const loadForEmail = (id: string) =>
  ServiceJob.findById(id)
    .populate("vehicle")
    .populate("customer", "name email phone")
    .populate("mechanic", "name email")

const deliver = async (
  req: AuthRequest,
  job: any,
  opts: { note?: string; receipt?: boolean }
) => {
  const admin = await UserModel.findById(req.user?.sub)
  const { subject, html } = buildInvoiceEmail(job, {
    adminName: admin?.name || "AutoCare",
    adminEmail: admin?.email || "",
    note: opts.note,
    receipt: opts.receipt
  })

  if (isMailConfigured()) {
    // Sent through the service centre's mailbox; replies go to the admin who sent it
    await sendMail(job.customer.email, subject, html, admin?.email)
    return { sent: true as const }
  }

  console.log(`[invoice-email] (SMTP not configured) To: ${job.customer.email}\nSubject: ${subject}`)
  return { sent: false as const, devPreview: process.env.NODE_ENV !== "production" ? html : undefined }
}

export const sendInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" })

    const job: any = await loadForEmail(String(id))
    if (!job) return res.status(404).json({ error: "Job not found" })
    if (!job.customer?.email) return res.status(400).json({ error: "Customer has no email" })
    if (job.status === JobStatus.CANCELLED)
      return res.status(400).json({ error: "Cancelled jobs cannot be invoiced" })

    const result = await deliver(req, job, { note: req.body?.note })
    if (result.sent) {
      job.invoiceSentAt = new Date()
      await job.save()
    }
    res.status(200).json({
      message: result.sent
        ? `Invoice emailed to ${job.customer.email}`
        : "SMTP not configured – email printed in the API console",
      sent: result.sent,
      devPreview: result.devPreview,
      invoiceSentAt: job.invoiceSentAt
    })
  } catch (error) {
    res.status(500).json({ error: "Failed to send email" })
  }
}

export const updatePayment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { paymentStatus, paymentMethod, sendReceipt } = req.body
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" })
    if (!["PAID", "UNPAID"].includes(paymentStatus))
      return res.status(400).json({ error: "paymentStatus must be PAID or UNPAID" })
    if (paymentStatus === "PAID" && !["CASH", "CARD", "BANK_TRANSFER", "ONLINE"].includes(paymentMethod))
      return res.status(400).json({ error: "Select a payment method" })

    const job: any = await loadForEmail(String(id))
    if (!job) return res.status(404).json({ error: "Job not found" })
    if (job.status === JobStatus.CANCELLED)
      return res.status(400).json({ error: "Cancelled jobs have no payment" })

    job.paymentStatus = paymentStatus
    job.paymentMethod = paymentStatus === "PAID" ? paymentMethod : ""
    job.paidAt = paymentStatus === "PAID" ? new Date() : undefined
    await job.save()

    let emailNote = ""
    if (paymentStatus === "PAID" && sendReceipt && job.customer?.email) {
      try {
        const r = await deliver(req, job, { receipt: true })
        emailNote = r.sent ? " Receipt emailed." : " (SMTP not configured – receipt printed in API console.)"
      } catch {
        emailNote = " Payment saved but the receipt email failed."
      }
    }
    res.status(200).json({
      message: `Payment marked ${paymentStatus}.${emailNote}`,
      paymentStatus: job.paymentStatus,
      paymentMethod: job.paymentMethod,
      paidAt: job.paidAt
    })
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}
