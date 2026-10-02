from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO


BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"

OBJECT_MODEL_PATH = MODELS_DIR / "yolo26n-objv1-150.pt"
SEMANTIC_MODEL_PATH = MODELS_DIR / "yolo26n-sem-ade20k.pt"


# Load the trained models
OBJECT_MODEL = YOLO(str(OBJECT_MODEL_PATH))
SEMANTIC_MODEL = YOLO(str(SEMANTIC_MODEL_PATH))


app = FastAPI(
    title="NETRA Object Detection Service",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "NETRA Object Detection Service",
        "models": {
            "object": {
                "file": OBJECT_MODEL_PATH.name,
                "task": OBJECT_MODEL.task,
                "classes": len(OBJECT_MODEL.names),
            },
            "semantic": {
                "file": SEMANTIC_MODEL_PATH.name,
                "task": SEMANTIC_MODEL.task,
                "classes": len(SEMANTIC_MODEL.names),
            },
        },
    }


MAX_UPLOAD_SIZE = 15 * 1024 * 1024  # 15 MB limit
MAX_IMAGE_PIXELS = 25_000_000  # 25 Megapixels limit


@app.post("/api/detect")
async def detect(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Only image files are supported.",
        )

    image_bytes = await file.read()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty.",
        )

    if len(image_bytes) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Image size exceeds maximum allowed limit ({MAX_UPLOAD_SIZE // (1024 * 1024)}MB).",
        )

    image_array = np.frombuffer(
        image_bytes,
        dtype=np.uint8,
    )

    image = cv2.imdecode(
        image_array,
        cv2.IMREAD_COLOR,
    )

    if image is None:
        raise HTTPException(
            status_code=400,
            detail="Could not decode uploaded image.",
        )

    h, w = image.shape[:2]
    if (h * w) > MAX_IMAGE_PIXELS:
        raise HTTPException(
            status_code=400,
            detail=f"Image dimensions ({w}x{h}) exceed maximum allowed pixels.",
        )

    results = OBJECT_MODEL.predict(
        source=image,
        conf=0.35,
        verbose=False,
    )

    detections = []

    for result in results:
        if result.boxes is None:
            continue

        for box in result.boxes:
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])

            x1, y1, x2, y2 = map(
                float,
                box.xyxy[0],
            )

            detections.append(
                {
                    "class": OBJECT_MODEL.names[class_id],
                    "confidence": round(confidence, 3),
                    "box": [
                        round(x1, 1),
                        round(y1, 1),
                        round(x2, 1),
                        round(y2, 1),
                    ],
                }
            )

    return {
        "success": True,
        "model": OBJECT_MODEL_PATH.name,
        "count": len(detections),
        "detections": detections,
    }