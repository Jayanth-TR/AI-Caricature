const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const os = require("os");

const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloud_name: "df2fypohw",
    api_key: "595361815927268",
    api_secret: "MNqcMnL52L4tHTGrG9uX6Wcyf4k"
});

const app = express();

// Ensure local outputs folder exists
const outputsDir = path.join(__dirname, "outputs");
if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
}

const PORT = process.env.PORT || 3005;
const AI_SERVICE_URL =
    process.env.AI_SERVICE_URL || "http://localhost:8001";


// ----------------------------------------------------
// MIDDLEWARE
// ----------------------------------------------------

app.use(cors());

// Serve outputs static folder
app.use("/outputs", express.static(path.join(__dirname, "outputs")));

app.use(express.json({
    limit: "15mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "15mb"
}));


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
                new Error("Only JPEG, PNG and WEBP images are allowed")
            );
        }

        cb(null, true);
    }
});


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
            ai_service: aiHealth.data
        });

    } catch (error) {

        return res.status(500).json({
            status: "error",
            message: "AI service unavailable"
        });
    }
});


const uploadToCloudinary = (buffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: "caricatures",
                resource_type: "image"
            },
            (error, result) => {
                if (error) {
                    console.error("Cloudinary upload error:", error);
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
// MAIN GENERATE API
// ----------------------------------------------------

app.post(
    "/api/generate",
    upload.single("image"),

    async (req, res) => {

        try {

            // --------------------------------
            // VALIDATION
            // --------------------------------

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error: "Image is required"
                });
            }

            console.log("\n==================================");
            console.log("NEW IMAGE REQUEST");
            console.log("==================================");

            console.log("Filename:", req.file.originalname);
            console.log("MimeType:", req.file.mimetype);
            console.log(
                "Size:",
                `${(req.file.size / 1024).toFixed(2)} KB`
            );

            // --------------------------------
            // CREATE FORM DATA
            // --------------------------------

            const formData = new FormData();

            formData.append(
                "image",
                req.file.buffer,
                {
                    filename: req.file.originalname,
                    contentType: req.file.mimetype
                }
            );

            if (req.body.prompt) {
                formData.append("prompt", req.body.prompt);
            } else {
                formData.append("prompt", "Default prompt");
            }

            if (req.body.gender) {
                formData.append("gender", req.body.gender);
            } else {
                formData.append("gender", "male");
            }

            if (req.body.wears_glasses !== undefined) {
                formData.append("wears_glasses", String(req.body.wears_glasses));
            } else {
                formData.append("wears_glasses", "false");
            }

            if (req.body.hairStyle) {
                formData.append("hair_style", req.body.hairStyle);
            } else {
                formData.append("hair_style", "default");
            }

            // --------------------------------
            // SEND TO PYTHON AI SERVICE
            // --------------------------------

            console.log("Sending image to AI service...");

            const aiResponse = await axios.post(
                `${AI_SERVICE_URL}/api/process`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders()
                    },

                    responseType: "arraybuffer",

                    timeout: 120000 // 2 mins
                }
            );

            console.log("AI image generated successfully");

            // --------------------------------
            // SAVE LOCAL COPY & LOG METADATA
            // --------------------------------
            const timestamp = Date.now();
            const gender = req.body.gender || "male";
            const userName = req.body.name || "anonymous";
            const userCompany = req.body.company || "unknown";
            
            // Clean names for safe files
            const nameSanitized = userName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
            const companySanitized = userCompany.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
            
            const outputFilename = `caricature_${nameSanitized}_${companySanitized}_${timestamp}.png`;
            const outputPath = path.join(outputsDir, outputFilename);
            fs.writeFileSync(outputPath, aiResponse.data);
            console.log(`Saved output locally to ${outputPath}`);

            // Upload generated caricature to Cloudinary
            let cloudinaryUrl = "";
            try {
                console.log("Uploading generated image to Cloudinary...");
                const cloudResult = await uploadToCloudinary(aiResponse.data);
                cloudinaryUrl = cloudResult.secure_url;
                console.log(`Cloudinary upload successful: ${cloudinaryUrl}`);
            } catch (err) {
                console.error("Failed to upload to Cloudinary:", err);
            }

            // Append metadata to central leads CSV database with Cloudinary URL
            const csvPath = path.join(outputsDir, "leads.csv");
            const csvRow = `"${new Date(timestamp).toLocaleString()}","${userName.replace(/"/g, '""')}","${userCompany.replace(/"/g, '""')}","${outputFilename}","${cloudinaryUrl}"\n`;
            
            if (!fs.existsSync(csvPath)) {
                fs.writeFileSync(csvPath, "Timestamp,Name,Company,ImageFilename,CloudinaryUrl\n");
            }
            fs.appendFileSync(csvPath, csvRow);
            console.log(`Successfully appended lead details to CSV database.`);

            // --------------------------------
            // CONVERT TO BASE64
            // --------------------------------

            const base64Image = Buffer
                .from(aiResponse.data)
                .toString("base64");

            const mimeType =
                aiResponse.headers["content-type"] ||
                "image/png";

            // --------------------------------
            // RETURN RESPONSE
            // --------------------------------

            return res.json({
                success: true,
                imageUrl:
                    `data:${mimeType};base64,${base64Image}`,
                cloudinaryUrl: cloudinaryUrl
            });

        } catch (error) {

            console.error("\n==================================");
            console.error("BACKEND ERROR");
            console.error("==================================");

            console.error(error.message);

            // --------------------------------
            // AI SERVICE ERROR
            // --------------------------------

            if (error.response) {

                console.error(
                    "AI SERVICE RESPONSE:",
                    error.response.status
                );

                try {

                    console.error(
                        Buffer
                            .from(error.response.data)
                            .toString()
                    );

                } catch (e) {
                    console.error("Unable to parse AI error");
                }
            }

            // --------------------------------
            // TIMEOUT
            // --------------------------------

            if (error.code === "ECONNABORTED") {

                return res.status(504).json({
                    success: false,
                    error: "AI processing timeout"
                });
            }

            // --------------------------------
            // DEFAULT ERROR
            // --------------------------------

            return res.status(500).json({
                success: false,
                error: "Failed to process image"
            });
        }
    }
);


