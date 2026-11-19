const mongoose = require("mongoose");
const studentConnection = require("../studentDb");

// Kept for backward-compat reference — schema is now embedded inside studentbilling.js
// This file is intentionally minimal; the real schema lives in studentbilling.js.

const MonthlyBillEntrySchema = new mongoose.Schema({
  monthKey:      { type: String, required: true },
  monthLabel:    { type: String, required: true },
  totalMeals:    { type: Number, required: true },
  amountPerMeal: { type: Number, default: 100 },
  amountDue:     { type: Number, required: true },
  breakdown: [{
    startDate: String,
    endDate:   String,
    days:      Number,
    rate:      Number,
    amount:    Number
  }],
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

module.exports = studentConnection.model("MonthlyBillEntry", MonthlyBillEntrySchema);