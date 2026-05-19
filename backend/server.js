const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const os = require("os");
require("dotenv").config();

const cloudinary = require("cloudinary").v2;

const app = express();

// ----------------------------------------------------
// CLOUDINARY CONFIG
// ----------------------------------------------------

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ----------------------------------------------------
// ENV VARIABLES
// ----------------------------------------------------

const PORT = process.env.PORT || 3005;

const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL || "http://localhost:8001";

const FRONTEND_URL =
    process.env.FRONTEND_URL || "*";

// ----------------------------------------------------
// OUTPUT DIRECTORY
// ----------------------------------------------------

const outputsDir = path.join(__dirname, "outputs");

if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
}

// ----------------------------------------------------
// MIDDLEWARE
// ----------------------------------------------------

app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));

app.use(express.json({
    limit: "15mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "15mb"
}));

app.use(
    "/outputs",
    express.static(path.join(__dirname, "outputs"))
);

// ----------------------------------------------------
// MULTER CONFIG
// ----------------------------------------------------

const storage = multer.memoryStorage();

const upload = multer({
    storage,

    limits: {
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        const allowedMimeTypes = [
            "image/jpeg",
            "image/png",
            "image/jpg",
            "image/webp"
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return cb(
                new Error(
                    "Only JPEG, PNG and WEBP images are allowed"
                )
            );
        }

        cb(null, true);
    }
});

// ----------------------------------------------------
// UTILITIES
// ----------------------------------------------------

function getLocalIpAddress() {

    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {

        for (const iface of interfaces[name]) {

            if (
                iface.family === "IPv4" &&
                !iface.internal
            ) {
                return iface.address;
            }
        }
    }

    return "localhost";
}

const uploadToCloudinary = (buffer) => {

    return new Promise((resolve, reject) => {

        const uploadStream =
            cloudinary.uploader.upload_stream(
                {
                    folder: "caricatures",
                    resource_type: "image"
                },

                (error, result) => {

                    if (error) {
                        console.error(
                            "Cloudinary upload error:",
                            error
                        );

                        reject(error);

                    } else {

                        resolve(result);
                    }
                }
            );

        uploadStream.end(buffer);
    });
};

// ----------------------------------------------------
// HEALTH CHECK
// ----------------------------------------------------

app.get("/", async (req, res) => {

    try {

        const aiHealth = await axios.get(
            `${AI_SERVICE_URL}/`,
            {
                timeout: 5000
            }
        );

        return res.json({
            status: "running",
            backend: true,
            ai_service: aiHealth.data
        });

    } catch (error) {

        return res.status(500).json({
            status: "error",
            message: "AI service unavailable"
        });
    }
});

// ----------------------------------------------------
// MAIN GENERATE API
// ----------------------------------------------------

