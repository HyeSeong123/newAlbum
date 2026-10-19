fn main() {
    for name in ["GSS_COMMERCIAL", "VITE_AI_ENGINE"] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    for file in ["../models/native/registry.json", "../scripts/native-ai/release-gate.mjs", "../package.json", "../public/models", "../dist"] {
        println!("cargo:rerun-if-changed={file}");
    }
    // Protect direct `tauri build`/Cargo release invocations as well as npm scripts.
    // Debug development builds remain available without a release clearance.
    if std::env::var("PROFILE").as_deref() == Ok("release")
        || std::env::var("GSS_COMMERCIAL").as_deref() == Ok("1")
    {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let status = std::process::Command::new("node")
            .arg("scripts/native-ai/release-gate.mjs")
            .current_dir(root)
            .status()
            .expect("Node is required to verify model rights before a release build");
        assert!(status.success(), "Native AI release rights/artifact review is incomplete");
    }
    tauri_build::build();
}
