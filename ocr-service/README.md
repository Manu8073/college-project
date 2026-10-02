# NETRA OCR Service

PaddleOCR text detection for the NETRA React frontend, served by FastAPI.

```
React Text Reader ──POST image──▶ FastAPI (this service) ──▶ PaddleOCR
       ▲                                                        │
       └────────────── { lines: [...], language } ◀─────────────┘
```

Lives next to `backend/` (the Node/Express API) because it is a separate Python
program with its own dependencies. The two do not talk to each other.

## API

### `POST /api/text-detection`

`multipart/form-data` with one file field named **`image`** (JPEG, PNG, WebP, BMP…).

```bash
curl -X POST -F "image=@sign.jpg" http://127.0.0.1:8000/api/text-detection
```

Success — `200`:

```json
{
  "lines": [
    { "text": "EMERGENCY EXIT", "confidence": 0.9871, "box": [[10, 5], [120, 5], [120, 30], [10, 30]] }
  ],
  "language": "en",
  "image_width": 1280,
  "image_height": 720,
  "processing_ms": 812
}
```

- `lines` is ordered top to bottom. It is `[]` (still `200`) when the image has no readable text.
- `confidence` is 0.0–1.0. Lines below `OCR_MIN_CONFIDENCE` are left out.
- `box` is the outline of the text in pixel coordinates of the uploaded image.
- `image_width`, `image_height`, `processing_ms` are extras the frontend ignores.

Errors use the same style as the Express backend, plus a `code`:

```json
{ "success": false, "code": "INVALID_IMAGE", "message": "The uploaded file is not a valid image. …" }
```

| Status | `code`            | Meaning                                                      |
|--------|-------------------|--------------------------------------------------------------|
| 400    | `INVALID_REQUEST` | No `image` field, or the request was not multipart/form-data |
| 400    | `EMPTY_IMAGE`     | The file was empty                                           |
| 400    | `INVALID_IMAGE`   | The file is not a readable image (corrupt, wrong format)     |
| 413    | `IMAGE_TOO_LARGE` | Over `MAX_UPLOAD_MB` or `MAX_IMAGE_PIXELS`                   |
| 500    | `OCR_FAILED`      | PaddleOCR failed on this image (details are in the server log) |
| 503    | `MODEL_NOT_READY` | The OCR model is not loaded — see `/api/health` and the log  |

### `GET /api/health`

`200` and `"ready": true` when the model is loaded. `503` otherwise, with the reason in `"error"`.

### `GET /docs`

Interactive Swagger UI — the easiest way to try an upload from the browser.

## Setup on macOS Apple Silicon (M1/M2/M3/M4)

Needs macOS 13 or newer, and **native arm64 Python 3.10–3.13**. Python 3.14 will not work
(PaddlePaddle has no wheels for it yet). Python 3.12 is recommended.

```bash
# 1. Install Python 3.12 (skip if you already have 3.10–3.13)
brew install python@3.12

# 2. Confirm it is native Apple Silicon — this must print: arm64
python3.12 -c "import platform; print(platform.machine())"

# 3. From the project root, go into this folder
cd ocr-service

# 4. Create and activate a virtual environment (once)
python3.12 -m venv .venv
source .venv/bin/activate

# 5. Install dependencies (once; downloads PaddlePaddle, ~100 MB)
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Each new terminal: `cd ocr-service && source .venv/bin/activate`.

## Run

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**First start:** PaddleOCR downloads its model files (needs internet) and caches them in
`~/.paddlex`, so this can take a few minutes. Wait for `Application startup complete`.
Later starts take a few seconds.

Check it:

```bash
curl http://127.0.0.1:8000/api/health        # → "ready": true
```

Then open http://127.0.0.1:8000/docs, expand `POST /api/text-detection`, click
**Try it out**, choose a photo of some text and **Execute**.

Don't add `--reload`: every code change would reload the model.

## Connect the React frontend

In `frontend/.env.local` (git-ignored) add:

```
VITE_TEXT_DETECTION_API_URL=http://127.0.0.1:8000/api/text-detection
VITE_TEXT_DETECTION_MOCK=false
```

Restart `npm run dev` — Vite only reads env files at start-up. The Text Reader's
"MOCK MODE" badge disappears when the real service is in use.

Run these side by side: this service (port 8000) and the frontend (port 5173).
The Node backend (port 5001) is not needed for text detection.

## Configuration

Optional. Copy `.env.example` to `.env` and edit, then restart the service.

| Variable             | Default                                          | Purpose                                       |
|----------------------|--------------------------------------------------|-----------------------------------------------|
| `OCR_LANG`           | `en`                                             | PaddleOCR language (`en`, `ch`, `japan`, `hi`, `ta`, `te`, …) |
| `OCR_MIN_CONFIDENCE` | `0.5`                                            | Drop lines scoring below this                 |
| `CORS_ORIGINS`       | `http://localhost:5173,http://127.0.0.1:5173`    | Browser origins allowed to call the API       |
| `MAX_UPLOAD_MB`      | `10`                                             | Largest accepted upload                       |
| `MAX_IMAGE_PIXELS`   | `25000000`                                       | Largest accepted image (width × height)       |
| `PRELOAD_MODEL`      | `true`                                           | Load the model at start-up                    |
| `PADDLE_PDX_MODEL_SOURCE` | `huggingface`                               | Where models download from: `huggingface`, `bos`, `modelscope` |

## Tests

```bash
pip install -r requirements-dev.txt
pytest -v
```

The tests run the real API with a **fake** OCR engine, so they need no model download and
no internet. They cover request handling, validation, error responses, CORS and the
conversion of PaddleOCR's result format. They do not measure OCR accuracy.

## Project layout

```
ocr-service/
├── app/
│   ├── main.py         FastAPI app: routes, CORS, error handling, start-up
│   ├── ocr_engine.py   The only file that touches PaddleOCR
│   ├── image_utils.py  Upload bytes → image array; rejects bad/huge images
│   ├── schemas.py      Response models (the JSON contract)
│   └── config.py       Settings from environment variables
├── tests/              pytest suite (fake OCR engine)
├── requirements.txt    Runtime dependencies (pinned)
├── requirements-dev.txt  + test dependencies
├── .env.example        Configuration template
└── .gitignore          Ignores .venv, caches and .env
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `No matching distribution found for paddlepaddle` | Wrong Python. Use native arm64 Python 3.10–3.13 (`python3.12`), not 3.14 and not an Intel/Rosetta build. Delete `.venv` and redo setup. |
| Start-up log shows `Could not load PaddleOCR` / `/api/health` is 503 | The model download failed. Check your internet, then try `PADDLE_PDX_MODEL_SOURCE=bos` (or `modelscope`) in `.env` and restart. |
| Browser console shows a CORS error | The frontend's address must be listed in `CORS_ORIGINS`. Restart the service after editing `.env`. |
| Frontend shows "HTTP 404" | `VITE_TEXT_DETECTION_API_URL` is not set (the default path goes to the Node backend). Set it and restart Vite. |
| Frontend shows "Could not reach the text detection service" | The service is not running, or the URL/port is wrong. |
| `Address already in use` | Another program uses port 8000. Use `--port 8001` and update the frontend URL. |
| First request is slow | Normal for the first run after start; later requests are faster. OCR runs on CPU only. |

## Security notes

- The service has **no authentication**. It binds to `127.0.0.1` (this computer only). Don't
  expose it to a network or the internet as it is.
- Uploaded images are processed in memory and never saved by this service (the web framework may
  briefly spool a large upload to a temporary file, deleted after the request). The recognized
  text is never logged or stored — only line counts and timing are logged.
