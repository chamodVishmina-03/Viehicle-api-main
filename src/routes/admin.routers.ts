import { Router } from "express"
import { getStats, listUsers, updateUserRoles } from "../controllers/admin.controller"
import { authenticate } from "../middleware/auth"
import { requireRole } from "../middleware/role"
import { UserRole } from "../models/user.model"

const router = Router()
router.use(authenticate, requireRole([UserRole.ADMIN]))

router.get("/stats", getStats)
router.get("/users", listUsers)
router.patch("/users/:id/roles", updateUserRoles)

export default router
