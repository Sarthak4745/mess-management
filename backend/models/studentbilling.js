const mongoose = require("mongoose");
const studentConnection = require("../studentDb");

// ── Per-rate-period breakdown entry ────────────────────────────────────────
const BillingBreakdownSchema = new mongoose.Schema({
  startDate: { type: String, required: true }, // "YYYY-MM-DD"
  endDate:   { type: String, required: true }, // "YYYY-MM-DD"
  days:      { type: Number, required: true },
  rate:      { type: Number, required: true },
  amount:    { type: Number, required: true }
}, { _id: false });

// ── Monthly charge cache ────────────────────────────────────────────────────
const MonthlyBillEntrySchema = new mongoose.Schema({
  monthKey:    { type: String, required: true }, // "YYYY-MM"
  monthLabel:  { type: String, required: true },
  totalMeals:  { type: Number, required: true },
  amountPerMeal:{ type: Number, default: 100 },
  amountDue:   { type: Number, required: true },
  breakdown:   { type: [BillingBreakdownSchema], default: [] },
  updatedAt:   { type: Date, default: Date.now }
}, { _id: false });

// ── Other / Hostel Charge entry ─────────────────────────────────────────────
const OtherChargeSchema = new mongoose.Schema({
  title:       { type: String, default: "Hostel Fee" },
  amount:      { type: Number, required: true },
  category:    { type: String, default: "hostel" }, // "hostel", "maintenance", "room", etc.
  date:        { type: Date, default: Date.now },
  description: { type: String, default: "" }
}, { _id: true });

// ── Payment record ─────────────────────────────────────────────────────────
const PaymentSchema = new mongoose.Schema({
  amount:   { type: Number, required: true },
  category: { type: String, enum: ["food", "other", "overall"], default: "overall" },
  date:     { type: Date,   default: Date.now },
  note:     { type: String, default: "" }
}, { _id: true });

// ── Student Billing root document ──────────────────────────────────────────
const StudentBillingSchema = new mongoose.Schema({
  studentId:   { type: String, required: true, unique: true },
  name:        String,

  // Carried-over food balance from before digital tracking began
  previousBalance: { type: Number, default: 0 },

  // Carried-over other/hostel balance
  previousOtherBalance: { type: Number, default: 0 },

  // Payment audit trail — reduces outstanding balance
  payments: { type: [PaymentSchema], default: [] },

  // Other / Hostel charges audit trail
  otherCharges: { type: [OtherChargeSchema], default: [] },

  // Last calendar date that was successfully included in amountDue.
  // Used to prevent double-billing on refresh.
  lastBilledDate: { type: Date, default: null },

  // Timestamp set when admin clicks "Clear All" on this student.
  notificationsClearedAt: { type: Date, default: null },

  // Per-month charge cache (source of truth for amountDue per month)
  monthlyBills: [MonthlyBillEntrySchema]

}, { timestamps: true });

module.exports = studentConnection.model(
  "StudentBilling",
  StudentBillingSchema,
  "StudentBillings"
);
