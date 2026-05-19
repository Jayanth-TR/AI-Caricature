from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

import uvicorn
import traceback

from pipeline import process_image

app = FastAPI()

# -----------------------------------
# CORS
# -----------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------
# HEALTH CHECK
# -----------------------------------

@app.get("/")
async def home():
    return {
        "status": "running"
    }

# -----------------------------------
# PROCESS ENDPOINT
# -----------------------------------

@app.post("/api/process")
def process_face(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    gender: str = Form("male"),
    wears_glasses: str = Form("false"),
    hair_style: str = Form("default")
):

    try:

        image_bytes = image.file.read()
        
        is_glasses = wears_glasses.lower() == "true"

        output_image = process_image(image_bytes, prompt, gender, is_glasses, hair_style)

        return Response(
            content=output_image,
            media_type="image/jpeg"
        )

    except Exception as e:

        print(traceback.format_exc())

        return {
            "status": "error",
            "message": str(e)
        }

# -----------------------------------
# START
# -----------------------------------

if __name__ == "__main__":

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True
    )