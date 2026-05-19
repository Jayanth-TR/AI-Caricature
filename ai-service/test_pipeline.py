import cv2
import numpy as np
from pipeline import process_image

def create_dummy_image(color=(255, 0, 0)):
    img = np.zeros((512, 512, 3), dtype=np.uint8)
    img[:] = color
    # draw a face-like shape so face detection doesn't complain immediately
    cv2.circle(img, (256, 256), 100, (200, 200, 200), -1)
    # eyes
    cv2.circle(img, (220, 230), 20, (0, 0, 0), -1)
    cv2.circle(img, (290, 230), 20, (0, 0, 0), -1)
    # mouth
    cv2.ellipse(img, (256, 290), (40, 20), 0, 0, 180, (0, 0, 255), 5)
    
    _, buffer = cv2.imencode('.jpg', img)
    return buffer.tobytes()

if __name__ == "__main__":
    print("Creating dummy images...")
    user_img = create_dummy_image((255, 200, 200))
    template_img = create_dummy_image((200, 255, 200))
    
    print("Testing pipeline...")
    try:
        output_bytes = process_image(user_img, "A generic prompt for testing")
        print(f"Success! Output image size: {len(output_bytes)} bytes")
        with open("test_output.jpg", "wb") as f:
            f.write(output_bytes)
        print("Saved to test_output.jpg")
    except Exception as e:
        print(f"Error testing pipeline: {e}")
