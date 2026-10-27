export const FACE_DETECTION_MIN_CONFIDENCE = 0.35;
export const FACE_AUTOMATIC_MIN_CONFIDENCE = 0.65;

// Enlarging recall must not promote small, weak animal/background detections
// into visible human faces. Valid high-confidence results stay unchanged.
export function retainFaceDetection(detection: { score: number; box: { width: number; height: number } }): boolean {
  const { width, height } = detection.box;
  // Avoid attempting to crop impossible or nearly empty boxes, regardless of
  // detector confidence. This does not raise the threshold for valid faces.
  return Number.isFinite(detection.score) && Number.isFinite(width) && Number.isFinite(height) &&
    width >= 8 && height >= 8 && detection.score >= FACE_DETECTION_MIN_CONFIDENCE &&
    (detection.score >= FACE_AUTOMATIC_MIN_CONFIDENCE || Math.min(width, height) >= 60);
}