app.post(
    "/api/generate",
    upload.single("image"),

    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error: "Image is required"
                });
            }

            console.log("\n==================================");
            console.log("NEW IMAGE REQUEST");
            console.log("==================================");

            const formData = new FormData();

            formData.append(
                "image",
                req.file.buffer,
                {
                    filename: req.file.originalname,
                    contentType: req.file.mimetype
                }
            );

            formData.append(
                "prompt",
                req.body.prompt || "Default prompt"
            );

            formData.append(
                "gender",
                req.body.gender || "male"
            );

            formData.append(
                "wears_glasses",
                String(req.body.wears_glasses || false)
            );

            formData.append(
                "hair_style",
                req.body.hairStyle || "default"
            );

            console.log("Sending image to AI service...");

            const aiResponse = await axios.post(
                `${AI_SERVICE_URL}/api/process`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders()
                    },

                    responseType: "arraybuffer",

                    timeout: 120000
                }
            );

            console.log(
                "AI image generated successfully"
            );

            // --------------------------------
            // SAVE IMAGE
            // --------------------------------

            const timestamp = Date.now();

            const userName =
                req.body.name || "anonymous";

            const userCompany =
                req.body.company || "unknown";

            const safeName =
                userName
                    .replace(/[^a-zA-Z0-9]/g, "_")
                    .toLowerCase();

            const safeCompany =
                userCompany
                    .replace(/[^a-zA-Z0-9]/g, "_")
                    .toLowerCase();

            const outputFilename =
                `caricature_${safeName}_${safeCompany}_${timestamp}.png`;

            const outputPath =
                path.join(outputsDir, outputFilename);

            fs.writeFileSync(
                outputPath,
                aiResponse.data
            );

            // --------------------------------
            // CLOUDINARY
            // --------------------------------

            let cloudinaryUrl = "";

            try {

                const cloudResult =
                    await uploadToCloudinary(
                        aiResponse.data
                    );

                cloudinaryUrl =
                    cloudResult.secure_url;

            } catch (error) {

                console.error(
                    "Cloudinary upload failed:",
                    error.message
                );
            }

            // --------------------------------
            // CSV LOGGING
            // --------------------------------

            const csvPath =
                path.join(outputsDir, "leads.csv");

            const csvRow =
                `"${new Date(timestamp).toLocaleString()}","${userName.replace(/"/g, '""')}","${userCompany.replace(/"/g, '""')}","${outputFilename}","${cloudinaryUrl}"\n`;

            if (!fs.existsSync(csvPath)) {

                fs.writeFileSync(
                    csvPath,
                    "Timestamp,Name,Company,ImageFilename,CloudinaryUrl\n"
                );
            }

            fs.appendFileSync(csvPath, csvRow);

            // --------------------------------
            // BASE64
            // --------------------------------

            const base64Image =
                Buffer
                    .from(aiResponse.data)
                    .toString("base64");

            const mimeType =
                aiResponse.headers["content-type"] ||
                "image/png";

            return res.json({
                success: true,

                imageUrl:
                    `data:${mimeType};base64,${base64Image}`,

                cloudinaryUrl
            });

        } catch (error) {

            console.error(
                "\n=================================="
            );

            console.error("BACKEND ERROR");

            console.error(
                "=================================="
            );

            console.error(error.message);

            if (error.code === "ECONNABORTED") {

                return res.status(504).json({
                    success: false,
                    error: "AI processing timeout"
                });
            }

            return res.status(500).json({
                success: false,
                error: "Failed to process image"
            });
        }
    }
);

// ----------------------------------------------------
// HISTORY API
// ----------------------------------------------------

app.get("/api/history", (req, res) => {

    try {

        const csvPath =
            path.join(outputsDir, "leads.csv");

        if (!fs.existsSync(csvPath)) {

            return res.json({
                success: true,
                history: [],
                localIp: getLocalIpAddress()
            });
        }

        const data =
            fs.readFileSync(csvPath, "utf8");

        const lines =
            data.trim().split("\n");

        if (lines.length <= 1) {

            return res.json({
                success: true,
                history: [],
                localIp: getLocalIpAddress()
            });
        }

        const history = [];

        for (let i = 1; i < lines.length; i++) {

            const line = lines[i];

            const matches =
                line.match(/"([^"]*)"/g);

            if (matches && matches.length >= 4) {

                history.push({
                    timestamp:
                        matches[0].replace(/"/g, ""),

                    name:
                        matches[1].replace(/"/g, ""),

                    company:
                        matches[2].replace(/"/g, ""),

                    filename:
                        matches[3].replace(/"/g, ""),

                    cloudinaryUrl:
                        matches[4]
                            ? matches[4].replace(/"/g, "")
                            : ""
                });
            }
        }

        return res.json({
            success: true,
            history: history.reverse(),
            localIp: getLocalIpAddress()
        });

    } catch (error) {

        console.error(
            "History API Error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            error: "Failed to read history"
        });
    }
});

// ----------------------------------------------------
// GLOBAL ERROR HANDLER
// ----------------------------------------------------

app.use((error, req, res, next) => {

    console.error(
        "GLOBAL ERROR:",
        error.message
    );

    return res.status(500).json({
        success: false,
        error:
            error.message ||
            "Something went wrong"
    });
});

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------

app.listen(PORT, () => {

    console.log("\n==================================");

    console.log(`SERVER RUNNING`);

    console.log(`PORT: ${PORT}`);

    console.log(
        `AI SERVICE: ${AI_SERVICE_URL}`
    );

    console.log("==================================\n");
});