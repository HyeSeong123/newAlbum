fn main() {
    for name in ["GSS_COMMERCIAL"] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    for file in ["../scripts/release/check-ai-assets.mjs", "../public/notices", "../scripts/face-models.lock.json", "../scripts/recognition-models.lock.json", "../scripts/pet-model-lock.json", "../dist"] {
        println!("cargo:rerun-if-changed={file}");
    }
    // Preserve model inventory/notices even for direct Cargo release builds.
    // Business acceptance does not turn unresolved rights into legal clearance.
    if std::env::var("PROFILE").as_deref() == Ok("release")
        || std::env::var("GSS_COMMERCIAL").as_deref() == Ok("1")
    {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let status = std::process::Command::new("node")
            .arg("scripts/release/check-ai-assets.mjs")
            .arg("--dist")
            .current_dir(root)
            .status()
            .expect("Node is required to verify packaged AI assets");
        assert!(status.success(), "AI packaging inventory or license notices are incomplete");
    }
    tauri_build::build();
}
