require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");

//Security
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// Models (adminDB)
const Notice = require("./models/Notice");
const Admin = require("./models/AddAdmin");
const Policy = require("./models/Policy");
const Hostel = require("./models/Hostel");
const Student = require("./models/Student");
const Vendor = require("./models/Vendor");
const User = require("./models/User");
const Preference = require("./models/Preference");
const Cancellation = require("./models/cancellation");
const FoodCancel = require("./models/Foodcancel");
const MonthlyBillEntry = require("./models/Monthlybillentry");
const StudentBilling = require("./models/studentbilling");
const StudentNotice = require("./models/studentnotice");
const VendorFeedback = require("./models/vendorfeedback");

const app = express();
app.use(express.json());
app.use(cors());

// ============================================================
// RATE LIMITING
// ============================================================

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 10,                 // Maximum 10 login requests
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 5 minutes."
  }
});


const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 3,                  // Maximum 3 requests per window
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset requests. Please try again later."
  }
});


const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100,           // 100 requests per minute
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please slow down and try again."
  }
});

app.use("/api", generalApiLimiter);
// Serve static files from backend dir (uploads, etc.)
app.use(express.static(path.join(__dirname)));
// Serve frontend static files from public dir (admin.html, login.html, etc.)
app.use(express.static(path.join(__dirname, "..")));

// Hash a password before storing it
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

// Verify a password against its stored hash
async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}


/**
 * Verify the JWT supplied by the client.
 * Attaches the verified identity to req.user.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token missing"
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is missing from environment");
    return res.status(500).json({
      success: false,
      message: "Server configuration error"
    });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET,
    { algorithms: ["HS256"] },
    (err, decoded) => {
      if (err) {
        console.error("JWT verification error:", err.name, err.message);
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token"
        });
      }

      req.user = decoded;
      next();
    }
  );
}

/**
 * Allow only authenticated administrators.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required"
    });
  }

  next();
}


function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== "student") {
    return res.status(403).json({
      success: false,
      message: "Student access required"
    });
  }

  next();
}

function requireVendor(req, res, next) {
  if (!req.user || req.user.role !== "vendor") {
    return res.status(403).json({
      success: false,
      message: "Vendor access required"
    });
  }

  next();
}


// ============================================================
// INJECTION PREVENTION MIDDLEWARE
// ============================================================

/**
 * Sanitize a single string value:
 * - Strips HTML/script tags (XSS prevention)
 * - Blocks MongoDB/NoSQL injection operators like $gt, $ne, $regex, etc.
 * - Removes dangerous characters used in object injection
 */
function sanitizeString(value) {
  if (typeof value !== "string") return value;
  // Strip HTML/script tags
  value = value.replace(/<[^>]*>/g, "");
  // Block NoSQL operators (e.g., { "$gt": "" } bypass attacks)
  value = value.replace(/\$[a-zA-Z_]+/g, "");
  return value;
}

/**
 * Recursively sanitize all string values in an object/array.
 * Rejects any key starting with '$' (MongoDB operator injection).
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === "object") {
    const clean = {};
    for (const key of Object.keys(obj)) {
      // Reject keys starting with $ (NoSQL operator injection)
      if (key.startsWith("$")) continue;
      clean[key] = sanitizeObject(obj[key]);
    }
    return clean;
  }
  return obj;
}

// Apply sanitization to all incoming requests
app.use((req, res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeObject(req.params);
  }
  next();
});

// ============================================================
// DATABASE CONNECTIONS
// ============================================================

// adminDB → notices, admins, students, policy
mongoose.connect("mongodb://127.0.0.1:27017/adminDB")
  .then(() => {
    console.log("Connected to adminDB");
    Admin.createIndexes();
    Hostel.createIndexes();
  })
  .catch(err => console.log(err));

// studentDB → users, preferences, food cancels, billing
const studentConnection = mongoose.createConnection("mongodb://127.0.0.1:27017/studentDB");
studentConnection.on("connected", () => console.log("Connected to studentDB"));


// ============================================================
// MULTER CONFIGS
// ============================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

const vendorStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) => cb(null, "contract_" + Date.now() + path.extname(file.originalname))
});
const vendorUpload = multer({ storage: vendorStorage });

const menuStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, "menu_" + Date.now() + path.extname(file.originalname))
});
const menuUpload = multer({ storage: menuStorage });

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Returns "YYYY-MM" string for a given Date */
function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Returns "YYYY-MM-DD" string for a given Date */
function toDateStr(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Merges consecutive breakdown entries with the same rate into unified periods */
function mergeBreakdownList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const merged = [];
  for (const item of list) {
    if (!item || typeof item.rate !== "number") continue;
    const last = merged[merged.length - 1];
    if (last && last.rate === item.rate) {
      last.endDate = item.endDate;
      last.days = (last.days || 0) + (item.days || 0);
      last.amount = (last.amount || 0) + (item.amount || 0);
    } else {
      merged.push({
        startDate: item.startDate,
        endDate: item.endDate,
        days: item.days,
        rate: item.rate,
        amount: item.amount
      });
    }
  }
  return merged;
}

/** Returns true if a date falls inside any approved cancellation entry */
function isDateCancelled(date, cancellations) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return cancellations.some(c => {
    if (c.status !== "approved") return false;
    const from = new Date(c.fromDate); from.setHours(0, 0, 0, 0);
    const to = new Date(c.toDate); to.setHours(0, 0, 0, 0);
    return d >= from && d <= to;
  });
}

/** Returns the applicable meal rate for a specific date based on policy and schedule */
function getRateForDate(date, policy) {
  if (!policy) return 100;

  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  // If rateHistory exists and has entries, use it exclusively (do NOT double-apply scheduledRate)
  if (Array.isArray(policy.rateHistory) && policy.rateHistory.length > 0) {
    const sorted = [...policy.rateHistory]
      .filter(item => typeof item.rate === "number")
      .sort((a, b) => {
        const da = a.effectiveFrom ? new Date(a.effectiveFrom).getTime() : -Infinity;
        const db = b.effectiveFrom ? new Date(b.effectiveFrom).getTime() : -Infinity;
        return da - db;
      });

    let currentRate = policy.flatMealRate || 100;
    for (const item of sorted) {
      if (!item.effectiveFrom) {
        currentRate = item.rate;
      } else {
        const eff = new Date(item.effectiveFrom);
        eff.setHours(0, 0, 0, 0);
        if (d >= eff) {
          currentRate = item.rate;
        }
      }
    }
    // BUG FIX: Do NOT re-apply policy.scheduledRate here — rateHistory already
    // encodes all rate transitions. Applying scheduledRate on top would double-count
    // the latest rate change for any date after effectiveFrom.
    return currentRate;
  }

  // Standard flatMealRate + scheduledRate / effectiveFrom:
  // Till effectiveFrom date (d < eff): old rate (flatMealRate) applies.
  // From effectiveFrom onward (d >= eff): new rate (scheduledRate) applies.
  const baseRate = (typeof policy.flatMealRate === "number") ? policy.flatMealRate : 100;
  if (policy.scheduledRate && policy.effectiveFrom) {
    const eff = new Date(policy.effectiveFrom);
    eff.setHours(0, 0, 0, 0);
    if (d >= eff) {
      return policy.scheduledRate;
    } else {
      return baseRate;
    }
  }

  return baseRate;
}

/**
 * Compute billing for a given student + year/month day-by-day.
 *
 * Returns per-rate-period breakdown alongside totals.
 * Does NOT write to the database — callers decide what to persist.
 *
 * @param {string}  studentId
 * @param {number}  year      – full year e.g. 2026
 * @param {number}  month     – 0-indexed month (0 = January)
 * @param {Date}    [fromDay] – optional: start computing from this calendar day (for incremental billing)
 * @param {Date}    [toDay]   – optional: compute up to and including this calendar day
 */
async function computeMonthlyBill(studentId, year, month, fromDay, toDay) {
  const policy = await Policy.findOne();

  const monthStart = new Date(year, month, 1);
  monthStart.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isCurrentMonth = (year === today.getFullYear() && month === today.getMonth());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const maxDay = isCurrentMonth ? Math.min(today.getDate(), daysInMonth) : daysInMonth;

  // Determine the actual day range to compute
  const startDay = fromDay
    ? Math.max(1, Math.min(fromDay.getDate(), daysInMonth))
    : 1;
  const endDay = toDay
    ? Math.max(startDay, Math.min(toDay.getDate(), daysInMonth))
    : maxDay;

  const cancelDoc = await FoodCancel.findOne({ studentId });
  const cancellations = cancelDoc?.cancellations || [];

  let totalMeals = 0;
  let totalAmountDue = 0;

  // Build per-rate-period breakdown by grouping consecutive billable days at the same rate.
  // breakdown entry: { startDate, endDate, days, rate, amount }
  const breakdown = [];
  let currentPeriod = null;

  for (let day = startDay; day <= endDay; day++) {
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);

    const cancelled = cancellations.some(c => {
      if (c.status !== "approved") return false;
      const from = new Date(c.fromDate); from.setHours(0, 0, 0, 0);
      const to   = new Date(c.toDate);   to.setHours(0, 0, 0, 0);
      return d >= from && d <= to;
    });

    if (!cancelled) {
      totalMeals++;
      const dailyRate = getRateForDate(d, policy);
      totalAmountDue += dailyRate;

      const dateStr = toDateStr(d);

      if (currentPeriod && currentPeriod.rate === dailyRate) {
        // Extend the current period
        currentPeriod.endDate = dateStr;
        currentPeriod.days++;
        currentPeriod.amount += dailyRate;
      } else {
        // Flush old period and start a new one
        if (currentPeriod) breakdown.push(currentPeriod);
        currentPeriod = {
          startDate: dateStr,
          endDate:   dateStr,
          days:      1,
          rate:      dailyRate,
          amount:    dailyRate
        };
      }
    } else {
      // Cancelled day: flush any open period (creates a gap)
      if (currentPeriod) {
        breakdown.push(currentPeriod);
        currentPeriod = null;
      }
    }
  }
  if (currentPeriod) breakdown.push(currentPeriod);

  // amountPerMeal: single rate → use it; multiple rates → weighted average
  const ratesUsed = new Set(breakdown.map(b => b.rate));
  let amountPerMeal;
  if (ratesUsed.size === 1) {
    amountPerMeal = ratesUsed.values().next().value;
  } else if (totalMeals > 0) {
    amountPerMeal = Math.round((totalAmountDue / totalMeals) * 100) / 100;
  } else {
    amountPerMeal = getRateForDate(
      new Date(year, month, Math.min(endDay || 1, daysInMonth)),
      policy
    );
  }

  const mKey   = `${year}-${String(month + 1).padStart(2, "0")}`;
  const mLabel = monthStart.toLocaleString("default", { month: "long", year: "numeric" });

  return {
    monthKey:   mKey,
    monthLabel: mLabel,
    totalMeals,
    amountPerMeal,
    amountDue:  totalAmountDue,
    breakdown,
    startDay,
    endDay
  };
}


/**
 * Upsert a monthly bill entry.
 *
 * NOTE: manualOverride has been removed entirely.
 * Bills are replaced (full month recompute) or added incrementally.
 *
 * @param {string}  studentId
 * @param {string}  name
 * @param {object}  billEntry     – result of computeMonthlyBill()
 * @param {boolean} [incremental] – if true, ADD amountDue on top of existing (used for daily billing)
 */
async function upsertMonthBill(studentId, name, billEntry, incremental = false) {
  const entry = {
    monthKey:      billEntry.monthKey,
    monthLabel:    billEntry.monthLabel,
    totalMeals:    billEntry.totalMeals,
    amountPerMeal: billEntry.amountPerMeal,
    amountDue:     billEntry.amountDue,
    breakdown:     billEntry.breakdown || [],
    updatedAt:     new Date()
  };

  const doc = await StudentBilling.findOne({ studentId });

  if (!doc) {
    await StudentBilling.create({ studentId, name, monthlyBills: [entry] });
    return;
  }

  const existing = doc.monthlyBills.find(b => b.monthKey === billEntry.monthKey);

  if (existing) {
    let newAmountDue  = entry.amountDue;
    let newTotalMeals = entry.totalMeals;
    let newBreakdown  = entry.breakdown;
    let newAmountPerMeal = entry.amountPerMeal;

    if (incremental) {
      // Append new incremental charges on top of what is already stored
      newAmountDue  = (existing.amountDue  || 0) + entry.amountDue;
      newTotalMeals = (existing.totalMeals || 0) + entry.totalMeals;
      newBreakdown  = mergeBreakdownList([...(existing.breakdown || []), ...entry.breakdown]);
      newAmountPerMeal = newTotalMeals > 0
        ? Math.round((newAmountDue / newTotalMeals) * 100) / 100
        : entry.amountPerMeal;
    }

    await StudentBilling.updateOne(
      { studentId, "monthlyBills.monthKey": billEntry.monthKey },
      {
        $set: {
          "monthlyBills.$.monthLabel":    entry.monthLabel,
          "monthlyBills.$.totalMeals":    newTotalMeals,
          "monthlyBills.$.amountPerMeal": newAmountPerMeal,
          "monthlyBills.$.amountDue":     newAmountDue,
          "monthlyBills.$.breakdown":     newBreakdown,
          "monthlyBills.$.updatedAt":     entry.updatedAt
        }
      }
    );
  } else {
    await StudentBilling.updateOne(
      { studentId },
      { $push: { monthlyBills: { $each: [entry], $sort: { monthKey: 1 } } } }
    );
  }
}

