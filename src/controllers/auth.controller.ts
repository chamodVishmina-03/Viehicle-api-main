import { Request, Response } from "express"
import { UserModel, UserRole } from "../models/user.model"
import bcrypt from "bcryptjs"
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "../util/jwt"
import { AuthRequest } from "../middleware/auth"
import crypto from "crypto"
import { isMailConfigured, sendMail } from "../services/mail.service"

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password required" })
    }

    const extUser = await UserModel.findOne({ email: email.toLowerCase() })
    if (extUser) {
      return res.status(400).json({ message: "User already exists" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    // Public registration always creates a CUSTOMER.
    // ADMIN promotes users to MECHANIC / ADMIN later.
    await UserModel.create({
      name,
      email,
      phone: phone || "",
      password: hashedPassword,
      roles: [UserRole.CUSTOMER],
      approve: true
    })

    res.status(201).json({ message: "User registered successfully" })
  } catch (err) {
    res.status(500).json({ message: "Registration failed" })
  }
}

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: "Missing credentials" })
  }

  try {
    const user = await UserModel.findOne({ email: email.toLowerCase() })
    if (!user) return res.status(401).json({ message: "Invalid credentials" })

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) return res.status(401).json({ message: "Invalid credentials" })

    res.status(200).json({
      message: "OK",
      data: {
        email: user.email,
        roles: user.roles,
        access_token: signAccessToken(user),
        refresh_token: signRefreshToken(user)
      }
    })
  } catch (err) {
    res.status(500).json({ message: "Internal server error" })
  }
}

export const getMyDetails = async (req: AuthRequest, res: Response) => {
  if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" })

  try {
    const user = await UserModel.findById(req.user.sub).select("-password")
    if (!user) return res.status(404).json({ message: "User not found" })

    res.status(200).json({
      message: "ok",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roles: user.roles
      }
    })
  } catch (err) {
    res.status(500).json({ message: "Internal server error" })
  }
}

export const getRefreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ message: "Token required" })

  try {
    const payload = verifyRefreshToken(refreshToken)
    const user = await UserModel.findById(payload.sub)
    if (!user) return res.status(403).json({ message: "Invalid token" })

    res.status(200).json({ data: { accessToken: signAccessToken(user) } })
  } catch (err) {
    res.status(403).json({ message: "Invalid or expired token" })
  }
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex")

export const forgotPassword = async (req: Request, res: Response) => {
  const email = String(req.body.email || "").toLowerCase().trim()
  if (!email) return res.status(400).json({ message: "Email required" })

  // Same response whether or not the account exists (prevents user enumeration)
  const generic = {
    message: "If an account exists for that email, a reset link has been sent."
  }

  try {
    const user = await UserModel.findOne({ email })
    if (!user) return res.status(200).json(generic)

    const token = crypto.randomBytes(32).toString("hex")
    user.resetPasswordToken = hashToken(token)
    user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000) // 30 min
    await user.save()

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
    const link = `${clientUrl}/reset-password?token=${token}`

    if (isMailConfigured()) {
      await sendMail(
        user.email,
        "Reset your AutoCare password",
        `<p>Hi ${user.name},</p>
         <p>We received a request to reset your password. This link is valid for 30 minutes:</p>
         <p><a href="${link}">Reset password</a></p>
         <p>If you didn't request this, you can ignore this email.</p>`
      )
      return res.status(200).json(generic)
    }

    // No SMTP configured: log the link, and expose it ONLY outside production (dev/demo).
    console.log(`[forgot-password] Reset link for ${user.email}: ${link}`)
    if (process.env.NODE_ENV !== "production") {
      return res.status(200).json({ ...generic, devResetLink: link })
    }
    res.status(200).json(generic)
  } catch (err) {
    res.status(500).json({ message: "Could not process request" })
  }
}

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body
  if (!token || !password)
    return res.status(400).json({ message: "Token and new password required" })
  if (String(password).length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters" })

  try {
    const user = await UserModel.findOne({
      resetPasswordToken: hashToken(String(token)),
      resetPasswordExpires: { $gt: new Date() }
    }).select("+resetPasswordToken +resetPasswordExpires")

    if (!user)
      return res.status(400).json({ message: "Reset link is invalid or has expired" })

    user.password = await bcrypt.hash(password, 10)
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined
    await user.save()

    res.status(200).json({ message: "Password updated. You can now sign in." })
  } catch (err) {
    res.status(500).json({ message: "Could not reset password" })
  }
}

export const updateMyProfile = async (req: AuthRequest, res: Response) => {
  if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" })

  try {
    const user = await UserModel.findById(req.user.sub)
    if (!user) return res.status(404).json({ message: "User not found" })

    const { name, phone, email, currentPassword, newPassword } = req.body
    const newEmail = email ? String(email).trim().toLowerCase() : user.email
    const emailChanged = newEmail !== user.email

    if (emailChanged && !/^\S+@\S+\.\S+$/.test(newEmail))
      return res.status(400).json({ message: "Enter a valid email address" })

    // Changing the email or password needs the current password
    if (emailChanged || newPassword) {
      if (!currentPassword)
        return res.status(400).json({ message: "Current password is required" })
      const ok = await bcrypt.compare(currentPassword, user.password)
      if (!ok) return res.status(401).json({ message: "Current password is incorrect" })
    }

    if (emailChanged) {
      const taken = await UserModel.findOne({ email: newEmail, _id: { $ne: user._id } })
      if (taken) return res.status(400).json({ message: "That email is already in use" })
      user.email = newEmail
    }

    if (newPassword) {
      if (String(newPassword).length < 6)
        return res.status(400).json({ message: "Password must be at least 6 characters" })
      user.password = await bcrypt.hash(newPassword, 10)
    }

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: "Name cannot be empty" })
      user.name = String(name).trim()
    }
    if (phone !== undefined) user.phone = String(phone).trim()

    await user.save()

    res.status(200).json({
      message: "Profile updated",
      data: { id: user._id, name: user.name, email: user.email, phone: user.phone, roles: user.roles }
    })
  } catch (err) {
    res.status(500).json({ message: "Internal server error" })
  }
}
