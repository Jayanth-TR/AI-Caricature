import os
import io
import cv2
import numpy as np

from dotenv import load_dotenv
from huggingface_hub import InferenceClient
import insightface
from insightface.app import FaceAnalysis

from PIL import Image
from rembg import remove
import uuid
import requests
from pixelbin import PixelbinClient, PixelbinConfig

# =========================================================
# LOAD ENV
# =========================================================

load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN")
PIXELBIN_API_TOKEN = os.getenv("PIXELBIN_API_TOKEN")

if not HF_TOKEN:
    raise ValueError("HF_TOKEN not found")

# =========================================================
# INIT CLIENT
# =========================================================

print("Initializing FLUX Image Edit Client...")

client = InferenceClient(
    provider="replicate",
    api_key=HF_TOKEN,
)

# =========================================================
# INIT INSIGHTFACE
# =========================================================

print("Initializing InsightFace...")
app_face = FaceAnalysis(name='buffalo_l')
app_face.prepare(ctx_id=0, det_size=(640, 640))
swapper = insightface.model_zoo.get_model('inswapper_128.onnx', download=False, download_zip=False)

def swap_face(source_bytes, target_bytes):
    source_img = cv2.imdecode(np.frombuffer(source_bytes, np.uint8), cv2.IMREAD_COLOR)
    target_img = cv2.imdecode(np.frombuffer(target_bytes, np.uint8), cv2.IMREAD_COLOR)
    
    source_faces = app_face.get(source_img)
    target_faces = app_face.get(target_img)
    
    if not source_faces or not target_faces:
        print("Warning: Face not detected in source or target.")
        return target_bytes
        
    source_face = sorted(source_faces, key=lambda x: (x.bbox[2]-x.bbox[0])*(x.bbox[3]-x.bbox[1]), reverse=True)[0]
    target_face = sorted(target_faces, key=lambda x: (x.bbox[2]-x.bbox[0])*(x.bbox[3]-x.bbox[1]), reverse=True)[0]
    
    res = target_img.copy()
    res = swapper.get(res, target_face, source_face, paste_back=True)
    
    _, buffer = cv2.imencode('.png', res)
    return buffer.tobytes()

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

        if result and result.get("status") == "SUCCESS":
            output_url = result["output"][0]
            print(f"Downloading enhanced image from prediction: {output_url}")
            resp = requests.get(output_url)
            if resp.status_code == 200:
                print("Successfully enhanced face via Predictions")
                return resp.content
            else:
                print(f"Failed to download image from prediction: {resp.status_code}")
        else:
            print(f"Prediction failed with status: {result.get('status') if result else 'None'}")
            
    except Exception as e:
        print(f"Error during PixelBin predictions face enhancement: {e}")
        
    return image_bytes

# =========================================================
# MAIN PIPELINE
# =========================================================

