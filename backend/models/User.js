const mongoose = require("mongoose");
const studentConnection = require("../studentDb");

const UserSchema = new mongoose.Schema({
    email: String,
    password: String,
    fullName: String,
    room: String,
    hostel: String,
    phone: String,
    resetToken: String,
    resetTokenExpiry: Date
});

module.exports = studentConnection.model("User", UserSchema, "users");