"""
NETRA Currency Detection Service — One-Time Setup
─────────────────────────────────────────────────────────────
Downloads Microsoft's BankNote-Net pretrained encoder + embeddings
dataset (CDLA-Permissive-2.0 license), then trains a shallow
classifier on top of the embeddings for all 17 currencies at once.

Source: https://github.com/microsoft/banknote-net
Paper:  https://arxiv.org/pdf/2204.03738.pdf

Run from currency-service/, after activating the venv and installing
requirements.txt:

    python setup/download_and_train.py

Takes a few minutes (mostly the download; training itself is quick —
it runs on top of pre-computed embeddings, not raw images).
"""

import urllib.request
from pathlib import Path

import os
os.environ["TF_USE_LEGACY_KERAS"] = "1"

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder
from tensorflow import keras

BASE = "https://raw.githubusercontent.com/microsoft/banknote-net/main"
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)


def download(url: str, dest: Path) -> None:
    if dest.exists():
        print(f"already have {dest.name}, skipping download")
        return
    print(f"downloading {url}")
    urllib.request.urlretrieve(url, dest)
    print(f"saved to {dest}")


def main() -> None:
    # 1. Pretrained encoder (MobileNetV2-based, outputs a 256-dim embedding
    #    from a 224x224 banknote image).
    encoder_path = MODELS_DIR / "banknote_net_encoder.h5"
    download(f"{BASE}/models/banknote_net_encoder.h5", encoder_path)

    # 2. Embeddings dataset: 24,816 images x 256-dim embeddings, each
    #    labeled with currency + denomination. No raw images needed.
    data_path = MODELS_DIR / "banknote_net.feather"
    download(f"{BASE}/data/banknote_net.feather", data_path)

    # 3. Train a joint classifier: label = "<currency>_<denomination>"
    #
    # The real dataset columns are "Currency" and "Denomination" (capitalized).
    # "Denomination" includes a face/version suffix, e.g. "100_1", "100_2"
    # for the two faces of a AUD $100 note, or "10_1_1" for GBP's two note
    # versions x two faces. We strip that suffix so both faces of the same
    # denomination map to one class — the app doesn't care which face of
    # the note is showing, only the currency + value.
    print("\nTraining classifier on embeddings …")
    df = pd.read_feather(data_path)

    embedding_cols = [c for c in df.columns if c.startswith("v_")]
    clean_denom = df["Denomination"].astype(str).str.split("_").str[0]
    df["label"] = df["Currency"] + "_" + clean_denom

    X = df[embedding_cols].values
    y = df["label"].values

    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    num_classes = len(le.classes_)

    currencies = sorted(df["Currency"].unique())
    print(f"{num_classes} classes across {len(currencies)} currencies: {currencies}")

    from sklearn.model_selection import train_test_split
    X_train, X_val, y_train, y_val = train_test_split(X, y_enc, test_size=0.15, random_state=42, stratify=y_enc)

    model = keras.Sequential([
        keras.layers.Input(shape=(X.shape[1],)),
        keras.layers.Dense(512, activation="relu"),
        keras.layers.Dropout(0.4),
        keras.layers.Dense(256, activation="relu"),
        keras.layers.Dropout(0.3),
        keras.layers.Dense(128, activation="relu"),
        keras.layers.Dense(num_classes, activation="softmax"),
    ])
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    
    early_stop = keras.callbacks.EarlyStopping(
        monitor="val_accuracy", patience=7, restore_best_weights=True, verbose=1
    )
    
    model.fit(
        X_train, y_train, 
        validation_data=(X_val, y_val), 
        epochs=100, 
        batch_size=64, 
        callbacks=[early_stop],
        verbose=2
    )

    classifier_path = MODELS_DIR / "currency_classifier.h5"
    labels_path = MODELS_DIR / "label_classes.npy"
    model.save(classifier_path)
    np.save(labels_path, le.classes_)

    print(f"\nSaved {classifier_path.name} and {labels_path.name} to {MODELS_DIR}")
    print("Setup complete. Start the service with:")
    print("  uvicorn app.main:app --host 127.0.0.1 --port 8001")


if __name__ == "__main__":
    main()