def process_image(user_image_bytes, user_prompt, gender="male", wears_glasses=False, hair_style="default"):

    # -----------------------------------------------------
    # STEP 1 - LOAD CONTEXT TEMPLATE
    # -----------------------------------------------------
    if gender == "female":
        template_path = os.path.join("templates", "cricket_template_female.png")
    else:
        template_path = os.path.join("templates", "cricket_template_male.png")
    
    try:
        with open(template_path, "rb") as f:
            template_bytes = f.read()
        print(f"STEP 1 - Using context template: {template_path}")
    except FileNotFoundError:
        print("Warning: Template not found. Falling back to using user image.")
        template_bytes = user_image_bytes

    # -----------------------------------------------------
    # STEP 2 - FINAL FACE SWAP ONTO TEMPLATE
    # -----------------------------------------------------
    print("STEP 2 - Performing direct Face Swap for 100% identity match onto exact template")

    final_swapped_bytes = swap_face(source_bytes=user_image_bytes, target_bytes=template_bytes)

    # -----------------------------------------------------
    # STEP 2.5 - HAIRSTYLE CUSTOMIZATION
    # -----------------------------------------------------
    if hair_style and hair_style != "default":
        print(f"STEP 2.5 - Customizing hairstyle: {hair_style} using low-strength FLUX pass")
        try:
            style_prompts = {
                "short": "a premium neat short haircut, stylish crop, perfectly styled clean hair",
                "long": "long flowing beautiful clean hairstyle, highly detailed hair, beautiful locks",
                "curly": "curly textured hairstyle, premium curls, detailed curly hair",
                "bald": "shaved bald head, smooth clean scalp, completely bald",
                "beard": "stylish stubble beard, trimmed facial hair and premium hairstyle"
            }
            hair_desc = style_prompts.get(hair_style, "")
            if hair_desc:
                final_swapped_pil = Image.open(io.BytesIO(final_swapped_bytes))
                
                # We use a strength of 0.22 to modify the hair outline without shifting face identity
                hair_prompt = f"{user_prompt}, with {hair_desc}, 3D cartoon caricature hairstyle, highly detailed"
                
                enhanced_image = client.image_to_image(
                    final_swapped_pil,
                    prompt=hair_prompt,
                    model="black-forest-labs/FLUX.2-klein-4B",
                    strength=0.22
                )
                
                enhanced_rgb = enhanced_image.convert("RGB")
                output_io = io.BytesIO()
                enhanced_rgb.save(output_io, format="PNG")
                final_swapped_bytes = output_io.getvalue()
                print(f"Successfully rendered customized hairstyle: {hair_style}")
        except Exception as e:
            print(f"Error customizing hairstyle with FLUX: {e}. Falling back to default swap.")

    # -----------------------------------------------------
    # STEP 3 - GLASSES ENHANCEMENT (IF APPLICABLE)
    # -----------------------------------------------------
    if wears_glasses:
        print("STEP 3 - Enhancing glasses with low strength FLUX pass")
        try:
            final_swapped_pil = Image.open(io.BytesIO(final_swapped_bytes))
            
            glasses_prompt = (
                user_prompt + 
                ", wearing stylish black-rimmed glasses, 3D cartoon spectacles, "
                "perfectly rendered glasses frames"
            )
            
            enhanced_image = client.image_to_image(
                final_swapped_pil,
                prompt=glasses_prompt,
                model="black-forest-labs/FLUX.2-klein-4B",
                strength=0.18
            )
            
            enhanced_rgb = enhanced_image.convert("RGB")
            output_io = io.BytesIO()
            enhanced_rgb.save(output_io, format="PNG")
            final_swapped_bytes = output_io.getvalue()
            print("Successfully rendered 3D glasses using FLUX")
        except Exception as e:
            print(f"Error drawing glasses with FLUX: {e}. Falling back to default swap.")

    # -----------------------------------------------------
    # STEP 4 - BACKGROUND REMOVAL & WHITE BACKGROUND
    # -----------------------------------------------------
    print("STEP 4 - Removing background and applying a solid white background")
    
    # Remove background
    final_img_pil = Image.open(io.BytesIO(final_swapped_bytes))
    transparent_img = remove(final_img_pil).convert("RGBA")
    
    # Composite onto a solid white background
    white_bg = Image.new("RGBA", transparent_img.size, (255, 255, 255, 255))
    final_composite = Image.alpha_composite(white_bg, transparent_img).convert("RGB")
    
    # -----------------------------------------------------
    # STEP 5 - FINAL SHARPENING
    # -----------------------------------------------------
    print("STEP 5 - Final sharpening pass")
    
    # Convert to CV2 for sharpening
    img_cv2 = cv2.cvtColor(np.array(final_composite), cv2.COLOR_RGB2BGR)
    gaussian_blur = cv2.GaussianBlur(img_cv2, (0, 0), 2.0)
    sharpened_img = cv2.addWeighted(img_cv2, 1.5, gaussian_blur, -0.5, 0)
    
    _, final_buffer = cv2.imencode('.png', sharpened_img)
    final_bytes = final_buffer.tobytes()

    print("STEP 6 - Applying PixelBin face enhancement")
    enhanced_final_bytes = enhance_face_pixelbin(final_bytes)

    # -----------------------------------------------------
    # STEP 7 - RESIZE TO EXACT 4x6 INCH AT 300 DPI (1200 x 1800)
    # -----------------------------------------------------
    print("STEP 7 - Resizing final output to exact 4x6 inches (1200 x 1800 pixels)")
    try:
        final_pil = Image.open(io.BytesIO(enhanced_final_bytes))
        resized_pil = final_pil.resize((1200, 1800), Image.Resampling.LANCZOS)
        
        output_io = io.BytesIO()
        resized_pil.save(output_io, format="JPEG", quality=90)
        print("Successfully resized and compressed final output to 1200 x 1800 JPEG")
        return output_io.getvalue()
    except Exception as e:
        print(f"Error resizing final image: {e}. Returning unresized bytes.")
        return enhanced_final_bytes