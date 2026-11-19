const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  phone:    { type: String, required: true },
  email:    { type: String, default: "" },
  aadhaar:  { type: String, default: "" },
  tenure:   { type: String, default: "" },
  hostel:   { type: String, default: "" },
  contract: { type: String, default: null },
  rating:   { type: Number, default: 0 },
  password: { type: String, required: true },
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null }
}, { timestamps: true });
module.exports = mongoose.model("Vendor", vendorSchema, "Vendors");