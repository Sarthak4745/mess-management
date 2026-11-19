const mongoose = require("mongoose");

const policySchema = new mongoose.Schema({
  maxMonthlyOffs: {
    type: Number,
    default: 15
  },

  flatMealRate: {
    type: Number,
    required: true
  },

  scheduledRate: {
    type: Number,
    default: null
  },

  effectiveFrom: {
    type: Date,
    default: null
  },

  rateHistory: [{
    rate: { type: Number, required: true },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null }
  }]

}, { timestamps: true });

module.exports = mongoose.model("Policy", policySchema);