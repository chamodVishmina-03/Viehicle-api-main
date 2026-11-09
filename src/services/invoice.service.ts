const esc = (v: any) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  )

  
const lkr = (n: number) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(n || 0)


const fmtDate = (d?: Date | string) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"


const label = (s: string) => esc((s || "").replace(/_/g, " "))


interface Opts {
  adminName: string
  adminEmail: string
  note?: string
  receipt?: boolean
}




/**     Build the invoice And  e-mail sent to the customer    */
export const buildInvoiceEmail = (job: any, opts: Opts) => {
  const v = job.vehicle || {}
  const c = job.customer || {}
  const paid = job.paymentStatus === "PAID"
  const isReceipt = !!opts.receipt && paid
  const title = isReceipt ? "Payment Receipt" : "Service Invoice"
  const subject = `${title} ${job.jobNumber} – ${v.make || ""} ${v.vehicleModel || ""} (${v.plateNumber || ""})`




  const partsRows = (job.parts || [])
    .map(
      (p: any) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eef0f4">${esc(p.name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef0f4;text-align:center">${p.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef0f4;text-align:right">${lkr(p.unitPrice)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef0f4;text-align:right">${lkr(p.quantity * p.unitPrice)}</td>
      </tr>`
    )
    .join("")



  const info = (k: string, val: any) =>
    `<tr><td style="padding:3px 12px 3px 0;color:#64748b;font-size:13px">${k}</td><td style="padding:3px 0;font-size:13px;font-weight:600;color:#0f172a">${esc(val) || "—"}</td></tr>`



  const instructions =
    process.env.PAYMENT_INSTRUCTIONS ||
    "Please settle the balance at the service centre counter, or by bank transfer quoting the job number as the reference."




  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px"><tr><td align="center">
  <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e9f2">
    <tr><td style="background:#1f55e6;padding:24px 28px;color:#fff">
      <div style="font-size:22px;font-weight:800">Auto<span style="color:#bae6fd">Care</span></div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">${title} · ${esc(job.jobNumber)}</div>
    </td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 16px;font-size:15px">Hi ${esc(c.name)},</p>
      <p style="margin:0 0 20px;font-size:14px;color:#334155">${
        isReceipt
          ? "Thank you! We have received your payment. Your receipt is below."
          : "Please find the details of your vehicle service and the amount due below."
      }</p>

      ${opts.note ? `<div style="background:#fff8e6;border:1px solid #fde7a8;border-radius:10px;padding:12px 14px;font-size:13px;margin-bottom:20px">${esc(opts.note).replace(/\n/g, "<br>")}</div>` : ""}

      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Vehicle</div>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:20px">
        ${info("Vehicle", `${v.make || ""} ${v.vehicleModel || ""} (${v.year || ""})`)}
        ${info("Plate number", v.plateNumber)}
        ${info("VIN", v.vin)}
        ${info("Colour / Fuel", `${v.color || "—"} / ${v.fuelType || "—"}`)}
        ${info("Mileage", v.mileage != null ? `${Number(v.mileage).toLocaleString("en-US")} km` : "")}
      </table>

      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Service</div>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:20px">
        ${info("Job", job.title)}
        ${info("Type", (job.serviceType || "").replace(/_/g, " "))}
        ${info("Status", (job.status || "").replace(/_/g, " "))}
        ${info("Mechanic", job.mechanic?.name)}
        ${info("Booked", fmtDate(job.createdAt))}
        ${info("Completed", fmtDate(job.completedAt))}
      </table>
      ${job.mechanicNotes ? `<p style="font-size:13px;color:#475569;background:#f8fafc;border-radius:10px;padding:12px 14px;margin:0 0 20px"><b>Mechanic notes:</b> ${esc(job.mechanicNotes)}</p>` : ""}

      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Charges</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">
        <tr style="color:#64748b;font-size:11px;text-transform:uppercase">
          <td style="padding-bottom:6px">Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Unit</td><td style="text-align:right">Amount</td>
        </tr>
        ${partsRows || `<tr><td colspan="4" style="padding:8px 0;color:#94a3b8">No parts used</td></tr>`}
        <tr><td colspan="3" style="padding:10px 0;text-align:right;color:#64748b">Labour</td><td style="padding:10px 0;text-align:right">${lkr(job.laborCost)}</td></tr>
        <tr><td colspan="3" style="padding:12px 0;text-align:right;font-weight:800;font-size:15px">Total</td><td style="padding:12px 0;text-align:right;font-weight:800;font-size:15px">${lkr(job.totalCost)}</td></tr>
      </table>

      <div style="margin-top:12px;border-radius:12px;padding:16px;${paid ? "background:#ecfdf5;border:1px solid #a7f3d0" : "background:#fff1f2;border:1px solid #fecdd3"}">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${paid ? "#047857" : "#be123c"}">Payment · ${paid ? "PAID" : "UNPAID"}</div>
        ${
          paid
            ? `<div style="font-size:13px;margin-top:6px;color:#065f46">Paid ${lkr(job.totalCost)} on ${fmtDate(job.paidAt)} by ${label(job.paymentMethod) || "—"}.</div>`
            : `<div style="font-size:13px;margin-top:6px;color:#881337">Amount due: <b>${lkr(job.totalCost)}</b><br><span style="color:#9f1239">${esc(instructions)}</span><br><span style="color:#9f1239">Reference: ${esc(job.jobNumber)}</span></div>`
        }
      </div>

      <p style="margin:24px 0 0;font-size:13px;color:#64748b">Questions? Just reply to this email.<br>— ${esc(opts.adminName)}, AutoCare Service Centre</p>
    </td></tr>
  </table></td></tr></table></body></html>`


  return { subject, html }


}