/**
 * Authoritative billing calculation for a student.
 * Separates Food billing and Hostel/Other billing.
 *
 * Food:
 *   Food Total       = previousBalance + sum(monthlyBills.amountDue)
 *   Food Paid        = sum(payments categorized as "food" or allocated to food)
 *   Food Outstanding = Math.max(0, Food Total - Food Paid)
 *
 * Hostel / Other:
 *   Other Total       = previousOtherBalance + sum(otherCharges.amount)
 *   Other Paid        = sum(payments categorized as "other" or allocated to other)
 *   Other Outstanding = Math.max(0, Other Total - Other Paid)
 *
 * Overall:
 *   Overall Total       = Food Total + Other Total
 *   Overall Paid        = Food Paid + Other Paid
 *   Overall Outstanding = Food Outstanding + Other Outstanding
 *   Status              = Overall Outstanding <= 0 ? "Settled" : "Outstanding"
 */
// billing is here
function calculateBillingSummary(billingDoc) {
  if (!billingDoc) {
    return {
      foodTotal: 0,
      foodPaid: 0,
      foodOutstanding: 0,
      otherTotal: 0,
      otherPaid: 0,
      otherOutstanding: 0,
      overallTotal: 0,
      overallPaid: 0,
      overallOutstanding: 0,
      status: "Settled",
      previousBalance: 0,
      previousOtherBalance: 0,
      totalCharged: 0,
      totalPaid: 0,
      outstandingBalance: 0,
      grandTotal: 0,
      messBill: 0,
      hostelBill: 0
    };
  }

  // 1. Food Charges
  const previousFoodBalance = billingDoc.previousBalance || 0;
  const foodCharges = (billingDoc.monthlyBills || []).reduce((s, b) => s + (b.amountDue || 0), 0);
  const foodTotal = previousFoodBalance + foodCharges;

  // 2. Other / Hostel Charges
  const previousOtherBalance = billingDoc.previousOtherBalance || 0;
  const otherChargesTotal = (billingDoc.otherCharges || []).reduce((s, c) => s + (c.amount || 0), 0);
  const otherTotal = previousOtherBalance + otherChargesTotal;

  // 3. Payment Categorization & Distribution
  const payments = billingDoc.payments || [];
  let foodPaid = 0;
  let otherPaid = 0;
  const unallocatedPayments = [];

  for (const p of payments) {
    const amt = p.amount || 0;
    if (p.category === "food") {
      foodPaid += amt;
    } else if (p.category === "other" || p.category === "hostel") {
      otherPaid += amt;
    } else {
      unallocatedPayments.push(amt);
    }
  }

  // Distribute unallocated/overall/legacy payments:
  // Allocate to food dues first, then other dues, then excess to food paid
  for (const amt of unallocatedPayments) {
    const foodDue = foodTotal - foodPaid;
    const otherDue = otherTotal - otherPaid;
    if (foodDue > 0) {
      const toFood = Math.min(amt, foodDue);
      foodPaid += toFood;
      const rem = amt - toFood;
      if (rem > 0) {
        if (otherDue > 0) {
          const toOther = Math.min(rem, otherDue);
          otherPaid += toOther;
          const rem2 = rem - toOther;
          if (rem2 > 0) foodPaid += rem2;
        } else {
          foodPaid += rem;
        }
      }
    } else if (otherDue > 0) {
      const toOther = Math.min(amt, otherDue);
      otherPaid += toOther;
      const rem = amt - toOther;
      if (rem > 0) otherPaid += rem;
    } else {
      foodPaid += amt;
    }
  }

  const foodOutstanding = Math.max(0, foodTotal - foodPaid);
  const otherOutstanding = Math.max(0, otherTotal - otherPaid);
  const overallOutstanding = foodOutstanding + otherOutstanding;
  const overallTotal = foodTotal + otherTotal;
  const overallPaid = foodPaid + otherPaid;

  const status = overallOutstanding <= 0 ? "Settled" : "Outstanding";

  return {
    foodTotal,
    foodPaid,
    foodOutstanding,
    otherTotal,
    otherPaid,
    otherOutstanding,
    overallTotal,
    overallPaid,
    overallOutstanding,
    status,
    // Backward compatibility aliases:
    previousBalance: previousFoodBalance,
    previousOtherBalance,
    totalCharged: overallTotal,
    totalPaid: overallPaid,
    outstandingBalance: overallOutstanding,
    grandTotal: overallOutstanding,
    messBill: (billingDoc.monthlyBills && billingDoc.monthlyBills.length > 0)
      ? (billingDoc.monthlyBills[billingDoc.monthlyBills.length - 1].amountDue || 0)
      : 0,
    hostelBill: otherTotal
  };
}

function calculateOutstanding(billingDoc) {
  return calculateBillingSummary(billingDoc);
}

// ============================================================
// VENDOR ROUTES  (/api/admin/vendors)
// ============================================================

