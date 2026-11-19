const mongoose = require("mongoose");
const studentConnection = mongoose.createConnection("mongodb://127.0.0.1:27017/studentDB");
studentConnection.on("connected", () => console.log("Connected to studentDB"));
module.exports = studentConnection;