// ----------------------------------------------------
// HISTORY / LEADS API
// ----------------------------------------------------

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return "localhost";
}

app.get("/api/history", (req, res) => {
    try {
        const csvPath = path.join(outputsDir, "leads.csv");
        if (!fs.existsSync(csvPath)) {
            return res.json({ success: true, history: [], localIp: getLocalIpAddress() });
        }
        
        const data = fs.readFileSync(csvPath, "utf8");
        const lines = data.trim().split("\n");
        if (lines.length <= 1) {
            return res.json({ success: true, history: [], localIp: getLocalIpAddress() });
        }
        
        const history = [];
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            // Match quoted elements in CSV: "Timestamp","Name","Company","Filename"
            const matches = line.match(/"([^"]*)"/g);
            if (matches && matches.length >= 4) {
                const timestampStr = matches[0].replace(/"/g, "");
                const name = matches[1].replace(/"/g, "");
                const company = matches[2].replace(/"/g, "");
                const filename = matches[3].replace(/"/g, "");
                const cloudinaryUrl = matches[4] ? matches[4].replace(/"/g, "") : "";
                history.push({
                    timestamp: timestampStr,
                    name,
                    company,
                    filename,
                    cloudinaryUrl
                });
            }
        }
        
        // Return reverse chronological order (newest first) with server local IP
        return res.json({ 
            success: true, 
            history: history.reverse(), 
            localIp: getLocalIpAddress() 
        });
    } catch (error) {
        console.error("Error reading history leads:", error);
        return res.status(500).json({ success: false, error: "Failed to read history leads" });
    }
});


// ----------------------------------------------------
// GLOBAL ERROR HANDLER
// ----------------------------------------------------

app.use((error, req, res, next) => {

    console.error("GLOBAL ERROR:", error.message);

    return res.status(500).json({
        success: false,
        error: error.message || "Something went wrong"
    });
});


// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------

app.listen(PORT, () => {

    console.log("\n==================================");
    console.log(`SERVER RUNNING`);
    console.log(`http://localhost:${PORT}`);
    console.log("==================================\n");
});