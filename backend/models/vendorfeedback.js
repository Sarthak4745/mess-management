const mongoose = require("mongoose");

const VendorFeedbackSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      trim: true
    },

    name: {
      type: String,
      default: ""
    },

    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },

    year: {
      type: Number,
      required: true
    },

    ratings: {
      overall: {
        type: Number,
        required: true,
        min: 1,
        max: 5
      },

      foodQuality: {
        type: Number,
        required: true,
        min: 1,
        max: 5
      },

      cleanliness: {
        type: Number,
        required: true,
        min: 1,
        max: 5
      },

      behavior: {
        type: Number,
        required: true,
        min: 1,
        max: 5
      }
    },

    comment: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    }
  },
  {
    timestamps: true,
    collection: "feedback"
  }
);

// One feedback per student per month/year
VendorFeedbackSchema.index(
  {
    studentId: 1,
    month: 1,
    year: 1
  },
  {
    unique: true
  }
);

module.exports = mongoose.model(
  "VendorFeedback",
  VendorFeedbackSchema
);