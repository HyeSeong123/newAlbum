// Native is the safe default on this development branch. Legacy comparison is
// an explicit developer opt-in and cannot pass the commercial release gate.
export const nativeAIEnabled = import.meta.env.VITE_AI_ENGINE !== 'legacy';
export { NATIVE_AI_MESSAGE } from './native/engines';
