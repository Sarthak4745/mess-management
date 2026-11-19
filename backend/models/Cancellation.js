const mongoose = require("mongoose");
const studentConnection = require("../studentDb");

const CancellationEntrySchema = new mongoose.Schema({
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    daysCancelled: { type: Number, required: true },
    reason: { type: String, enum: ["personal", "official"], required: true },
    status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved" },
    submittedAt: { type: Date, default: Date.now }
});

module.exports = studentConnection.model("Cancellation", CancellationEntrySchema, "Cancellations");