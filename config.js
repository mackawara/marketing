require("dotenv").config()

const config = {
    NODE_ENV: process.env.NODE_ENV,
    ME: process.env.ME,
    PORT: process.env.PORT,
    EXECPATH: process.env.EXECPATH,
    CLOUDINARY_NAME: process.env.CLOUDINARY_NAME,
    CLOUDINARY_KEY: process.env.CLOUDINARY_KEY,
    CLOUDINARY_SECRET: process.env.CLOUDINARY_SECRET,
    MARKETING_DB_STRING: process.env.MARKETING_DB_STRING,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
    CHANNEL_ID: process.env.CHANNEL_ID,
    CHANNEL_NAME: process.env.CHANNEL_NAME || "Tech Updates & Solutions",
}
module.exports = config