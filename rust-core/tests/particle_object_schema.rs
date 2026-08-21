//! R3: `particle` kind の編集モデル正本。`src/types.ts` の `ParticleObject`
//! 固有部分 (`ParticleObjectFields`) が Rust 側で定義され、既定値・wire 上の
//! camelCase 命名を保つことを固定する。

use uxfd_rust_core::ParticleObjectFields;

#[test]
fn particle_object_fields_default_matches_existing_ui_defaults() {
    // TimelineContextMenu.tsx の handleAddParticle が呼ぶ
    // buildDefaultStandardParticleObject（標準パーティクル）の既定値と一致させる。
    // width/height はプロジェクトサイズから都度計算されるため固定既定値が無く、
    // ニュートラルな 0 にする。
    let defaults = ParticleObjectFields::default();

    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.particle_count, 96);
    assert_eq!(defaults.seed, 93);
    assert_eq!(defaults.spread, 160.0);
    assert_eq!(defaults.speed, 90.0);
    assert_eq!(defaults.size, 4.0);
    assert_eq!(defaults.colour, "#ffffff");
    assert_eq!(defaults.lifetime_seconds, 2.0);
}

#[test]
fn particle_object_fields_serialise_with_camel_case_field_names() {
    let fields = ParticleObjectFields {
        width: 320.0,
        height: 240.0,
        particle_count: 50,
        seed: 7,
        spread: 100.0,
        speed: 40.0,
        size: 6.0,
        colour: "#00ff00".to_string(),
        lifetime_seconds: 1.5,
    };

    let value = serde_json::to_value(&fields).expect("ParticleObjectFields must serialise");

    assert_eq!(value["particleCount"], 50);
    assert_eq!(value["lifetimeSeconds"], 1.5);
    assert!(value.get("particle_count").is_none());
    assert!(value.get("lifetime_seconds").is_none());
}
