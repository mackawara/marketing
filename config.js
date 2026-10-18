require("dotenv").config()

const DEFAULT_PUBLISH_TIMES = ['06:00', '10:00', '18:00']
const DEFAULT_TIMEZONE = 'Africa/Harare'

const isValidTimezone = (timezone) => {
    try {
        new Intl.DateTimeFormat('en-GB', { timeZone: timezone })
        return true
    } catch (_) {
        return false
    }
}

// "06:00, 10:00, 18:00" -> ['06:00', '10:00', '18:00']. A typo must not silently
// change when adverts go out, so anything invalid falls back to the defaults.
const parsePublishTimes = (value) => {
    if (!value) return DEFAULT_PUBLISH_TIMES
    const times = value.split(',').map((time) => time.trim()).filter(Boolean)
    const valid = times.length > 0
        && times.every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        && new Set(times).size === times.length
    if (!valid) {
        console.error(`[config] Ignoring invalid PUBLISH_TIMES "${value}"; using ${DEFAULT_PUBLISH_TIMES.join(', ')}.`)
        return DEFAULT_PUBLISH_TIMES
    }
    return [...times].sort()
}

// Accepts "https://whatsapp.com/channel/0029Vb..." or just "0029Vb...".
const parseChannelInvite = (value) => {
    if (!value) return undefined
    const match = String(value).trim().match(/channel\/([A-Za-z0-9_-]+)/)
    const code = match ? match[1] : String(value).trim()
    return /^[A-Za-z0-9_-]+$/.test(code) ? code : undefined
}

const parseCount = (value, fallback) => {
    const count = Number.parseInt(value, 10)
    return Number.isInteger(count) && count > 0 ? count : fallback
}

const requestedTimezone = process.env.PUBLISH_TIMEZONE || DEFAULT_TIMEZONE
const timezone = isValidTimezone(requestedTimezone) ? requestedTimezone : DEFAULT_TIMEZONE
if (timezone !== requestedTimezone) {
    console.error(`[config] Ignoring invalid PUBLISH_TIMEZONE "${requestedTimezone}"; using ${DEFAULT_TIMEZONE}.`)
}

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
    // Used to look up CHANNEL_ID at startup when it is not set directly.
    CHANNEL_INVITE_CODE: parseChannelInvite(process.env.CHANNEL_INVITE),
    CHANNEL_NAME: process.env.CHANNEL_NAME || "Tech Updates & Solutions",
    VENTA_WIFI_CHATBOT: process.env.VENTA_WIFI_CHATBOT,
    STAFF_NUMBERS: process.env.STAFF_NUMBERS,
    STANDUPLY_WEBHOOK_SECRET: process.env.STANDUPLY_WEBHOOK_SECRET,
    // Generic mention fields are not verified to trigger native Status notifications.
    STATUS_MENTIONS_ENABLED: process.env.STATUS_MENTIONS_ENABLED === 'true',
    // One schedule and timezone drive both the WhatsApp Status and Channel workflows.
    PUBLISH_TIMES: parsePublishTimes(process.env.PUBLISH_TIMES),
    PUBLISH_TIMEZONE: timezone,
    // Photos/videos published to Status at each scheduled time.
    STATUS_IMAGES_PER_BATCH: parseCount(process.env.STATUS_IMAGES_PER_BATCH, 5),
    // Channel messages published at each scheduled time.
    CHANNEL_POSTS_PER_SLOT: parseCount(process.env.CHANNEL_POSTS_PER_SLOT, 1),
    // Reuses OPENAI_API_KEY / OPENAI_ORGANISATION_KEY from services/openai.js.
    OPENAI_CHANNEL_MODEL: process.env.OPENAI_CHANNEL_MODEL || 'gpt-4o-mini',
}
module.exports = config
module.exports.parseChannelInvite = parseChannelInvite
