import { Router } from "express"
import {
  createVehicle,
  deleteVehicle,
  getAllVehicles,
  getMyVehicles,
  getVehicleById,
  updateVehicle
} from "../controllers/vehicle.controller"
import { authenticate } from "../middleware/auth"
import { requireRole } from "../middleware/role"
import { UserRole } from "../models/user.model"
import { upload } from "../middleware/upload"

const router = Router()
router.use(authenticate)

router.get("/my", getMyVehicles)
router.get("/", requireRole([UserRole.ADMIN]), getAllVehicles)
router.post("/", upload.single("image"), createVehicle)
router.get("/:id", getVehicleById)
router.put("/:id", upload.single("image"), updateVehicle)
router.delete("/:id", deleteVehicle)

export default router