// Register a new vendor
app.post("/api/admin/vendors",authenticateToken,requireAdmin, vendorUpload.single("contract"), async (req, res) => {
  try {
    const { name, phone, email, aadhaar, tenure, hostel } = req.body;
    if (!name || !phone) return res.status(400).json({ message: "Vendor name and phone are required" });

    // Validate phone: exactly 10 digits
    if (!/^\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ message: "Phone number must be exactly 10 digits" });
    }

    // Validate aadhaar: exactly 12 digits (if provided)
    if (aadhaar && !/^\d{12}$/.test(String(aadhaar).trim())) {
      return res.status(400).json({ message: "Aadhaar number must be exactly 12 digits" });
    }

    const hostelName = (hostel || "").trim();
    if (hostelName) {
      const exists = await Hostel.findOne({ name: hostelName });
      if (!exists) {
        return res.status(400).json({ message: `Hostel "${hostelName}" does not exist in the hostel directory` });
      }
    }
    const hashedPassword = await hashPassword("Password@123");
    const vendor = new Vendor({
      name: name.trim(),
      phone: String(phone).trim(),
      email: (email || "").trim(),
      aadhaar: aadhaar ? String(aadhaar).trim() : "",
      tenure,
      hostel: hostelName,
      contract: req.file ? req.file.filename : null,
      rating: 0,
      password: hashedPassword
    });
    await vendor.save();

    const vendorResponce = vendor.toObject();
    delete vendorResponce.password;
    res.status(201).json(vendorResponce);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all vendors
app.get("/api/admin/vendors",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const vendors = await Vendor.find()
    .select("-password -resetToken -resetTokenExpiry")
    .sort({ createdAt: -1 });
    res.json(vendors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete vendor
app.delete("/api/admin/vendors/:id",authenticateToken,requireAdmin, async (req, res) => {
  try {
    await Vendor.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update vendor details (optional contract re-upload)
app.patch("/api/admin/vendors/:id",authenticateToken,
  requireAdmin, vendorUpload.single("contract"), async (req, res) => {
  try {
    const { name, phone, email, aadhaar, hostel, tenure } = req.body;
    const oldVendor = await Vendor.findById(req.params.id);
    if (!oldVendor) return res.status(404).json({ message: "Vendor not found" });

    if (phone !== undefined && !/^\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ message: "Phone number must be exactly 10 digits" });
    }
    if (aadhaar !== undefined && aadhaar !== "" && !/^\d{12}$/.test(String(aadhaar).trim())) {
      return res.status(400).json({ message: "Aadhaar number must be exactly 12 digits" });
    }

    const hostelName = (hostel !== undefined ? hostel : oldVendor.hostel || "").trim();
    if (hostelName && hostelName !== oldVendor.hostel) {
      const exists = await Hostel.findOne({ name: hostelName });
      if (!exists) {
        return res.status(400).json({ message: `Hostel "${hostelName}" does not exist in the hostel directory` });
      }
    }

    const update = {
      name: name !== undefined ? name.trim() : oldVendor.name,
      phone: phone !== undefined ? String(phone).trim() : oldVendor.phone,
      email: email !== undefined ? String(email).trim() : oldVendor.email,
      aadhaar: aadhaar !== undefined ? String(aadhaar).trim() : oldVendor.aadhaar,
      hostel: hostelName,
      tenure: tenure !== undefined ? tenure : oldVendor.tenure
    };
    if (req.file) update.contract = req.file.filename;
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(vendor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update vendor rating
app.patch("/api/admin/vendors/:id/rating", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rating } = req.body;
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, { rating }, { new: true });
    res.json(vendor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// View vendor contract PDF
app.get("/api/admin/vendors/:id/contract",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor || !vendor.contract) return res.status(404).json({ message: "No contract found for this vendor" });
    res.sendFile(path.join(__dirname, "uploads", vendor.contract));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// VENDOR CONTRACT
// ============================================================

app.get("/api/vendor/contract",authenticateToken,requireVendor, async (req, res) => {
  try {
    const vendorId = req.user.sub;

    if (!vendorId) {
      return res.status(400).json({
        error: "vendorId required"
      });
    }

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        error: "Vendor not found"
      });
    }

    // Parse tenure: "startDate|endDate"
    const [contractStart, contractEnd] = (vendor.tenure || "").split("|");

    if (!contractStart || !contractEnd) {
      return res.json({
        contractStart: "--",
        contractEnd: "--",
        remainingMonths: 0,
        remainingDays: 0,
        contractPdfUrl: ""
      });
    }

    const startDate = new Date(contractStart + "T00:00:00");
    const endDate = new Date(contractEnd + "T23:59:59");
    const now = new Date();

    // Calculate remaining time
    let remainingMonths = 0;
    let remainingDays = 0;

    if (now < endDate) {
      let tempDate = new Date(now);

      while (true) {
        const nextMonth = new Date(tempDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        if (nextMonth <= endDate) {
          remainingMonths++;
          tempDate = nextMonth;
        } else {
          break;
        }
      }

      const diffMs = endDate - tempDate;
      remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    const contractPdfUrl = vendor.contract
      ? `${req.protocol}://${req.get("host")}/uploads/${vendor.contract}`: "";

    res.json({
      contractStart,
      contractEnd,
      remainingMonths,
      remainingDays,
      contractPdfUrl
    });

  } catch (err) {
    console.error("Vendor Contract Error:", err);

    res.status(500).json({
      error: "Server error fetching vendor contract"
    });
  }
});


app.get(
  "/api/vendor/contract-pdf",
  authenticateToken,
  requireVendor,
  async (req, res) => {
    try {
      const vendor = await Vendor.findById(req.user.sub);

      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }

      if (!vendor.contract) {
        return res.status(404).json({
          error: "Contract PDF is not available"
        });
      }

      const filename = path.basename(vendor.contract);
      const filePath = path.join(__dirname, "uploads", filename);

      res.sendFile(filePath, {
        headers: {
          "Content-Type": "application/pdf"
        }
      }, (err) => {
        if (err && !res.headersSent) {
          res.status(err.statusCode || 500).json({
            error: "Unable to open contract PDF"
          });
        }
      });
    } catch (err) {
      console.error("Contract PDF Error:", err);

      if (!res.headersSent) {
        res.status(500).json({
          error: "Server error retrieving contract PDF"
        });
      }
    }
  }
);


// ============================================================
// POLICY ROUTES  (/api/admin/policy)
// ============================================================

const router = express.Router();
app.use("/api/admin", router);

router.post("/policy",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { maxMonthlyOffs, flatMealRate, scheduledRate, effectiveFrom } = req.body;
    let policy = await Policy.findOne();

    const updateFields = {
      maxMonthlyOffs: typeof maxMonthlyOffs === "number" ? maxMonthlyOffs : (Number(maxMonthlyOffs) || 15),
      flatMealRate: typeof flatMealRate === "number" ? flatMealRate : (Number(flatMealRate) || 100),
      scheduledRate: scheduledRate ? Number(scheduledRate) : null,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null
    };

    if (policy) {
      if (!policy.rateHistory) policy.rateHistory = [];
      if (policy.rateHistory.length === 0 && policy.flatMealRate) {
        policy.rateHistory.push({ rate: policy.flatMealRate, effectiveFrom: null, effectiveTo: null });
      }
      if (updateFields.scheduledRate && updateFields.effectiveFrom) {
        const alreadyInHistory = policy.rateHistory.some(h =>
          h.rate === updateFields.scheduledRate &&
          h.effectiveFrom &&
          new Date(h.effectiveFrom).getTime() === new Date(updateFields.effectiveFrom).getTime()
        );
        if (!alreadyInHistory) {
          // If there's an existing active entry without effectiveTo, cap it to day before new effectiveFrom
          if (policy.rateHistory.length > 0) {
            const lastEntry = policy.rateHistory[policy.rateHistory.length - 1];
            const effTo = new Date(updateFields.effectiveFrom);
            effTo.setDate(effTo.getDate() - 1);
            effTo.setHours(23, 59, 59, 999);
            lastEntry.effectiveTo = effTo;
          }
          policy.rateHistory.push({
            rate: updateFields.scheduledRate,
            effectiveFrom: updateFields.effectiveFrom,
            effectiveTo: null
          });
        }
      } else if (!updateFields.scheduledRate && updateFields.flatMealRate && policy.rateHistory.length <= 1) {
        if (policy.rateHistory.length === 1 && !policy.rateHistory[0].effectiveFrom) {
          policy.rateHistory[0].rate = updateFields.flatMealRate;
        }
      }
      policy.maxMonthlyOffs = updateFields.maxMonthlyOffs;
      policy.flatMealRate = updateFields.flatMealRate;
      policy.scheduledRate = updateFields.scheduledRate;
      policy.effectiveFrom = updateFields.effectiveFrom;
      await policy.save();
    } else {
      policy = await Policy.create({
        ...updateFields,
        rateHistory: [
          {
            rate: updateFields.flatMealRate,
            effectiveFrom: null,
            effectiveTo: updateFields.scheduledRate && updateFields.effectiveFrom ? new Date(new Date(updateFields.effectiveFrom).getTime() - 86400000) : null
          },
          ...(updateFields.scheduledRate && updateFields.effectiveFrom ? [{ rate: updateFields.scheduledRate, effectiveFrom: updateFields.effectiveFrom, effectiveTo: null }] : [])
        ]
      });
    }

    res.json(policy);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/policy",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const policy = await Policy.findOne();
    res.json(policy);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/policy/rate-history",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const policy = await Policy.findOne();
    res.json(policy?.rateHistory || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// HOSTEL ROUTES  (/api/admin/hostels)
// ============================================================

// Add hostel
app.post("/api/admin/hostels",authenticateToken,requireAdmin, menuUpload.single("messMenuImage"), async (req, res) => {
  try {
    const { name, capacity, description, wardens, caretakers, messVendor } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: "Hostel name is required" });

    const capNum = parseInt(capacity);
    if (isNaN(capNum) || capNum < 0) {
      return res.status(400).json({ message: "Hostel capacity must be a non-negative number" });
    }

    const trimmedName = name.trim();
    const existing = await Hostel.findOne({ name: trimmedName });
    if (existing) {
      return res.status(409).json({ message: `Hostel "${trimmedName}" already exists` });
    }

    const hostel = new Hostel({
      name: trimmedName,
      capacity: capNum,
      description,
      wardens: JSON.parse(wardens || "[]"),
      caretakers: JSON.parse(caretakers || "[]"),
      messVendor: JSON.parse(messVendor || "{}"),
      messMenuImage: req.file ? "/uploads/" + req.file.filename : null
    });

    await hostel.save();
    res.status(201).json(hostel);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: `Hostel "${req.body.name?.trim()}" already exists` });
    }
    res.status(500).json({ message: err.message });
  }
});

// Get all hostels (admin view)
app.get("/api/admin/hostels",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const hostels = await Hostel.find().sort({ createdAt: -1 });
    const sanitized = hostels.map(h => {
      const obj = h.toObject();
      obj.capacity = Math.max(0, parseInt(obj.capacity) || 0);
      return obj;
    });
    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update hostel
app.put("/api/admin/hostels/:id",authenticateToken,requireAdmin, menuUpload.single("messMenuImage"), async (req, res) => {
  try {
    const oldHostel = await Hostel.findById(req.params.id);
    if (!oldHostel) return res.status(404).json({ message: "Hostel not found" });

    const { name, capacity, description, wardens, caretakers, messVendor } = req.body;
    const newName = (name !== undefined ? name : oldHostel.name).trim();

    if (!newName) return res.status(400).json({ message: "Hostel name cannot be empty" });

    let capNum = oldHostel.capacity;
    if (capacity !== undefined) {
      capNum = parseInt(capacity);
      if (isNaN(capNum) || capNum < 0) {
        return res.status(400).json({ message: "Hostel capacity must be a non-negative number" });
      }
    }

    if (newName !== oldHostel.name) {
      const conflict = await Hostel.findOne({ _id: { $ne: req.params.id }, name: newName });
      if (conflict) {
        return res.status(409).json({ message: `A hostel with name "${newName}" already exists` });
      }
    }

    const updateData = {
      name: newName,
      capacity: capNum,
      description,
      wardens: JSON.parse(wardens || "[]"),
      caretakers: JSON.parse(caretakers || "[]"),
      messVendor: JSON.parse(messVendor || "{}")
    };
    if (req.file) updateData.messMenuImage = "/uploads/" + req.file.filename;

    const hostel = await Hostel.findByIdAndUpdate(req.params.id, updateData, { new: true });

    // Cascade rename to Student, User, Vendor if hostel name changed
    if (newName !== oldHostel.name) {
      await Promise.all([
        Student.updateMany({ hostel: oldHostel.name }, { hostel: newName }),
        User.updateMany({ hostel: oldHostel.name }, { hostel: newName }),
        Vendor.updateMany({ hostel: oldHostel.name }, { hostel: newName })
      ]);
    }

    res.json(hostel);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: `A hostel with name "${req.body.name?.trim()}" already exists` });
    }
    res.status(500).json({ message: err.message });
  }
});

// Delete hostel
app.delete("/api/admin/hostels/:id",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const hostel = await Hostel.findById(req.params.id);
    if (!hostel) return res.status(404).json({ message: "Hostel not found" });

    const [studentCount, vendorCount] = await Promise.all([
      Student.countDocuments({ hostel: hostel.name }),
      Vendor.countDocuments({ hostel: hostel.name })
    ]);

    if (studentCount > 0 || vendorCount > 0) {
      return res.status(409).json({
        message: `Cannot delete hostel "${hostel.name}": it is currently assigned to ${studentCount} student(s) and ${vendorCount} vendor(s). Please reassign them first.`
      });
    }

    await Hostel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// NOTICE ROUTES  (/api/admin/notices)
// ============================================================

// Post admin notice
app.post("/api/admin/add-notice",authenticateToken,requireAdmin, upload.single("attachment"), async (req, res) => {
  try {
    const newNotice = new Notice({
      content: req.body.content,
      attachment: req.file ? req.file.filename : null
    });
    await newNotice.save();
    res.status(201).json(newNotice);
  } catch (err) {
    res.status(500).json({ message: "Error posting notice" });
  }
});

// Get admin notices
app.get("/api/admin/notices",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    res.json(notices);
  } catch (err) {
    res.status(500).json({ message: "Error fetching notices" });
  }
});

// Delete admin notice
app.delete("/api/admin/delete-notice/:id",authenticateToken,requireAdmin, async (req, res) => {
  try {
    await Notice.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ============================================================
// STUDENT MANAGEMENT ROUTES
// ============================================================

// Add student
app.post("/api/admin/add-student",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { name, regNo, branch, year, email, phone } = req.body;
    const password = req.body.password || "Password@123";
    if (typeof password !== "string" || !password.trim()) {
      return res.status(400).json({
        success: false,
        message: "A valid password is required"
    });
  } 

const hashedPassword = await hashPassword(password);
    if (!name || !regNo || !branch || !year || !email) {
      return res.status(400).json({ success: false, message: "Required fields missing" });
    }

    if (phone && !/^\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ success: false, message: "Phone number must be exactly 10 digits" });
    }

    const hostelName = (req.body.hostel || "").trim();
    if (hostelName) {
      const exists = await Hostel.findOne({ name: hostelName });
      if (!exists) {
        return res.status(400).json({ success: false, message: `Hostel "${hostelName}" does not exist in the hostel directory` });
      }
    }

    const newStudent = new Student({
      ...req.body,
      password: hashedPassword,
      phone: phone ? String(phone).trim() : "",
      hostel: hostelName
    });
    await newStudent.save();

    // Auto-sync to studentDB so student can log in immediately
    await User.findOneAndUpdate(
      { email: req.body.email },
      {
        email: req.body.email,
        password: hashedPassword,
        fullName: req.body.name,
        room: req.body.room || "",
        hostel: hostelName,
        phone: req.body.phone || ""
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(201).json({ success: true, message: "Student added successfully" });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: "Registration number or Email already in use!" });
    res.status(500).json({ success: false, message: "An error occurred while saving." });
  }
});

// Bulk import students via CSV
const csv = require("csv-parse/sync");

app.post("/api/admin/import-students",authenticateToken,requireAdmin, upload.single("csvFile"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const fileContent = require("fs").readFileSync(req.file.path, "utf8");
    const records = csv.parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });

    const validHostels = new Set((await Hostel.find({}, "name")).map(h => h.name));

    let added = 0, skipped = 0;
    const errors = [];

    for (const row of records) {
      try {
        const password = row.password || "Password@123";

        if (typeof password !== "string" || !password.trim()) {
          errors.push(`Row ${row.regNo || "?"}: Invalid password`);
          continue;
        }
        const hashedPassword = await hashPassword(password);
        const hostelVal = (row.hostel || "").trim();
        if (hostelVal && !validHostels.has(hostelVal)) {
          errors.push(`Row ${row.regNo || "?"}: Hostel "${hostelVal}" does not exist`);
          continue;
        }

        const student = new Student({
          name: row.name,
          regNo: row.regNo,
          branch: row.branch,
          year: row.year,
          hostel: hostelVal,
          room: row.room || "",
          email: row.email,
          phone: row.phone || "",
          password: hashedPassword
        });
        await student.save();

        await User.findOneAndUpdate(
          { email: row.email },
          { email: row.email, password: hashedPassword, fullName: row.name, room: row.room || "", hostel: hostelVal, phone: row.phone || "" },
          { upsert: true, new: true }
        );
        added++;
      } catch (err) {
        if (err.code === 11000) skipped++;
        else errors.push(`Row ${row.regNo || "?"}: ${err.message}`);
      }
    }

    require("fs").unlinkSync(req.file.path);
    res.json({ success: true, added, skipped, errors });
  } catch (err) {
    res.status(500).json({ message: "Failed to parse CSV: " + err.message });
  }
});

// Get all students

