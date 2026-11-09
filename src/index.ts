import express from "express"
import mongoose from "mongoose"
import cors from "cors"
import dotenv from "dotenv"
import AuthRouter from "./routes/auth.routers"
import VehicleRouter from "./routes/vehicle.routers"
import JobRouter from "./routes/job.routers"
import AdminRouter from "./routes/admin.routers"
dotenv.config()

const MONGO_URL = process.env.MONGO_LOCAL_URL || ""
const PORT = process.env.PORT || 5000

const app = express()

app.use(cors())
app.use(express.json())

app.get("/health", (_req, res) => res.json({ status: "ok" }))
app.use("/api/v1/auth", AuthRouter)
app.use("/api/v1/vehicles", VehicleRouter)
app.use("/api/v1/jobs", JobRouter)
app.use("/api/v1/admin", AdminRouter)

mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log("DB connected..!")
    app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`))
  })
  .catch((err) => console.error("Fail to connect DB..!", err.message))
