export const FACE_DETECTION_MIN_CONFIDENCE = 0.35;
export const FACE_AUTOMATIC_MIN_CONFIDENCE = 0.65;

// Enlarging recall must not promote small, weak animal/background detections
// into visible human faces. High-confidence original results stay unchanged.
export function retainFaceDetection(detection: { score: number; box: { width: number; height: number } }): boolean {
  return Number.isFinite(detection.score) && detection.score >= FACE_DETECTION_MIN_CONFIDENCE &&
    (detection.score >= FACE_AUTOMATIC_MIN_CONFIDENCE || Math.min(detection.box.width, detection.box.height) >= 60);
}