app.get("/api/admin/students",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const students = await Student.find()
      .select("-password -resetToken -resetTokenExpiry");

    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Update student
app.put("/api/admin/update-student/:id",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const oldStudent = await Student.findById(req.params.id);
    if (!oldStudent) return res.status(404).json({ message: "Student not found" });

    if (req.body.phone !== undefined && req.body.phone !== "" && !/^\d{10}$/.test(String(req.body.phone).trim())) {
      return res.status(400).json({ message: "Phone number must be exactly 10 digits" });
    }

    let hostelName = oldStudent.hostel || "";
    if (req.body.hostel !== undefined) {
      hostelName = (req.body.hostel || "").trim();
      // If changing to a new non-empty hostel (not keeping existing legacy value)
      if (hostelName && hostelName !== oldStudent.hostel) {
        const exists = await Hostel.findOne({ name: hostelName });
        if (!exists) {
          return res.status(400).json({ message: `Hostel "${hostelName}" does not exist in the hostel directory` });
        }
      }
    }

    const updatePayload = {
      ...req.body,
      phone: req.body.phone !== undefined ? String(req.body.phone).trim() : oldStudent.phone,
      hostel: hostelName
    };
    if (req.body.password !== undefined && req.body.password !== "") {
      if (typeof req.body.password !== "string" || !req.body.password.trim()) {
        return res.status(400).json({ message: "A valid password is required" });
      }
      updatePayload.password = await hashPassword(req.body.password);
    } else {
      delete updatePayload.password;
    }
    const updated = await Student.findByIdAndUpdate(req.params.id, updatePayload, { new: true, runValidators: true });

    const userUpdate = {
      email: req.body.email || oldStudent.email,
      fullName: req.body.name || oldStudent.name,
      room: req.body.room !== undefined ? req.body.room : (oldStudent.room || ""),
      hostel: hostelName,
      phone: req.body.phone !== undefined? String(req.body.phone).trim():(oldStudent.phone || "")
  };

  if (updatePayload.password) {
      userUpdate.password = updatePayload.password;
  }

    await User.findOneAndUpdate(
      { email: oldStudent.email },
      userUpdate,
      { upsert: true, new: true, runValidators: true }
    );

    const studentResponse = updated.toObject();
    delete studentResponse.password;
    res.json(studentResponse);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete student
app.delete("/api/admin/delete-student/:id",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (student) {
      await Student.findByIdAndDelete(req.params.id);
      await User.findOneAndDelete({ email: student.email });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Restore student (with duplicate checking)
app.post("/api/admin/restore-student",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { name, regNo, branch, year, hostel, room, email, phone, password } = req.body;

    if (!name || !regNo || !email) {
      return res.status(400).json({ success: false, message: "Missing required student data for restore" });
    }

    const studentPassword = password || "Password@123";
    if (typeof studentPassword !== "string" || !studentPassword.trim()) {
      return res.status(400).json({
        success: false,
        message: "A valid password is required"
      });
    }
    const hashedPassword = await hashPassword(studentPassword);

    // Check if already exists to avoid duplicates
    const existing = await Student.findOne({
      $or: [{ regNo }, { email }]
    });

    if (existing) {
      return res.status(409).json({ success: false, message: "Student record already exists" });
    }

    const restored = new Student({
      name,
      regNo,
      branch: branch || "N/A",
      year: year || "1st",
      hostel: hostel || "",
      room: room || "",
      email,
      phone: phone || "",
      password: hashedPassword
    });
    await restored.save();

    await User.findOneAndUpdate(
      { email },
      {
        email,
        password: hashedPassword,
        fullName: name,
        room: room || "",
        hostel: hostel || "",
        phone: phone || ""
      },
      { upsert: true, new: true, runValidators: true }
    );
    const studentResponse = restored.toObject();
    delete studentResponse.password;
    res.status(201).json({ success: true, student: studentResponse });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// ADMIN ACCOUNT ROUTES
// ============================================================

// Add admin
app.post("/add-admin",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (typeof password !== "string" || !password.trim()) {
      return res.status(400).json({
        success: false,
        message: "A valid password is required"
      });
    }
    const hashedPassword = await hashPassword(password);
    const newAdmin = new Admin({
      name,
      email,
      password: hashedPassword
    });
    await newAdmin.save();
    res.json({
      success: true,
      message: "Admin Added",
      admin: {
        id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email
      }
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, error: "This admin email already exists!" });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all admins
app.get("/admins",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const admins = await Admin.find();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update admin password

app.post("/update-password",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const {
      email,
      currentPassword,
      newPassword,
      confirmPassword
    } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof currentPassword !== "string" ||
      !currentPassword ||
      typeof newPassword !== "string" ||
      !newPassword.trim() ||
      typeof confirmPassword !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid current and new passwords are required"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    const admin = await Admin.findOne({ 
      email: email.trim().toLowerCase()
     });

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: "Current password incorrect"
      });
    }

    // Support existing plaintext passwords temporarily
    const isBcryptHash =
      /^\$2[aby]\$\d{2}\$/.test(admin.password || "");

    const passwordMatches = isBcryptHash
      ? await verifyPassword(currentPassword, admin.password)
      : admin.password === currentPassword;

    if (!passwordMatches) {
      return res.status(400).json({
        success: false,
        message: "Current password incorrect"
      });
    }

    admin.password = await hashPassword(newPassword);
    await admin.save();

    return res.json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (err) {
    console.error("Admin password update error:", err);

    return res.status(500).json({
      success: false,
      message: "Server error updating password"
    });
  }
}); 


// ============================================================
// LOGIN ROUTE  (admin + student + vendor)
// ============================================================


app.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Temporarily supports both plaintext and bcrypt passwords
    async function checkStoredPassword(enteredPassword, storedPassword) {
      if (typeof storedPassword !== "string" || !storedPassword) {
        return false;
      }

      const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(storedPassword);

      if (isBcryptHash) {
        return verifyPassword(enteredPassword, storedPassword);
      }

      // Temporary compatibility for existing accounts
      return enteredPassword === storedPassword;
    }

    // 1. Admin login
    const admin = await Admin.findOne({ email });

    if (admin) {
      const valid = await checkStoredPassword(password, admin.password);

      if (!valid) {
        return res.json({ success: false, message: "Invalid password" });
      }

      const token = jwt.sign(
        {
        sub: admin._id.toString(),
        role: "admin"
        },
        process.env.JWT_SECRET,
        {
          algorithm: "HS256",
          expiresIn: "1h"
        }
      );

      return res.json({
        success: true,
        role: "admin",
        token
      });
    }

    // 2. Vendor login
    const vendor = await Vendor.findOne({ email });

    if (vendor) {
      const valid = await checkStoredPassword(password, vendor.password);

      if (!valid) {
        return res.json({ success: false, message: "Invalid password" });
      }

      const token = jwt.sign({
        sub: vendor._id.toString(),
        role : "vendor"
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "1h"
      });
      return res.json({
        success: true,
        role: "vendor",
        vendorId: vendor._id.toString(),
        token
      });
    }

    // 3. Student login
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const valid = await checkStoredPassword(password, user.password);

    if (!valid) {
      return res.json({ success: false, message: "Invalid password" });
    }

    const token = jwt.sign({
      sub: user._id.toString(),
      role: "student"
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "1h"
    });
    return res.json({
      success: true,
      role: "student",
      token
    });

  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


// ============================================================
// STUDENT-FACING PUBLIC ROUTES
// ============================================================

// Get all hostels (student view)
app.get("/api/hostels", async (req, res) => {
  try {
    const hostels = await Hostel.find().sort({ createdAt: -1 });
    const sanitized = hostels.map(h => {
      const obj = h.toObject();
      obj.capacity = Math.max(0, parseInt(obj.capacity) || 0);
      return obj;
    });
    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch hostel data" });
  }
});

// Get weekly mess menu image
app.get("/api/menu", async (req, res) => {
  try {
    const hostelName = req.query.hostel || "";
    const hostel = await Hostel.findOne({ name: hostelName });
    res.json({ menuImage: hostel?.messMenuImage || null, hostel: hostelName });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch menu" });
  }
});

// Get student-facing notices (from admin Notice collection)
app.get("/api/notices", async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    const mapped = notices.map(n => ({
      title: n.content,
      pdfUrl: n.attachment ? `http://localhost:5000/uploads/${n.attachment}` : null,
      createdAt: n.createdAt
    }));
    res.json(mapped);
  } catch (err) {
    console.error("/api/notices error:", err);
    res.status(500).json({ error: "Failed to fetch notices" });
  }
});

// ============================================================
// STUDENT PROFILE & PREFERENCES
// ============================================================

// Get student profile

app.get(
  "/api/student/profile",
  authenticateToken,
  requireStudent,
  async (req, res) => {
    try {
      // Use the verified JWT identity, not a browser-supplied ID.
      const user = await User.findById(req.user.sub);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Student not found"
        });
      }

      res.json({
        name: user.fullName || user.email.split("@")[0],
        fullName: user.fullName || "--",
        room: user.room || "--",
        hostel: user.hostel || "--",
        phone: user.phone || "--",
        email: user.email,
        profileImage: ""
      });
    } catch (err) {
      console.error("Student profile error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch student profile"
      });
    }
  }
);


// Get preferences

app.get(
  "/api/student/preferences",
  authenticateToken,
  requireStudent,
  async (req, res) => {
    try {
      // Get the student identity from the verified JWT
      const user = await User.findById(req.user.sub);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Student not found"
        });
      }

      // Never trust a studentId supplied by the browser
      const studentId = user.email;

      let pref = await Preference.findOne({ studentId });

      if (!pref) {
        const defaultMeal = {
          breakfast: "veg",
          lunch: "veg",
          dinner: "veg"
        };

        pref = new Preference({
          studentId,
          preferences: {
            mon: { ...defaultMeal },
            tue: { ...defaultMeal },
            wed: { ...defaultMeal },
            thu: { ...defaultMeal },
            fri: { ...defaultMeal },
            sat: { ...defaultMeal },
            sun: { ...defaultMeal }
          }
        });

        await pref.save();
      }

      res.json({ preferences: pref.preferences });
    } catch (err) {
      console.error("Student preferences error:", err);

      res.status(500).json({
        success: false,
        message: "Failed to fetch preferences"
      });
    }
  }
);


// Save preferences

app.post(
  "/api/student/preferences",
  authenticateToken,
  requireStudent,
  async (req, res) => {
    try {
      const { preferences } = req.body;

      if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
        return res.status(400).json({
          success: false,
          message: "Valid preferences are required"
        });
      }

      const user = await User.findById(req.user.sub);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Student not found"
        });
      }

      // Always save against the authenticated student's email
      await Preference.findOneAndUpdate(
        { studentId: user.email },
        { $set: { preferences } },
        { upsert: true, new: true, runValidators: true }
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Save student preferences error:", err);

      res.status(500).json({
        success: false,
        message: "Failed to save preferences"
      });
    }
  }
);


// ============================================================
// FOOD CANCEL ROUTES
// ============================================================

