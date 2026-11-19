const mongoose = require("mongoose");
const Cancellation = require("./cancellation");
const studentConnection = require("../studentDb");

const FoodCancelSchema = new mongoose.Schema({
    studentId: { type: String, required: true, unique: true },
    name: String,
    regdNo: String,
    email: String,
    cancellations: [Cancellation.schema],
    // Key = "YYYY-MM", Value = personal days used that month
    monthlyUsage: { type: Map, of: Number, default: {} }
}, { timestamps: true });
module.exports = studentConnection.model("FoodCancel", FoodCancelSchema);