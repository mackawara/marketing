const mongoose = require("mongoose");
const config = require("../config")
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.MARKETING_DB_STRING, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

module.exports = connectDB;