// Submit cancel request
app.post("/api/student/cancel-request", authenticateToken, requireStudent, async (req, res) => {
  try {
    const { fromDate, toDate, reason } = req.body;
    const user = await User.findById(req.user.sub);

    if (!user) {
      return res.json({
        success: false,
        message: "Student not found"
      });
    }

    const email = user.email;
    const studentRecord = await Student.findOne({ email });
    const name = studentRecord?.name || email;
    const regdNo = studentRecord?.regNo || "";

    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);

    const to = new Date(toDate);
    to.setHours(0, 0, 0, 0);

    if (to < from) {
      return res.json({
        success: false,
        message: "Invalid date range"
      });
    }

    const dayCount =
      Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;

    // Split cancellation days across months
    const monthBreakdown = {};

    for (let i = 0; i < dayCount; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);

      const k = monthKey(d);
      monthBreakdown[k] = (monthBreakdown[k] || 0) + 1;
    }

    const studentDoc = await FoodCancel.findOne({
      studentId: email
    });

    // ============================================================
    // PERSONAL LEAVE LIMIT
    // ============================================================

    if (reason === "personal") {
      for (const [k, days] of Object.entries(monthBreakdown)) {
        const usedThisMonth =
          studentDoc?.monthlyUsage?.get(k) || 0;

        if (usedThisMonth + days > 5) {
          return res.json({
            success: false,
            message: `Monthly limit exceeded for ${k}. You used ${usedThisMonth}/5 days.`
          });
        }
      }
    }

    // ============================================================
    // CREATE CANCELLATION ENTRY
    // ============================================================

    const newEntry = {
      fromDate: from,
      toDate: to,
      daysCancelled: dayCount,
      reason,
      status: reason === "personal" ? "approved" : "pending",
      submittedAt: new Date()
    };

    // ============================================================
    // UPDATE MONTHLY PERSONAL USAGE
    // ============================================================

    const usageInc = {};

    if (reason === "personal") {
      for (const [k, days] of Object.entries(monthBreakdown)) {
        usageInc[`monthlyUsage.${k}`] = days;
      }
    }

    // ============================================================
    // SAVE CANCELLATION
    // ============================================================

    if (!studentDoc) {
      await FoodCancel.findOneAndUpdate(
        { studentId: email },
        {
          $setOnInsert: {
            name,
            regdNo,
            email
          },
          $push: {
            cancellations: newEntry
          },
          ...(Object.keys(usageInc).length > 0 && {
            $inc: usageInc
          })
        },
        {
          upsert: true,
          new: true
        }
      );
    } else {
      await FoodCancel.findOneAndUpdate(
        { studentId: email },
        {
          $push: {
            cancellations: newEntry
          },
          ...(Object.keys(usageInc).length > 0 && {
            $inc: usageInc
          })
        }
      );
    }

    // ============================================================
    // RECALCULATE BILL FOR PERSONAL LEAVE
    // ============================================================

    // Personal leave is automatically approved.
    // Recalculate already-existing billed months so the
    // approved leave dates are removed from the food bill.

    if (reason === "personal") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const billingDoc = await StudentBilling.findOne({
        studentId: email
      });

      if (billingDoc) {
        const user = await User.findOne({
          email
        });

        for (const monthKeyValue of Object.keys(monthBreakdown)) {
          const [y, m] = monthKeyValue.split("-").map(Number);

          // Do not modify future months
          const monthStart = new Date(y, m - 1, 1);
          monthStart.setHours(0, 0, 0, 0);

          if (monthStart > today) {
            continue;
          }

          // Only recalculate if that month already has a bill
          const existingMonthBill =
            billingDoc.monthlyBills?.some(
              b => b.monthKey === monthKeyValue
            );

          if (!existingMonthBill) {
            continue;
          }

          // Recalculate the full month.
          // computeMonthlyBill() already ignores approved
          // cancellation dates.
          const bill = await computeMonthlyBill(
            email,
            y,
            m - 1
          );

          // false = replace existing month bill
          // true would ADD to the old bill, which we do NOT want.
          await upsertMonthBill(
            email,
            user?.fullName || name || email,
            bill,
            false
          );
        }
      }
    }

    // ============================================================
    // RESPONSE
    // ============================================================

    res.json({
      success: true,
      message:
        reason === "personal"
          ? "Meals cancelled successfully and billing updated"
          : "Official request sent for admin approval"
    });

  } catch (err) {
    console.error("Cancel Request Error:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Get cancel status (days used this month + pending official count)
app.get("/api/student/cancel-status", authenticateToken, requireStudent, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    const studentId = user.email;

    const key = monthKey(new Date());
    const studentDoc = await FoodCancel.findOne({ studentId });

    const personalUsed = studentDoc?.monthlyUsage?.get(key) || 0;
    const pendingOfficial = studentDoc
      ? studentDoc.cancellations.filter(c => c.reason === "official" && c.status === "pending").length
      : 0;

    res.json({ personalUsed, personalLimit: 5, pendingOfficial });
  } catch (err) {
    console.error("Cancel Status Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================================
// COUPON ROUTES
// ============================================================

// Get today's coupon for a student
app.get("/api/student/coupon/today",authenticateToken, requireStudent, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    const studentId = user.email;
    if (!user) return res.json({ hasCoupon: false, reason: "User not found" });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if today is cancelled
    const studentDoc = await FoodCancel.findOne({ studentId });
    if (studentDoc && isDateCancelled(today, studentDoc.cancellations)) {
      return res.json({ hasCoupon: false, reason: "Food cancelled for today" });
    }

    // Fetch preferences
    const prefDoc = await Preference.findOne({ studentId });
    if (!prefDoc) return res.json({ hasCoupon: false, reason: "Preferences not set" });

    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayKey = days[today.getDay()];
    const todayMeals = prefDoc.preferences[todayKey];

    if (!todayMeals) return res.json({ hasCoupon: false, reason: "No preference for today" });

    res.json({
      hasCoupon: true,
      couponData: {
        name: user.fullName || user.email,
        room: user.room || "--",
        hostel: user.hostel || "--",
        date: today.toISOString().split("T")[0],
        meals: { breakfast: todayMeals.breakfast, lunch: todayMeals.lunch, dinner: todayMeals.dinner }
      }
    });
  } catch (err) {
    console.error("Coupon Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Vendor: get coupon summary for a given date
app.get("/api/vendor/coupon-summary",authenticateToken,requireVendor, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const allUsers = await User.find();
    const cancellations = await FoodCancel.find();

    const summary = {
      date,
      totalCoupons: 0,
      breakfast: { veg: 0, nonveg: 0 },
      lunch: { veg: 0, nonveg: 0 },
      dinner: { veg: 0, nonveg: 0 }
    };

    for (const user of allUsers) {
      const studentCancel = cancellations.find(c => c.studentId === user.email);
      if (studentCancel && isDateCancelled(targetDate, studentCancel.cancellations)) continue;

      summary.totalCoupons++;
      const pref = await Preference.findOne({ studentId: user.email });
      const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][targetDate.getDay()];
      const dayPref = pref?.preferences?.[dayKey] || { breakfast: "veg", lunch: "veg", dinner: "veg" };

      ["breakfast", "lunch", "dinner"].forEach(slot => {
        summary[slot][dayPref[slot] === "non-veg" ? "nonveg" : "veg"]++;
      });
    }

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================================
// BILLING ROUTES
// ============================================================

/**
 * Helper: ensure billing doc exists and initialize lastBilledDate if not set.
 * Returns the billing doc after ensuring it exists.
 */
async function ensureBillingDoc(studentId, name) {
  let doc = await StudentBilling.findOne({ studentId });
  if (!doc) {
    doc = await StudentBilling.create({
      studentId,
      name,
      monthlyBills: [],
      payments: [],
      otherCharges: [],
      previousBalance: 0,
      previousOtherBalance: 0
    });
  }
  return doc;
}

/**
 * Incrementally accrue billing from lastBilledDate+1 to today.
 * Prevents double-billing on every page load.
 * Updates lastBilledDate in DB after processing.
 */
async function accrueIncrementalBilling(studentId, name, asOfDate, customFromDate) {
  const today = asOfDate ? new Date(asOfDate) : new Date();
  today.setHours(0, 0, 0, 0);

  const doc = await ensureBillingDoc(studentId, name);

  // Determine starting date
  let fromDate;
  if (customFromDate) {
    fromDate = new Date(customFromDate);
    fromDate.setHours(0, 0, 0, 0);
  } else if (doc.lastBilledDate) {
    fromDate = new Date(doc.lastBilledDate);
    fromDate.setHours(0, 0, 0, 0);
    fromDate.setDate(fromDate.getDate() + 1); // day AFTER last billed
  } else if (doc.monthlyBills && doc.monthlyBills.length > 0) {
    // If student already has bills computed, initialize lastBilledDate to today
    await StudentBilling.updateOne({ studentId }, { $set: { lastBilledDate: today } });
    return await StudentBilling.findOne({ studentId });
  } else {
    // Brand new student: initialize lastBilledDate to today so they start with ₹0 and no retroactive charges
    await StudentBilling.updateOne({ studentId }, { $set: { lastBilledDate: today } });
    return await StudentBilling.findOne({ studentId });
  }

  // Nothing to do if we are already up to date
  if (fromDate > today) return doc;

  // Group days into calendar months and process each
  let cursor = new Date(fromDate);
  while (cursor <= today) {
    const curYear  = cursor.getFullYear();
    const curMonth = cursor.getMonth();

    // Determine end of range for this month
    const monthEnd = new Date(curYear, curMonth + 1, 0); // last day of month
    monthEnd.setHours(0, 0, 0, 0);
    const toDate = monthEnd < today ? monthEnd : today;

    // Only compute if there are days to bill
    if (cursor <= toDate) {
      const bill = await computeMonthlyBill(studentId, curYear, curMonth, cursor, toDate);

      if (bill.amountDue > 0 || bill.totalMeals > 0) {
        // Use incremental mode: add to existing month's amountDue
        await upsertMonthBill(studentId, name, bill, true);
      }
    }

    // Advance cursor to first day of next month
    cursor = new Date(curYear, curMonth + 1, 1);
  }

  // Update lastBilledDate to today
  await StudentBilling.updateOne({ studentId }, { $set: { lastBilledDate: today } });

  return await StudentBilling.findOne({ studentId });
}

// Student: get current month billing
app.get("/api/student/billing", authenticateToken, requireStudent, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }
    const studentId = user.email;
    const name = user.fullName || user.email;

    // Accrue only new (unbilled) days — prevents double-billing on refresh
    const billingDoc = await accrueIncrementalBilling(studentId, name);

    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const allMonths = billingDoc?.monthlyBills || [];
    const currentMonthEntry = allMonths.find(b => b.monthKey === currentMonthKey);

    const summary = calculateBillingSummary(billingDoc);

    res.json({
      studentId:          studentId,
      name,
      monthKey:           currentMonthKey,
      monthLabel:         currentMonthEntry?.monthLabel || "",
      totalMeals:         currentMonthEntry?.totalMeals || 0,
      amountPerMeal:      currentMonthEntry?.amountPerMeal || 0,
      amountDue:          currentMonthEntry?.amountDue || 0,
      newCharges:         currentMonthEntry?.amountDue || 0,
      breakdown:          currentMonthEntry?.breakdown || [],
      ...summary,
      monthlyBreakdown:   allMonths,
      otherCharges:       billingDoc?.otherCharges || [],
      paymentHistory:     billingDoc?.payments || []
    });
  } catch (err) {
    console.error("Billing Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: get one student's full billing history
app.get("/api/admin/student-billing",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    let email = studentId;
    const sDoc = await Student.findOne({ $or: [{ email: studentId }, { regNo: studentId }] });
    if (sDoc?.email) email = sDoc.email;

    const user = await User.findOne({ email });
    const name = user?.fullName || sDoc?.name || email;

    const billingDoc = await accrueIncrementalBilling(email, name);
    const summary = calculateBillingSummary(billingDoc);
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const allMonths = billingDoc?.monthlyBills || [];
    const currentMonthEntry = allMonths.find(b => b.monthKey === currentMonthKey);

    res.json({
      studentId: email,
      name,
      currentMonth: currentMonthEntry || null,
      monthlyBreakdown: allMonths,
      otherCharges: billingDoc?.otherCharges || [],
      payments: billingDoc?.payments || [],
      ...summary
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: get all students billing summary (with correct outstanding balance and separate categories)
app.get("/api/admin/billing/all",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const allUsers = await User.find();
    const allStudents = await Student.find();
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    // Combine users and students by email/identifier
    const studentMap = new Map();
    for (const u of allUsers) {
      if (u.email) {
        studentMap.set(u.email.toLowerCase(), {
          email: u.email,
          name: u.fullName || u.email,
          room: u.room || "—",
          hostel: u.hostel || "—",
          regNo: "—",
          year: "—"
        });
      }
    }
    for (const s of allStudents) {
      const emailKey = (s.email || s.regNo || "").toLowerCase();
      if (!emailKey) continue;
      const existing = studentMap.get(emailKey) || {};
      studentMap.set(emailKey, {
        email: s.email || existing.email || s.regNo,
        name: s.name || existing.name || s.email,
        room: s.room || existing.room || "—",
        hostel: s.hostel || existing.hostel || "—",
        regNo: s.regNo || existing.regNo || "—",
        year: s.year || existing.year || "—"
      });
    }

    const studentsList = Array.from(studentMap.values());

    const report = await Promise.all(studentsList.map(async (student) => {
      const studentId = student.email;

      // Accrue only unbilled days — safe on refresh
      const billingDoc = await accrueIncrementalBilling(studentId, student.name);
      const summary = calculateBillingSummary(billingDoc);
      const allMonths   = billingDoc?.monthlyBills || [];
      const currentMonthEntry = allMonths.find(b => b.monthKey === currentMonthKey);

      return {
        studentId,
        regNo:              student.regNo,
        name:               student.name,
        room:               student.room,
        hostel:             student.hostel,
        year:               student.year,
        // Separated Food Billing:
        foodTotal:          summary.foodTotal,
        foodPaid:           summary.foodPaid,
        foodOutstanding:    summary.foodOutstanding,
        // Separated Other/Hostel Billing:
        otherTotal:         summary.otherTotal,
        otherPaid:          summary.otherPaid,
        otherOutstanding:   summary.otherOutstanding,
        // Overall Billing:
        overallTotal:       summary.overallTotal,
        overallPaid:        summary.overallPaid,
        overallOutstanding: summary.overallOutstanding,
        status:             summary.status,
        // Legacy compatibility fields:
        messBill:           currentMonthEntry?.amountDue || 0,
        hostelBill:         summary.otherTotal,
        grandTotal:         summary.overallOutstanding,
        outstandingBalance: summary.overallOutstanding,
        totalCharged:       summary.overallTotal,
        totalPaid:          summary.overallPaid,
        previousBalance:    summary.previousBalance,
        previousOtherBalance: summary.previousOtherBalance,
        monthlyBreakdown:   allMonths,
        otherCharges:       billingDoc?.otherCharges || [],
        payments:           billingDoc?.payments || []
      };
    }));

    res.json(report);
  } catch (err) {
    console.error("Admin billing all error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Admin: manually override a specific month's amountDue (admin adjustment, NOT Clear All)
app.patch("/api/admin/bills/:id",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { month, messBill } = req.body;

    // Resolve student by email, regNo, _id or index
    let student = await Student.findOne({
      $or: [{ email: id }, { regNo: id }]
    });

    if (!student && mongoose.Types.ObjectId.isValid(id)) {
      student = await Student.findById(id);
    }

    if (!student) {
      const allS = await Student.find();
      const idx = parseInt(id) - 1;
      if (!isNaN(idx) && allS[idx]) student = allS[idx];
    }

    if (!student) {
      const allUsers = await User.find();
      const idx = parseInt(id) - 1;
      const user = (!isNaN(idx) && allUsers[idx]) ? allUsers[idx] : await User.findOne({ email: id });
      if (user) student = { email: user.email, name: user.fullName || user.email };
    }

    if (!student) return res.status(404).json({ error: "Student not found" });

    const studentId = student.email;
    const targetMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const [yStr, mStr] = targetMonth.split("-");
    const year = parseInt(yStr) || new Date().getFullYear();
    const mIdx = (parseInt(mStr) || (new Date().getMonth() + 1)) - 1;

    // Recompute for label/meals, then override amountDue if provided
    const bill = await computeMonthlyBill(studentId, year, mIdx);
    if (messBill !== undefined && !isNaN(Number(messBill))) {
      bill.amountDue = Number(messBill);
    }

    await upsertMonthBill(studentId, student.name || studentId, bill);

    const billingDoc = await StudentBilling.findOne({ studentId });
    const outstanding = calculateOutstanding(billingDoc);

    res.json({
      success: true,
      message: "Bill saved successfully",
      bill: {
        id,
        studentId,
        month: targetMonth,
        monthLabel: bill.monthLabel,
        totalMeals: bill.totalMeals,
        amountPerMeal: bill.amountPerMeal,
        amountDue: bill.amountDue,
        messBill: bill.amountDue
      },
      ...outstanding
    });
  } catch (err) {
    console.error("Save bill error:", err);
    res.status(500).json({ error: "Failed to save bill: " + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Record a payment
// POST /api/admin/bills/payment
// Body: { studentId, amount, note? }
//
// Adds the payment to payments[] and returns the updated outstanding balance.
// Does NOT modify any amountDue or rateHistory.
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/admin/bills/payment",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { studentId, amount, category, note } = req.body;
    if (!studentId) return res.status(400).json({ error: "studentId required" });
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });

    // Resolve to email
    let email = studentId;
    const sDoc = await Student.findOne({ $or: [{ email: studentId }, { regNo: studentId }] });
    if (sDoc?.email) email = sDoc.email;

    const user = await User.findOne({ email });
    const name = user?.fullName || sDoc?.name || email;

    await ensureBillingDoc(email, name);

    const validCategory = (category === "food" || category === "other") ? category : "overall";

    await StudentBilling.updateOne(
      { studentId: email },
      {
        $push: {
          payments: {
            amount: amt,
            category: validCategory,
            date: new Date(),
            note: (note || "").trim() || `Payment received (${validCategory})`
          }
        }
      }
    );

    const billingDoc = await StudentBilling.findOne({ studentId: email });
    const summary = calculateBillingSummary(billingDoc);

    res.json({
      success: true,
      message: `Payment of ₹${amt} recorded`,
      payment: { amount: amt, category: validCategory, date: new Date(), note: note || "" },
      ...summary
    });
  } catch (err) {
    console.error("Payment error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Add an Other / Hostel Charge
// POST /api/admin/bills/other-charge
// Body: { studentId, amount, title, category?, description? }
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/admin/bills/other-charge",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { studentId, amount, title, category, description } = req.body;
    if (!studentId) return res.status(400).json({ error: "studentId required" });
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });

    let email = studentId;
    const sDoc = await Student.findOne({ $or: [{ email: studentId }, { regNo: studentId }] });
    if (sDoc?.email) email = sDoc.email;

    const user = await User.findOne({ email });
    const name = user?.fullName || sDoc?.name || email;

    await ensureBillingDoc(email, name);

    await StudentBilling.updateOne(
      { studentId: email },
      {
        $push: {
          otherCharges: {
            title: (title || "Hostel Fee").trim(),
            amount: amt,
            category: (category || "hostel").trim(),
            date: new Date(),
            description: (description || "").trim()
          }
        }
      }
    );

    const billingDoc = await StudentBilling.findOne({ studentId: email });
    const summary = calculateBillingSummary(billingDoc);

    res.json({
      success: true,
      message: `Charge of ₹${amt} added successfully for ${name}`,
      charge: { title: title || "Hostel Fee", amount: amt, date: new Date() },
      ...summary
    });
  } catch (err) {
    console.error("Other charge error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: "Clear All" — genuinely clears all outstanding dues (Food + Other)
// POST /api/admin/bills/clean
// Body: { studentId }
// Records clearance payments so balance becomes ₹0, status becomes "Settled",
// and the cleared state is completely persistent across refreshes.
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/admin/bills/clean",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    let email = studentId;
    const sDoc = await Student.findOne({ $or: [{ email: studentId }, { regNo: studentId }] });
    if (sDoc?.email) email = sDoc.email;

    const user = await User.findOne({ email });
    const name = user?.fullName || sDoc?.name || email;
    const billingDoc = await accrueIncrementalBilling(email, name);

    const currentSummary = calculateBillingSummary(billingDoc);

    const newPayments = [];
    if (currentSummary.foodOutstanding > 0) {
      newPayments.push({
        amount: currentSummary.foodOutstanding,
        category: "food",
        date: new Date(),
        note: "Clear All - Cleared food dues"
      });
    }
    if (currentSummary.otherOutstanding > 0) {
      newPayments.push({
        amount: currentSummary.otherOutstanding,
        category: "other",
        date: new Date(),
        note: "Clear All - Cleared hostel/other dues"
      });
    }

    if (newPayments.length > 0) {
      await StudentBilling.updateOne(
        { studentId: email },
        {
          $push: { payments: { $each: newPayments } },
          $set: { notificationsClearedAt: new Date() }
        }
      );
    } else {
      await StudentBilling.updateOne(
        { studentId: email },
        { $set: { notificationsClearedAt: new Date() } }
      );
    }

    const updatedDoc = await StudentBilling.findOne({ studentId: email });
    const updatedSummary = calculateBillingSummary(updatedDoc);

    res.json({
      success: true,
      message: `All dues cleared for ${name}. Outstanding balance is now ₹0 (Settled).`,
      notificationsClearedAt: updatedDoc.notificationsClearedAt,
      ...updatedSummary
    });
  } catch (err) {
    console.error("Clear all error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: "Clear All" (alias supporting single student or bulk)
app.post("/api/admin/bills/clear-all",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { studentId } = req.body;
    if (studentId) {
      let email = studentId;
      const sDoc = await Student.findOne({ $or: [{ email: studentId }, { regNo: studentId }] });
      if (sDoc?.email) email = sDoc.email;

      const user = await User.findOne({ email });
      const name = user?.fullName || sDoc?.name || email;
      const billingDoc = await accrueIncrementalBilling(email, name);

      const currentSummary = calculateBillingSummary(billingDoc);

      const newPayments = [];
      if (currentSummary.foodOutstanding > 0) {
        newPayments.push({
          amount: currentSummary.foodOutstanding,
          category: "food",
          date: new Date(),
          note: "Clear All - Cleared food dues"
        });
      }
      if (currentSummary.otherOutstanding > 0) {
        newPayments.push({
          amount: currentSummary.otherOutstanding,
          category: "other",
          date: new Date(),
          note: "Clear All - Cleared hostel/other dues"
        });
      }

      if (newPayments.length > 0) {
        await StudentBilling.updateOne(
          { studentId: email },
          {
            $push: { payments: { $each: newPayments } },
            $set: { notificationsClearedAt: new Date() }
          }
        );
      } else {
        await StudentBilling.updateOne(
          { studentId: email },
          { $set: { notificationsClearedAt: new Date() } }
        );
      }

      const updatedDoc = await StudentBilling.findOne({ studentId: email });
      const updatedSummary = calculateBillingSummary(updatedDoc);

      return res.json({
        success: true,
        message: `All dues cleared for ${name}. Outstanding balance is now ₹0 (Settled).`,
        ...updatedSummary
      });
    }

    // Bulk clear
    const allBillings = await StudentBilling.find();
    let settledCount = 0;
    for (const b of allBillings) {
      const summary = calculateBillingSummary(b);
      const newPayments = [];
      if (summary.foodOutstanding > 0) {
        newPayments.push({
          amount: summary.foodOutstanding,
          category: "food",
          date: new Date(),
          note: "Clear All (Bulk) - Cleared food dues"
        });
      }
      if (summary.otherOutstanding > 0) {
        newPayments.push({
          amount: summary.otherOutstanding,
          category: "other",
          date: new Date(),
          note: "Clear All (Bulk) - Cleared other dues"
        });
      }
      if (newPayments.length > 0) {
        await StudentBilling.updateOne(
          { studentId: b.studentId },
          {
            $push: { payments: { $each: newPayments } },
            $set: { notificationsClearedAt: new Date() }
          }
        );
        settledCount++;
      }
    }
    res.json({ success: true, message: `Cleared outstanding dues for ${settledCount} students.` });
  } catch (err) {
    console.error("Bulk clear all error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: set previousBalance for a student (manual adjustment for existing pre-digital balances)
app.post("/api/admin/bills/set-previous-balance",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { studentId, previousBalance, previousOtherBalance } = req.body;
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    let email = studentId;
    const sDoc = await Student.findOne({ $or: [{ email: studentId }, { regNo: studentId }] });
    if (sDoc?.email) email = sDoc.email;

    const user = await User.findOne({ email });
    const name = user?.fullName || sDoc?.name || email;
    await ensureBillingDoc(email, name);

    const updateSet = {};
    if (previousBalance !== undefined && !isNaN(parseFloat(previousBalance))) {
      updateSet.previousBalance = parseFloat(previousBalance);
    }
    if (previousOtherBalance !== undefined && !isNaN(parseFloat(previousOtherBalance))) {
      updateSet.previousOtherBalance = parseFloat(previousOtherBalance);
    }

    await StudentBilling.updateOne({ studentId: email }, { $set: updateSet });

    const billingDoc = await StudentBilling.findOne({ studentId: email });
    const summary = calculateBillingSummary(billingDoc);
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Process daily billing on demand
// POST /api/admin/billing/process-daily
// Body: { studentId?, targetDate? }
app.post("/api/admin/billing/process-daily",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { studentId, targetDate, fromDate: customFrom } = req.body;
    const target = targetDate ? new Date(targetDate) : new Date();
    target.setHours(0, 0, 0, 0);

    let usersToProcess = [];
    if (studentId) {
      const user = await User.findOne({ email: studentId });
      if (user) {
        usersToProcess = [user];
      } else {
        const sDoc = await Student.findOne({ $or: [{ email: studentId }, { regNo: studentId }] });
        if (sDoc) usersToProcess = [{ email: sDoc.email, fullName: sDoc.name }];
      }
    } else {
      usersToProcess = await User.find();
    }

    const results = [];
    for (const u of usersToProcess) {
      const doc = await accrueIncrementalBilling(u.email, u.fullName || u.email, target, customFrom);
      const summary = calculateBillingSummary(doc);
      results.push({
        studentId: u.email,
        name: u.fullName || u.email,
        lastBilledDate: doc?.lastBilledDate,
        ...summary
      });
    }

    res.json({
      success: true,
      processedCount: results.length,
      targetDate: toDateStr(target),
      results
    });
  } catch (err) {
    console.error("Process daily error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get billing summary for a specific student
// GET /api/admin/billing/summary/:studentId
app.get("/api/admin/billing/summary/:studentId",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const studentId = req.params.studentId;
    let email = studentId;
    const sDoc = await Student.findOne({ $or: [{ email: studentId }, { regNo: studentId }] });
    if (sDoc?.email) email = sDoc.email;

    const user = await User.findOne({ email });
    const name = user?.fullName || sDoc?.name || email;
    const billingDoc = await accrueIncrementalBilling(email, name);
    const summary = calculateBillingSummary(billingDoc);

    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const allMonths = billingDoc?.monthlyBills || [];
    const currentMonthEntry = allMonths.find(b => b.monthKey === currentMonthKey);

    res.json({
      studentId:          email,
      name,
      newCharges:         currentMonthEntry?.amountDue || 0,
      breakdown:          currentMonthEntry?.breakdown || [],
      monthlyBreakdown:   allMonths,
      otherCharges:       billingDoc?.otherCharges || [],
      paymentHistory:     billingDoc?.payments || [],
      ...summary
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Dashboard: Today's eating and skipping statistics
app.get("/api/admin/today-stats",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const nowIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const today = new Date(nowIST);
    today.setHours(0, 0, 0, 0);

    const allStudents = await Student.find();
    const allCancellations = await FoodCancel.find();

    let eating = 0;
    let skipping = 0;

    for (const s of allStudents) {
      const cancelDoc = allCancellations.find(c => c.studentId === s.email || c.regdNo === s.regNo);
      if (cancelDoc && isDateCancelled(today, cancelDoc.cancellations)) {
        skipping++;
      } else {
        eating++;
      }
    }

    res.json({ eating, skipping, total: allStudents.length });
  } catch (err) {
    console.error("Today stats error:", err);
    res.status(500).json({ error: "Failed to calculate today stats" });
  }
});

// Admin: get all students billing report
app.get("/api/admin/all-billing",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const allUsers = await User.find();
    const today = new Date();

    const report = await Promise.all(allUsers.map(async (user) => {
      const studentId = user.email;
      const cancelDoc = await FoodCancel.findOne({ studentId });
      const prefDoc = await Preference.findOne({ studentId });

      const dateCandidates = [];
      if (cancelDoc?.createdAt) dateCandidates.push(new Date(cancelDoc.createdAt));
      if (prefDoc?.createdAt) dateCandidates.push(new Date(prefDoc.createdAt));

      const earliest = dateCandidates.length > 0
        ? dateCandidates.reduce((a, b) => a < b ? a : b)
        : today;

      let y = earliest.getFullYear();
      let m = earliest.getMonth();

      // BUG FIX: Compute & upsert bills month by month (respects manualOverride in DB).
      // Then re-read from DB so grandTotal and breakdown reflect the actual saved values
      // (including any admin-cleared months), not the freshly-computed values.
      while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
        const bill = await computeMonthlyBill(studentId, y, m);
        await upsertMonthBill(studentId, user.fullName || user.email, bill);
        m++; if (m > 11) { m = 0; y++; }
      }

      // Read the authoritative saved state from DB after upsert
      const billingDoc = await StudentBilling.findOne({ studentId });
      const monthlyBreakdown = billingDoc?.monthlyBills || [];
      const grandTotal = monthlyBreakdown.reduce((sum, b) => sum + (b.amountDue || 0), 0);
      const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      const currentMonthEntry = monthlyBreakdown.find(b => b.monthKey === currentMonthKey);

      return {
        studentId,
        name: user.fullName || user.email,
        room: user.room || "--",
        hostel: user.hostel || "--",
        grandTotal,
        currentMonthDue: currentMonthEntry?.amountDue || 0,
        monthlyBreakdown
      };
    }));

    report.sort((a, b) => b.grandTotal - a.grandTotal);
    res.json({ students: report });
  } catch (err) {
    console.error("Admin All Billing Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET pending official leave requests
app.get("/api/admin/leaves/pending",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const allDocs = await FoodCancel.find({ "cancellations.reason": "official", "cancellations.status": "pending" });
    const leaves = [];
    for (const doc of allDocs) {
      const adminStudent = await Student.findOne({ email: doc.studentId });
      doc.cancellations.forEach(c => {
        if (c.reason === "official" && c.status === "pending") {
          leaves.push({ _id: c._id, studentId: doc.studentId, regNo: adminStudent?.regNo || "—", name: doc.name || doc.email, from: c.fromDate, to: c.toDate, reason: c.reason, submittedAt: c.submittedAt });
        }
      });
    }
    res.json(leaves);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// GET processed leave requests
app.get("/api/admin/leaves/processed",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const allDocs = await FoodCancel.find({ "cancellations.reason": "official", "cancellations.status": { $in: ["approved", "rejected"] } });
    const leaves = [];
    for (const doc of allDocs) {
      const adminStudent = await Student.findOne({ email: doc.studentId });
      doc.cancellations.forEach(c => {
        if (c.reason === "official" && (c.status === "approved" || c.status === "rejected")) {
          leaves.push({ _id: c._id, studentId: doc.studentId, regNo: adminStudent?.regNo || "—", name: doc.name || doc.email, from: c.fromDate, to: c.toDate, reason: c.reason, status: c.status });
        }
      });
    }
    res.json(leaves);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// PATCH approve or reject a leave (action: "approved" or "rejected")
app.patch("/api/admin/leaves/:cancellationId",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const { cancellationId } = req.params;
    const { action } = req.body;
    if (!["approved", "rejected"].includes(action)) return res.status(400).json({ error: "Invalid action" });
    const doc = await FoodCancel.findOne({ "cancellations._id": cancellationId });
    if (!doc) return res.status(404).json({ error: "Not found" });
    await FoodCancel.updateOne({ "cancellations._id": cancellationId }, { $set: { "cancellations.$.status": action } });
    if (action === "approved") {
      const entry = doc.cancellations.find(c => c._id.toString() === cancellationId);
      if (entry) {
        const from = new Date(entry.fromDate); const to = new Date(entry.toDate); const today = new Date();
        const months = new Set();
        const cur = new Date(from.getFullYear(), from.getMonth(), 1);
        while (cur <= to) { months.add(`${cur.getFullYear()}-${cur.getMonth()}`); cur.setMonth(cur.getMonth() + 1); }
        const user = await User.findOne({ email: doc.studentId });
        for (const mk of months) {
          const [y, m] = mk.split("-").map(Number);
          if (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
            const bill = await computeMonthlyBill(doc.studentId, y, m);
            await upsertMonthBill(doc.studentId, user?.fullName || doc.studentId, bill);
          }
        }
      }
    }
    res.json({ success: true, action });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// GET student's own official leave statuses (for showing approval notifications)
app.get("/api/student/leaves/status",authenticateToken, requireStudent, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Student not found"
    });
  }

    const studentId = user.email;
    const doc = await FoodCancel.findOne({ studentId });
    if (!doc) return res.json({ leaves: [] });
    const leaves = doc.cancellations.filter(c => c.reason === "official").map(c => ({ _id: c._id, fromDate: c.fromDate, toDate: c.toDate, status: c.status, submittedAt: c.submittedAt }));
    res.json({ leaves });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// ============================================================
// CALENDAR ROUTE
// ============================================================

// Student: get cancelled days for a given month
app.get("/api/student/calendar",authenticateToken, requireStudent, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    const studentId = user.email;
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: "month and year required" });

    const studentDoc = await FoodCancel.findOne({ studentId });
    if (!studentDoc) return res.json({ cancelledDays: [], dataAvailable: true });

    const targetMonth = parseInt(month) - 1; // 0-indexed
    const targetYear = parseInt(year);
    const cancelledDays = [];

    studentDoc.cancellations.forEach(c => {
      if (c.status === "approved" || (c.reason === "official" && c.status === "pending")) {
        let curr = new Date(c.fromDate);
        const to = new Date(c.toDate);
        while (curr <= to) {
          if (curr.getMonth() === targetMonth && curr.getFullYear() === targetYear) {
            cancelledDays.push(curr.getDate());
          }
          curr.setDate(curr.getDate() + 1);
        }
      }
    });

    const uniqueDays = [...new Set(cancelledDays)].sort((a, b) => a - b);
    res.json({ cancelledDays: uniqueDays, month: parseInt(month), year: targetYear, dataAvailable: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================================
// VENDOR FEEDBACK ROUTES
// ============================================================

// Check whether the student has already submitted feedback
// for the selected month/year.
app.get("/api/student/feedback/status", authenticateToken, requireStudent, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    const studentId = user.email;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        hasSubmitted: false,
        message: "month and year are required"  
      });
    }

    const feedback = await VendorFeedback.findOne({
      studentId,
      month: parseInt(month),
      year: parseInt(year)
    });

    res.json({
      hasSubmitted: !!feedback
    });

  } catch (err) {
    console.error("Feedback Status Error:", err);

    res.status(500).json({
      hasSubmitted: false,
      message: "Server error"
    });
  }
});


// ============================================================
// SUBMIT VENDOR FEEDBACK
// ============================================================

app.post("/api/student/feedback", authenticateToken, requireStudent, async (req, res) => {
  try {
    const { month, year, ratings, comment } = req.body;

    // 1. Get the authenticated student from the JWT
    const user = await User.findById(req.user.sub);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    const studentId = user.email;
    const name = user.fullName || "";

    // 2. Validate required fields
    if (
      !studentId ||
      month === undefined ||
      year === undefined ||
      !ratings ||
      typeof ratings !== "object" ||
      Array.isArray(ratings)
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required feedback information"
      });
    }

    const feedbackMonth = Number(month);
    const feedbackYear = Number(year);

    if (!Number.isInteger(feedbackMonth) || feedbackMonth < 1 || feedbackMonth > 12) {
      return res.status(400).json({
        success: false,
        message: "Invalid month"
      });
    }

    if (!Number.isInteger(feedbackYear) || feedbackYear < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid year"
      });
    }

    // 3. Validate ratings
    const ratingFields = [
      "overall",
      "foodQuality",
      "cleanliness",
      "behavior"
    ];

    for (const field of ratingFields) {
      const value = Number(ratings[field]);

      if (!Number.isInteger(value) || value < 1 || value > 5) {
        return res.status(400).json({
          success: false,
          message: `${field} rating must be between 1 and 5`
        });
      }
    }

    // 4. Check for existing feedback
    const existingFeedback = await VendorFeedback.findOne({
      studentId,
      month: feedbackMonth,
      year: feedbackYear
    });

    if (existingFeedback) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted feedback for this month"
      });
    }

    // 5. Find the vendor assigned to the student's hostel
    if (!user.hostel) {
      return res.status(400).json({
        success: false,
        message: "No hostel is assigned to this student"
      });
    }

    const vendor = await Vendor.findOne({
      hostel: user.hostel
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "No vendor found for this hostel"
      });
    }

    // 6. Save feedback
    const feedback = await VendorFeedback.create({
      studentId,
      name,
      month: feedbackMonth,
      year: feedbackYear,
      ratings: {
        overall: Number(ratings.overall),
        foodQuality: Number(ratings.foodQuality),
        cleanliness: Number(ratings.cleanliness),
        behavior: Number(ratings.behavior)
      },
      comment: typeof comment === "string" ? comment : ""
    });

    // 7. Find all students belonging to this hostel
    const hostelUsers = await User.find({
      hostel: user.hostel
    });

    const hostelStudentIds = hostelUsers
      .map(student => student.email)
      .filter(Boolean);

    // 8. Get feedback from students of this hostel
    const feedbacks = await VendorFeedback.find({
      studentId: { $in: hostelStudentIds }
    });

    // 9. Calculate the average vendor rating
    let averageRating = 0;

    if (feedbacks.length > 0) {
      const totalOverallRating = feedbacks.reduce(
        (sum, feedbackItem) =>
          sum + Number(feedbackItem.ratings?.overall || 0),
        0
      );

      averageRating = Number(
        (totalOverallRating / feedbacks.length).toFixed(1)
      );
    }

    // 10. Update vendor rating
    vendor.rating = averageRating;
    await vendor.save();

    // 11. Return success
    return res.json({
      success: true,
      message: "Feedback submitted successfully",
      rating: averageRating,
      totalReviews: feedbacks.length,
      feedbackId: feedback._id
    });

  } catch (err) {
    console.error("Vendor Feedback Error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted feedback for this month"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error submitting feedback"
    });
  }
});
// ============================================================
// AUTH ROUTES  (forgot / reset password)
// ============================================================

app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;

  // 1. Check Student/User first
  const student = await Student.findOne({ email });

  if (student) {
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ message: "User account not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");

    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour

    await user.save();

    const resetLink = `http://127.0.0.1:5500/reset-password.html?token=${token}`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    try {
      const info = await transporter.sendMail({
        from: `"PMEC" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Reset Your PMEC Password",
        html: `
          <p>Click below to reset your password (valid for 1 hour):</p>
          <a href="${resetLink}">Reset Password</a>
        `
      });

      console.log("MAIL SENT:", info.messageId);
      return res.json({ message: "Reset link sent" });

    } catch (err) {
      console.log("MAIL ERROR:", err);
      return res.status(500).json({ message: "Email failed" });
    }
  }

  // 2. If not Student, check Vendor
  const vendor = await Vendor.findOne({ email });

  if (!vendor) {
    return res.json({ message: "Account not found" });
  }

  const token = crypto.randomBytes(32).toString("hex");

  vendor.resetToken = token;
  vendor.resetTokenExpiry = Date.now() + 3600000; // 1 hour

  await vendor.save();

  const resetLink = `http://127.0.0.1:5500/reset-password.html?token=${token}`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    const info = await transporter.sendMail({
      from: `"PMEC" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Reset Your PMEC Password",
      html: `
        <p>Click below to reset your password (valid for 1 hour):</p>
        <a href="${resetLink}">Reset Password</a>
      `
    });

    console.log("VENDOR MAIL SENT:", info.messageId);
    return res.json({ message: "Reset link sent" });

  } catch (err) {
    console.log("VENDOR MAIL ERROR:", err);
    return res.status(500).json({ message: "Email failed" });
  }
});

// Reset password — updates BOTH studentDB.User and adminDB.Student
  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || typeof newPassword !== "string" || !newPassword.trim()) {
      return res.status(400).json({
        message: "Token and new password are required"
      });
    }

    // 1. Check Student/User reset token
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (user) {
      const hashedPassword = await hashPassword(newPassword);
      user.password = hashedPassword;
      user.resetToken = null;
      user.resetTokenExpiry = null;

      await user.save();

      await Student.findOneAndUpdate(
        { email: user.email },
        { password: hashedPassword },
        {runValidators: true}
      );

      return res.json({
        message: "Password reset successful"
      });
    }

    // 2. If not Student/User, check Vendor reset token
    const vendor = await Vendor.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (vendor) {
      vendor.password = await hashPassword(newPassword);
      vendor.resetToken = null;
      vendor.resetTokenExpiry = null;

      await vendor.save();

      return res.json({
        message: "Password reset successful"
      });
    }

    // 3. Token doesn't exist or expired
    return res.status(400).json({
      message: "Invalid or expired token"
    });
  });

// ============================================================
// ONE-TIME SYNC ROUTE
// ============================================================

// Copy all adminDB students → studentDB Users

app.post("/api/admin/sync-students",authenticateToken,requireAdmin, async (req, res) => {
  try {
    const allStudents = await Student.find();
    let synced = 0;

    for (const s of allStudents) {
      const existingUser = await User.findOne({ email: s.email });

      const userUpdate = {
        email: s.email,
        fullName: s.name,
        room: s.room || "",
        hostel: s.hostel || "",
        phone: s.phone || ""
      };

      // Set a password only when creating a new User record.
      // Preserve an existing User password during profile synchronization.
      if (!existingUser) {
        const sourcePassword =
          typeof s.password === "string" && s.password
            ? s.password
            : "Password@123";

        const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(sourcePassword);

        userUpdate.password = isBcryptHash
          ? sourcePassword
          : await hashPassword(sourcePassword);
      }

      await User.findOneAndUpdate(
        { email: s.email },
        { $set: userUpdate },
        { upsert: true, new: true, runValidators: true }
      );

      synced++;
    }

    res.json({
      success: true,
      message: `Synced ${synced} students`
    });
  } catch (err) {
    console.error("Student sync error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});


// ============================================================
// VENDOR DASHBOARD ROUTES
// ============================================================

// 0. VENDOR PROFILE ROUTE
app.get("/api/vendor/profile",authenticateToken,requireVendor, async (req, res) => {
  try {
    const vendorId = req.user.sub;

    if (!vendorId) {
      return res.status(400).json({
        error: "vendorId is required",
      });
    }

    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        error: "Vendor not found",
      });
    }

    res.json({
      id: vendor._id,
      name: vendor.name || "",
      fullName: vendor.name || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      hostelAllocated: vendor.hostel || "Not Assigned",
      rating: vendor.rating || 0,
    });

  } catch (err) {
    console.error("Vendor profile error:", err);

    res.status(500).json({
      error: "Failed to fetch vendor profile",
    });
  }
});

// 1. TODAY'S MEALS ROUTE
app.get("/api/vendor/today-meals",authenticateToken,requireVendor, async (req, res) => {
  try {
    const nowIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const today = new Date(nowIST);
    today.setHours(0, 0, 0, 0);

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateString = `${yyyy}-${mm}-${dd}`;

    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey = days[today.getDay()];

    const meals = {
      breakfast: { totalStudents: 0, vegCount: 0, nonVegCount: 0, hasNonVeg: true },
      lunch: { totalStudents: 0, vegCount: 0, nonVegCount: 0, hasNonVeg: true },
      dinner: { totalStudents: 0, vegCount: 0, nonVegCount: 0, hasNonVeg: true }
    };

    const allUsers = await User.find();
    const allCancellations = await FoodCancel.find();
    const allPreferences = await Preference.find();

    for (const user of allUsers) {
      const cancelDoc = allCancellations.find(c => c.studentId === user.email);
      if (cancelDoc && isDateCancelled(today, cancelDoc.cancellations)) {
        continue;
      }

      const prefDoc = allPreferences.find(p => p.studentId === user.email);
      const dayPref = prefDoc?.preferences?.[dayKey] || { breakfast: "veg", lunch: "veg", dinner: "veg" };

      ["breakfast", "lunch", "dinner"].forEach(slot => {
        meals[slot].totalStudents++;

        const choice = dayPref[slot] || "veg";
        if (choice.toLowerCase() === "non-veg" || choice.toLowerCase() === "nonveg") {
          meals[slot].nonVegCount++;
        } else {
          meals[slot].vegCount++;
        }
      });
    }

    res.json({
      date: dateString,
      meals
    });

  } catch (err) {
    console.error("Today Meals Error:", err);
    res.status(500).json({ error: "Server error calculating today's meals" });
  }
});

// ============================================================
// VENDOR RATING ROUTE
// ============================================================

app.get("/api/vendor/rating",authenticateToken,requireVendor, async (req, res) => {
  try {
    const vendorId = req.user.sub;

    if (!vendorId) {
      return res.status(400).json({ error: "vendorId required" });
    }

    // 1. Find the vendor
    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // 2. Vendor must have an assigned hostel
    if (!vendor.hostel) {
      return res.json({
        rating: 0,
        totalReviews: 0,
        month: "No hostel assigned",
        breakdown: {
          foodQuality: 0,
          cleanliness: 0,
          behavior: 0
        }
      });
    }

    // 3. Find students belonging ONLY to this vendor's hostel
    const hostelUsers = await User.find({
      hostel: vendor.hostel
    });

    const hostelStudentIds = hostelUsers.map(user => user.email);

    // 4. Find feedback ONLY from students of this hostel
    const feedbacks = await VendorFeedback.find({
      studentId: { $in: hostelStudentIds }
    });

    if (feedbacks.length === 0) {
      return res.json({
        rating: Number(vendor.rating || 0),
        totalReviews: 0,
        month: "No reviews yet",
        breakdown: {
          foodQuality: 0,
          cleanliness: 0,
          behavior: 0
        }
      });
    }

    // 5. Calculate category breakdown
    let sumFood = 0;
    let sumClean = 0;
    let sumBehavior = 0;

    feedbacks.forEach(fb => {
      sumFood += fb.ratings?.foodQuality || 0;
      sumClean += fb.ratings?.cleanliness || 0;
      sumBehavior += fb.ratings?.behavior || 0;
    });

    const totalReviews = feedbacks.length;

    const avgFood = Number((sumFood / totalReviews).toFixed(1));
    const avgClean = Number((sumClean / totalReviews).toFixed(1));
    const avgBehavior = Number((sumBehavior / totalReviews).toFixed(1));

    // 6. IMPORTANT:
    // Overall rating comes directly from Vendor.rating.
    // This is the same rating displayed by Admin.
    const rating = Number(vendor.rating || 0);

    // 7. Previous month label
    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);

    const monthLabel = prevMonth.toLocaleString("en-US", {
      month: "long",
      year: "numeric"
    });

    res.json({
      rating,
      totalReviews,
      month: monthLabel,
      breakdown: {
        foodQuality: avgFood,
        cleanliness: avgClean,
        behavior: avgBehavior
      }
    });

  } catch (err) {
    console.error("Vendor Rating Error:", err);
    res.status(500).json({
      error: "Server error calculating vendor ratings"
    });
  }
});

// 3. VENDOR BILLING ROUTE
// 3. VENDOR BILLING ROUTE
app.get("/api/vendor/billing",authenticateToken,requireVendor, async (req, res) => {
  try {
    const { month } = req.query;
    const vendorId = req.user.sub;

    if (!month) {
      return res.status(400).json({
        error: "Month parameter is required (YYYY-MM)"
      });
    }

    if (!vendorId) {
      return res.status(400).json({
        error: "vendorId is required"
      });
    }

    // 1. Find the vendor
    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      return res.status(404).json({
        error: "Vendor not found"
      });
    }

    // 2. Vendor must have a hostel assigned
    if (!vendor.hostel) {
      return res.json({
        month,
        monthLabel: "--",
        totalStudents: 0,
        totalMeals: 0,
        amountPerMeal: 0,
        totalAmount: 0,
        students: []
      });
    }

    // 3. Find ONLY students belonging to this vendor's hostel
    const hostelUsers = await User.find({
      hostel: vendor.hostel
    });

    // Get their email IDs
    const hostelStudentIds = hostelUsers.map(user => user.email);

    // 4. Find ONLY billing records belonging to those students
    const hostelBillings = await StudentBilling.find({
      studentId: { $in: hostelStudentIds }
    });

    // 5. Initialize tracking variables
    let totalStudents = 0;
    let totalMeals = 0;
    let amountPerMeal = 0;
    let totalAmount = 0;
    let monthLabel = "--";

    const studentsList = [];

    // 6. Process billing records
    for (const billing of hostelBillings) {

      // Find the selected month
      const monthBill = billing.monthlyBills.find(
        b => b.monthKey === month
      );

      if (monthBill) {

        totalStudents++;

        totalMeals += monthBill.totalMeals || 0;

        totalAmount += monthBill.amountDue || 0;

        // Get amount per meal and month label
        if (amountPerMeal === 0) {
          amountPerMeal = monthBill.amountPerMeal || 0;
          monthLabel = monthBill.monthLabel || "--";
        }

        // Find student's user record
        const user = hostelUsers.find(
          u => u.email === billing.studentId
        );

        const room = user?.room || "--";

        studentsList.push({
          name: billing.name ||
                user?.fullName ||
                billing.studentId,

          room: room,

          mealsCount: monthBill.totalMeals || 0,

          amount: monthBill.amountDue || 0
        });
      }
    }

    // 7. If no billing records exist for selected month
    if (totalStudents === 0) {

      const [yyyy, mm] = month.split("-");

      const fallbackDate = new Date(
        yyyy,
        parseInt(mm) - 1,
        1
      );

      monthLabel = fallbackDate.toLocaleString(
        "en-US",
        {
          month: "long",
          year: "numeric"
        }
      );
    }

    // 8. Send hostel-specific billing
    res.json({
      month,
      monthLabel,
      totalStudents,
      totalMeals,
      amountPerMeal,
      totalAmount,
      students: studentsList
    });

  } catch (err) {

    console.error("Vendor Billing Error:", err);

    res.status(500).json({
      error: "Server error fetching billing records"
    });
  }
});

// ============================================================
// DEFAULT ROUTE & SERVER START
// ============================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "front_page.html"));
});

// ============================================================
// STARTUP BILLING BACKFILL
// ============================================================
/**
 * Runs once on server startup. For every registered student, computes and
 * upserts bills for every calendar month from their earliest known date up
 * to the current month. This ensures no months are skipped when the server
 * was offline (e.g. overnight, weekends, or long downtime).
 *
 * upsertMonthBill() respects the manualOverride flag, so manually-cleared
 * or admin-adjusted bills are never overwritten by the backfill.
 */
async function backfillBilling() {
  try {
    // Wait briefly for both DB connections to stabilise
    await new Promise(r => setTimeout(r, 2000));

    const allUsers = await User.find();
    if (!allUsers.length) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log(`[Backfill] Starting billing backfill for ${allUsers.length} students...`);
    let updated = 0;

    for (const user of allUsers) {
      const studentId = user.email;
      try {
        // Determine the earliest month to start from:
        // Use the earliest of: FoodCancel createdAt, Preference createdAt,
        // existing StudentBilling monthlyBills, or user account createdAt.
        const dateCandidates = [];
        if (user.createdAt) dateCandidates.push(new Date(user.createdAt));

        const cancelDoc = await FoodCancel.findOne({ studentId });
        if (cancelDoc?.createdAt) dateCandidates.push(new Date(cancelDoc.createdAt));

        const prefDoc = await Preference.findOne({ studentId });
        if (prefDoc?.createdAt) dateCandidates.push(new Date(prefDoc.createdAt));

        const existingBilling = await StudentBilling.findOne({ studentId });
        if (existingBilling?.monthlyBills?.length) {
          // Use the oldest stored monthKey as the start
          const oldestKey = existingBilling.monthlyBills
            .map(b => b.monthKey)
            .sort()[0];
          if (oldestKey) {
            const [oy, om] = oldestKey.split("-").map(Number);
            dateCandidates.push(new Date(oy, om - 1, 1));
          }
        }

        const earliest = dateCandidates.length > 0
          ? dateCandidates.reduce((a, b) => a < b ? a : b)
          : today;

        let y = earliest.getFullYear();
        let m = earliest.getMonth();

        while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
          const bill = await computeMonthlyBill(studentId, y, m);
          await upsertMonthBill(studentId, user.fullName || user.email, bill);
          m++;
          if (m > 11) { m = 0; y++; }
        }
        await StudentBilling.updateOne({ studentId }, { $set: { lastBilledDate: today } });
        updated++;
      } catch (err) {
        console.error(`[Backfill] Error for student ${studentId}:`, err.message);
      }
    }

    console.log(`[Backfill] Done. Backfilled bills for ${updated}/${allUsers.length} students.`);
  } catch (err) {
    console.error("[Backfill] Fatal error during billing backfill:", err.message);
  }
}

if (require.main === module) {
  app.listen(5000, () => {
    console.log("Server running on port 5000");
    console.log("Homepage: http://localhost:5000");
    // Run billing backfill in the background on every startup so bills are
    // accurate even for months the server was offline.
    backfillBilling();
  });
}

module.exports = app;