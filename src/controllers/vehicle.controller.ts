import { Response } from "express"
import mongoose from "mongoose"
import { Vehicle } from "../models/vehicle.model"
import { ServiceJob, JobStatus } from "../models/service-job.model"
import { UserRole } from "../models/user.model"
import { uploadImage } from "../services/storage.service"
import { isStorageConfigured } from "../config/supabase"
import { AuthRequest } from "../middleware/auth"



const isAdmin = (req: AuthRequest) => req.user?.roles?.includes(UserRole.ADMIN)




export const createVehicle = async (req: AuthRequest, res: Response) => {

  try {

    const userId = req.user?.sub
    const { make, vehicleModel, year, plateNumber, vin, color, fuelType, mileage } =
      req.body


    if (!make || !vehicleModel || !year || !plateNumber) {
      return res
        .status(400)
        .json({ error: "make, vehicleModel, year and plateNumber are required" })

    }




    const exists = await Vehicle.findOne({
      plateNumber: String(plateNumber).toUpperCase().trim()
    })



    if (exists) return res.status(400).json({ error: "Plate number already registered" })

    if (req.file && !isStorageConfigured())
      return res.status(503).json({
        error: "Photo upload is not set up on the server. Save the vehicle without a photo."
      })

    const imageURL = req.file ? await uploadImage(req.file, "vehicles") : ""



    // Admin may register on behalf of a customer
    const owner = isAdmin(req) && req.body.ownerId ? req.body.ownerId : userId

    const vehicle = await Vehicle.create({
      owner,
      make,
      vehicleModel,
      year: Number(year),
      plateNumber,
      vin,
      color,
      fuelType,
      mileage: Number(mileage) || 0,
      imageURL
    })

    res.status(201).json(vehicle)

  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })

  }
}



export const getMyVehicles = async (req: AuthRequest, res: Response) => {
  try {
    const vehicles = await Vehicle.find({ owner: req.user?.sub }).sort({
      createdAt: -1
    })
    res.status(200).json(vehicles)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const getAllVehicles = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const search = (req.query.search as string)?.trim()

    const filter: any = {}
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      filter.$or = [{ plateNumber: rx }, { make: rx }, { vehicleModel: rx }]
    }

    const vehicles = await Vehicle.find(filter)
      .populate("owner", "name email phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
    const total = await Vehicle.countDocuments(filter)

    res.status(200).json({
      data: vehicles,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    })
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const getVehicleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid Vehicle ID" })

    const vehicle = await Vehicle.findById(id).populate("owner", "name email phone")
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" })

    const ownerId = (vehicle.owner as any)._id.toString()
    if (!isAdmin(req) && ownerId !== req.user?.sub) {
      // Customers only ever see their own vehicles; mechanics only vehicles
      // of jobs assigned to them. Anything else looks like "not found".
      const assigned =
        req.user?.roles?.includes(UserRole.MECHANIC) &&
        (await ServiceJob.exists({ vehicle: id, mechanic: req.user?.sub }))
      if (!assigned) return res.status(404).json({ error: "Vehicle not found" })
    }

    const history = await ServiceJob.find({ vehicle: id })
      .populate("mechanic", "name")
      .sort({ createdAt: -1 })

    res.status(200).json({ vehicle, history })
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const updateVehicle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid Vehicle ID" })

    const vehicle = await Vehicle.findById(id)
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" })
    if (!isAdmin(req) && vehicle.owner.toString() !== req.user?.sub)
      return res.status(404).json({ error: "Vehicle not found" })

    const fields = ["make", "vehicleModel", "year", "color", "fuelType", "mileage", "vin"]
    fields.forEach((f) => {
      if (req.body[f] !== undefined) (vehicle as any)[f] = req.body[f]
    })
    if (req.file && !isStorageConfigured())
      return res.status(503).json({
        error: "Photo upload is not set up on the server. Save the vehicle without a photo."
      })
    if (req.file) vehicle.imageURL = await uploadImage(req.file, "vehicles")

    await vehicle.save()
    res.status(200).json(vehicle)
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}

export const deleteVehicle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ error: "Invalid Vehicle ID" })

    const vehicle = await Vehicle.findById(id)
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" })
    if (!isAdmin(req) && vehicle.owner.toString() !== req.user?.sub)
      return res.status(404).json({ error: "Vehicle not found" })

    const active = await ServiceJob.countDocuments({
      vehicle: id,
      status: {
        $in: [
          JobStatus.PENDING,
          JobStatus.APPROVED,
          JobStatus.IN_PROGRESS,
          JobStatus.WAITING_PARTS
        ]
      }
    })
    if (active > 0)
      return res
        .status(400)
        .json({ error: "Vehicle has active service jobs and cannot be deleted" })

    await vehicle.deleteOne()
    res.status(200).json({ message: "Vehicle deleted" })
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" })
  }
}