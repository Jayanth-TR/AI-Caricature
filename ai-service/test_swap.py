import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis

print("Loading FaceAnalysis...")
app = FaceAnalysis(name='buffalo_l')
app.prepare(ctx_id=0, det_size=(640, 640))

print("Loading Inswapper...")
swapper = insightface.model_zoo.get_model('inswapper_128.onnx', download=False, download_zip=False)

print("OK!")
