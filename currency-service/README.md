# NETRA Currency Detection Service

Detects a banknote's currency and denomination from a camera frame, for
the NETRA assistive vision frontend.

Built on **BankNote-Net**, an open dataset and pretrained encoder from
Microsoft AI for Good, purpose-built for assistive currency recognition
(it powers a feature in Microsoft's Seeing AI app). Covers **17
currencies and 112 denominations**:

AUD, BRL, CAD, EUR, GBP, INR, JPY, MXN, PKR, SGD, TRY, USD, NZD, NNR, MYR, IDR, PHP

Source: https://github.com/microsoft/banknote-net (CDLA-Permissive-2.0 license)

## One-time setup

```bash
cd currency-service
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python setup/download_and_train.py
```

This downloads the pretrained encoder + embeddings dataset (~small,
embeddings only — no raw images) and trains a small classifier on top.
Takes a few minutes. Produces three files under `models/`:

- `banknote_net_encoder.h5` — Microsoft's pretrained encoder (downloaded)
- `currency_classifier.h5` — the classifier trained by the setup script
- `label_classes.npy` — maps prediction indices back to `"<currency>_<denomination>"`

You only need to run this once. `models/` is gitignored (the files are
large and are reproducible by re-running the script).

## Run the service

```bash
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Wait for `Application startup complete`. Check it's ready:

```bash
curl http://127.0.0.1:8001/api/health
```

Should return `{"success": true, "ready": true, "num_classes": 112, "error": null}`.

## Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/currency-detection` | POST | multipart/form-data, file field `image` |
| `/api/health` | GET | is the model loaded? |
| `/docs` | GET | interactive Swagger UI |

### Example response

```json
{
  "found": true,
  "currency": "INR",
  "denomination": "500",
  "confidence": 0.93,
  "processing_ms": 142
}
```

`found: false` means no banknote was recognized with enough confidence
(controlled by `CURRENCY_MIN_CONFIDENCE` in `.env`, default `0.6`) —
this is a normal HTTP 200 response, not an error.

## Frontend integration

Add to `frontend/.env.local`:

```env
VITE_CURRENCY_DETECTION_API_URL=http://127.0.0.1:8001/api/currency-detection
VITE_CURRENCY_DETECTION_MOCK=false
```

The matching frontend module (`currencyDetectionService.js` +
`CurrencyReader.jsx`) follows the exact same pattern as
`textDetectionService.js` + `TextReader.jsx` in the OCR module — same
error codes, same multipart upload, same mock-mode convention.

## Troubleshooting

| You see | Fix |
|---|---|
| `FileNotFoundError: ... not found in .../models` | Run `python setup/download_and_train.py` first |
| `/api/health` shows `"ready": false` | Check the terminal log for the load error; usually a missing setup step or a network issue during download |
| `Could not reach the currency detection service` (frontend) | The service isn't running, or `VITE_CURRENCY_DETECTION_API_URL` is wrong |
| `HTTP 503` | Models aren't loaded yet — check `/api/health` |
