const mongoose = require("mongoose");
const studentConnection = require("../studentDb");

const PreferenceSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    preferences: {
        mon: { breakfast: String, lunch: String, dinner: String },
        tue: { breakfast: String, lunch: String, dinner: String },
        wed: { breakfast: String, lunch: String, dinner: String },
        thu: { breakfast: String, lunch: String, dinner: String },
        fri: { breakfast: String, lunch: String, dinner: String },
        sat: { breakfast: String, lunch: String, dinner: String },
        sun: { breakfast: String, lunch: String, dinner: String }
    }
}, { timestamps: true });

module.exports = studentConnection.model("Preference", PreferenceSchema, "Preferences");