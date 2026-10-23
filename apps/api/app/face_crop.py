"""
Determines where to place the 9:16 crop window over a landscape source
video by detecting faces across sampled frames and centering the crop
on their average horizontal position.

Uses OpenCV's bundled Haar cascade rather than a heavier DNN face
detector — it's CPU-fast and ships with opencv-python, so there's no
extra model download for this step. If face-tracking accuracy becomes
a product priority later, swapping in a DNN detector (e.g. YuNet) is a
drop-in replacement for `_detect_faces_in_frame` — nothing else in this
module needs to change.
"""

import cv2
import numpy as np


class VideoReadError(Exception):
    pass


def _detect_faces_in_frame(frame: np.ndarray, cascade: cv2.CascadeClassifier) -> list[tuple[int, int, int, int]]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    return [tuple(f) for f in faces]


def find_face_center_fraction(video_path: str, sample_count: int = 8) -> float:
    """
    Returns the average face center as a fraction of frame width (0.0
    = far left, 0.5 = center, 1.0 = far right), sampled evenly across
    the clip. Falls back to 0.5 (dead center) if no faces are found in
    any sampled frame — a safe default that just center-crops.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise VideoReadError(f"Could not open video: {video_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))

    if total_frames <= 0 or frame_width <= 0:
        cap.release()
        raise VideoReadError("Video reports zero frames or zero width")

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    sample_indices = np.linspace(0, total_frames - 1, num=min(sample_count, total_frames), dtype=int)
    face_centers_x: list[float] = []

    for idx in sample_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        if not ok:
            continue
        faces = _detect_faces_in_frame(frame, cascade)
        for (x, y, w, h) in faces:
            face_centers_x.append((x + w / 2) / frame_width)

    cap.release()

    if not face_centers_x:
        return 0.5

    return float(np.mean(face_centers_x))


def compute_crop_window(source_width: int, source_height: int, face_center_fraction: float) -> dict:
    """
    Given a landscape source and where the face is, returns the ffmpeg
    crop rectangle for a 9:16 output that keeps the face centered and
    never reads outside the source frame.
    """
    target_ratio = 9 / 16
    crop_width = round(source_height * target_ratio)
    crop_width = min(crop_width, source_width)  # never crop wider than the source

    face_center_px = face_center_fraction * source_width
    x = round(face_center_px - crop_width / 2)
    x = max(0, min(x, source_width - crop_width))  # clamp inside frame bounds

    return {"x": x, "y": 0, "width": crop_width, "height": source_height}
