import { Router } from "express"
import {
  assignMechanic,
  cancelJob,
  createJob,
  getAIDiagnosis,
  getAllJobs,
  getAssignedJobs,
  getJobById,
  getMyJobs,
  sendInvoice,
  updatePayment,
  updateCosting,
  updateStatus
} from "../controllers/job.controller"
import { authenticate } from "../middleware/auth"
import { requireRole } from "../middleware/role"
import { UserRole } from "../models/user.model"

const router = Router()
router.use(authenticate)

const { ADMIN, MECHANIC } = UserRole

router.post("/", createJob)
router.post("/generate-diagnosis", getAIDiagnosis)
router.get("/my", getMyJobs)
router.get("/assigned", requireRole([MECHANIC, ADMIN]), getAssignedJobs)
router.get("/admin/all", requireRole([ADMIN]), getAllJobs)

router.get("/:id", getJobById)
router.patch("/:id/cancel", cancelJob)
router.patch("/:id/assign", requireRole([ADMIN]), assignMechanic)
router.post("/:id/send-invoice", requireRole([ADMIN]), sendInvoice)
router.patch("/:id/payment", requireRole([ADMIN]), updatePayment)
router.patch("/:id/status", requireRole([MECHANIC, ADMIN]), updateStatus)
router.patch("/:id/costing", requireRole([MECHANIC, ADMIN]), updateCosting)

export default router
