const mongoose = require("mongoose");
const studentConnection = mongoose.createConnection(process.env.STUDENT_DB_URI);
studentConnection.on("connected", () => console.log("Connected to studentDB"));
module.exports = studentConnection;