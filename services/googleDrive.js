const axios = require('axios');
const config = require('../config');

const GOOGLE_API_KEY = config.GOOGLE_API_KEY;
const FOLDER_ID = config.GOOGLE_DRIVE_FOLDER_ID;

// In-memory cache of Drive files
let cachedFiles = [];

/**
 * Lists all files in the shared Google Drive folder.
 * @returns {Promise<Array<{id: string, name: string, mimeType: string}>>}
 */
const listFilesInFolder = async () => {
    const url = 'https://www.googleapis.com/drive/v3/files';
    const params = {
        q: `'${FOLDER_ID}' in parents and trashed = false`,
        key: GOOGLE_API_KEY,
        fields: 'files(id, name, mimeType)',
        pageSize: 1000,
    };

    const response = await axios.get(url, { params });
    return response.data.files || [];
};

/**
 * Returns a direct download URL for a Google Drive file.
 * @param {string} fileId - The Google Drive file ID
 * @returns {string}
 */
const getFileUrl = (fileId) => {
    return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`;
};

/**
 * Fetches all files from the Google Drive folder, caches them,
 * and logs each file URL. Call this once at startup.
 */
const initDriveCache = async () => {
    try {
        console.log('📂 Fetching files from Google Drive folder...');
        const files = await listFilesInFolder();

        cachedFiles = files.map((file) => ({
            id: file.id,
            filename: file.name,
            mimeType: file.mimeType,
            url: getFileUrl(file.id),
        }));

        console.log(`✅ Cached ${cachedFiles.length} files from Google Drive:`);
        cachedFiles.forEach((file) => {
            console.log(`   - ${file.filename} (${file.mimeType})`);
            console.log(`     ${file.url}`);
        });
    } catch (error) {
        console.error('❌ Failed to fetch files from Google Drive:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        }
        cachedFiles = [];
    }
};

/**
 * Picks a random file from the cached Google Drive files.
 * @returns {{url: string, filename: string, mimeType: string}|null}
 */
const getRandomFileFromDrive = () => {
    if (cachedFiles.length === 0) {
        console.log('No files cached from Google Drive.');
        return null;
    }

    const randomFile = cachedFiles[Math.floor(Math.random() * cachedFiles.length)];
    console.log(`Picked random file: ${randomFile.filename}`);

    return {
        url: randomFile.url,
        filename: randomFile.filename,
        mimeType: randomFile.mimeType,
    };
};

module.exports = { initDriveCache, getRandomFileFromDrive };
