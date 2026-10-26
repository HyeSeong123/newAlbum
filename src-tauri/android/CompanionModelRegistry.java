package com.oraedameun.album;

/** Download proofs and compatibility for the legacy model and the explicit dialogue upgrade. */
public final class CompanionModelRegistry {
    private CompanionModelRegistry() {}
    public static final Model LEGACY = new Model("legacy", "companion-ai-v1", "qwen3-1.7b-q4-k-m.gguf",
        "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/d7f544eead698dbd1f15126ef60b45a1e1933222/Qwen3-1.7B-Q4_K_M.gguf",
        1107409472L, "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897", false);
    public static final Model DIALOGUE = new Model("dialogue", "companion-ai-v2", "qwen3-4b-instruct-2507-q4-k-m.gguf",
        "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        2497281120L, "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597", true);

    public static Model select(boolean dialogueInstalled, boolean legacyInstalled) {
        return dialogueInstalled ? DIALOGUE : legacyInstalled ? LEGACY : null;
    }

    public static final class Model {
        public final String id, directory, filename, url, sha256;
        public final long bytes;
        private final boolean instructOnly;
        private Model(String id, String directory, String filename, String url, long bytes, String sha256,
                      boolean instructOnly) {
            this.id=id; this.directory=directory; this.filename=filename; this.url=url;
            this.bytes=bytes; this.sha256=sha256; this.instructOnly=instructOnly;
        }
        public boolean verified(long actualBytes, String recordedSha, long recordedMtime, long actualMtime) {
            return actualBytes == bytes && sha256.equals(recordedSha) && recordedMtime == actualMtime;
        }
        public boolean canGenerate(long availableMemory, boolean lowMemory) {
            return canGenerate(availableMemory, lowMemory, 0);
        }
        public boolean canGenerate(long availableMemory, boolean lowMemory, long androidThreshold) {
            // Weights are mmap-backed, not a fresh 2.5GB heap allocation per response.
            // Keep context/OS headroom even when the shared model is already resident.
            long reserve = Math.max(512L * 1024 * 1024, androidThreshold + 256L * 1024 * 1024);
            return !lowMemory && availableMemory >= reserve;
        }
        public boolean canDownload(long availableStorage) { return availableStorage >= bytes + 256L * 1024 * 1024; }
        public String preparePrompt(String prompt) {
            if (!instructOnly) return prompt;
            String suffix="<think>\n\n</think>\n\n";
            String prepared=prompt.endsWith(suffix) ? prompt.substring(0,prompt.length()-suffix.length()) : prompt;
            return prepared.replace("/no_think", "");
        }
    }
}
