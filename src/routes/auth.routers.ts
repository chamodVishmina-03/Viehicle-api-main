import { Router } from "express"
import {
  getMyDetails,
  forgotPassword,
  getRefreshToken,
  login,
  register,
  resetPassword,
  updateMyProfile
} from "../controllers/auth.controller"
import { authenticate } from "../middleware/auth"

const router = Router()

router.post("/register", register)
router.post("/login", login)
router.post("/refresh", getRefreshToken)
router.post("/forgot-password", forgotPassword)
router.post("/reset-password", resetPassword)
router.get("/me", authenticate, getMyDetails)
router.patch("/me", authenticate, updateMyProfile)

export default router
