import os
import io
from dotenv import load_dotenv
load_dotenv()

from PIL import Image
import uuid
import requests
from pixelbin import PixelbinClient, PixelbinConfig
from pixelbin.platform.enums import AccessEnum
from pixelbin.utils.url import obj_to_url, url_to_obj

PIXELBIN_API_TOKEN = os.getenv("PIXELBIN_API_TOKEN")

def enhance_face_pixelbin(image_bytes):
    if not PIXELBIN_API_TOKEN:
        print("Warning: PIXELBIN_API_TOKEN not found. Skipping face enhancement.")
        return image_bytes

    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    try:
        print("Enhancing image using PixelBin Predictions...")
        config = PixelbinConfig({
            "domain": "https://api.pixelbin.io",
            "apiSecret": PIXELBIN_API_TOKEN,
        })
        pixelbin = PixelbinClient(config=config)

        result = pixelbin.predictions.create_and_wait(
            name="sr_upscale",
            input={
                "image": image_bytes,
                "type": "4X",
                "enhance_face": True,
                "model": "flash",
                "enhance_quality": False,
                "enhance_text": False
            }
        )

        print(f"Prediction result: {result}")
        if result and result.get("status") == "SUCCESS":
            output_url = result["output"][0]
            print(f"Downloading enhanced image from prediction: {output_url}")
            resp = requests.get(output_url)
            if resp.status_code == 200:
                print("Successfully enhanced face via Predictions")
                return resp.content
            else:
                print(f"Failed to download image: {resp.status_code}")
        else:
            print(f"Prediction failed with status: {result.get('status')}")
            
    except Exception as e:
        print(f"Error during PixelBin predictions face enhancement: {e}")
        
    return image_bytes

if __name__ == "__main__":
    print("Testing PixelBin Upload & Face Enhancement...")
    # Load temp_input.png if it exists
    input_path = "temp_input.png"
    if not os.path.exists(input_path):
        # Create a dummy image
        img = Image.new("RGB", (100, 100), color="blue")
        img.save(input_path)
        
    with open(input_path, "rb") as f:
        image_bytes = f.read()
        
    enhanced_bytes = enhance_face_pixelbin(image_bytes)
    if enhanced_bytes != image_bytes:
        print("Success! Enhanced image is different from input image.")
        with open("temp_pixelbin_enhanced.png", "wb") as f:
            f.write(enhanced_bytes)
        print("Saved enhanced image to temp_pixelbin_enhanced.png")
    else:
        print("Failed to enhance image.")
