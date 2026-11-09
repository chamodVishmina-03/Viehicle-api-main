import { Response } from "express"
import mongoose from "mongoose"
import { UserModel, UserRole } from "../models/user.model"
import { ServiceJob, JobStatus } from "../models/service-job.model"
import { Vehicle } from "../models/vehicle.model"
import { AuthRequest } from "../middleware/auth"

export const getStats = async (_req: AuthRequest, res: Response) => {
  try {
    const [byStatus, byType, revenueAgg, vehicles, customers, mechanics, recent] =
      await Promise.all([
        ServiceJob.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
        ServiceJob.aggregate([{ $group: { _id: "$serviceType", count: { $sum: 1 } } }]),
        ServiceJob.aggregate([
          { $match: { status: JobStatus.COMPLETED } },
          { $group: { _id: null, total: { $sum: "$totalCost" } } }
        ]),
        Vehicle.countDocuments(),
        UserModel.countDocuments({ roles: UserRole.CUSTOMER }),
        UserModel.countDocuments({ roles: UserRole.MECHANIC }),
        ServiceJob.find()
          .populate("vehicle", "make vehicleModel plateNumber")
          .populate("customer", "name")
          .sort({ createdAt: -1 })
          .limit(5)
      ])

    res.status(200).json({
      jobsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      jobsByType: Object.fromEntries(byType.map((s) => [s._id, s.count])),
      revenue: revenueAgg[0]?.total || 0,
      vehicles,
      customers,
      mechanics,
      recentJobs: recent
    })
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const listUsers = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.query.role as string
    const filter: any = {}
    if (role && Object.values(UserRole).includes(role as UserRole)) filter.roles = role
    const users = await UserModel.find(filter).select("-password").sort({ createdAt: -1 })
    res.status(200).json(users)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const updateUserRoles = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { roles } = req.body
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" })
    if (
      !Array.isArray(roles) ||
      roles.length === 0 ||
      !roles.every((r) => Object.values(UserRole).includes(r))
    )
      return res.status(400).json({ error: "Invalid roles" })

    if (id === req.user?.sub && !roles.includes(UserRole.ADMIN))
      return res.status(400).json({ error: "You cannot remove your own ADMIN role" })

    const user = await UserModel.findByIdAndUpdate(id, { roles }, { new: true }).select(
      "-password"
    )
    if (!user) return res.status(404).json({ error: "User not found" })
    res.status(200).json(user)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}
