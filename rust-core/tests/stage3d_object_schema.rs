//! R3バッチA: `psd`/3D系移送の準備として、3Dステージ用の共有値型
//! (`Vec3` / `StageCamera3D` / `PsdWorldPlacement` / `LipSyncSetting`)が
//! `src/types.ts` の手書き interface とフィールド構成・camelCase命名・
//! optional/defaultの扱いにおいて一致することを固定する。

use uxfd_rust_core::{
    LipSyncMapping, LipSyncSetting, LipSyncSourceMode, PsdWorldPlacement, StageCamera3D, Vec3,
};

fn sample_vec3() -> Vec3 {
    Vec3 { x: 1.0, y: 2.0, z: 3.0 }
}

#[test]
fn vec3_serialises_with_xyz_fields() {
    let value = serde_json::to_value(sample_vec3()).expect("Vec3 must serialise");

    assert_eq!(value["x"], 1.0);
    assert_eq!(value["y"], 2.0);
    assert_eq!(value["z"], 3.0);
}

#[test]
fn stage_camera_3d_has_position_and_target() {
    let camera = StageCamera3D {
        position: sample_vec3(),
        target: Vec3 { x: 0.0, y: 0.0, z: 0.0 },
    };

    let value = serde_json::to_value(&camera).expect("StageCamera3D must serialise");

    assert_eq!(value["position"]["x"], 1.0);
    assert_eq!(value["target"]["x"], 0.0);
}

#[test]
fn psd_world_placement_serialises_with_camel_case_field_names() {
    let placement = PsdWorldPlacement {
        enabled: true,
        position: sample_vec3(),
        rotation_y_deg: 45.0,
        scale: 1.5,
        billboard: true,
    };

    let value = serde_json::to_value(&placement).expect("PsdWorldPlacement must serialise");

    assert_eq!(value["enabled"], true);
    assert_eq!(value["rotationYDeg"], 45.0);
    assert_eq!(value["scale"], 1.5);
    assert_eq!(value["billboard"], true);
    assert!(value.get("rotation_y_deg").is_none());
}

#[test]
fn lip_sync_setting_serialises_with_camel_case_and_nested_mapping() {
    let setting = LipSyncSetting {
        enabled: true,
        source_mode: LipSyncSourceMode::Layer,
        target_layer: 2,
        audio_id: Some("audio-1".to_string()),
        mapping: LipSyncMapping {
            a: "a-layer".to_string(),
            i: "i-layer".to_string(),
            u: "u-layer".to_string(),
            e: "e-layer".to_string(),
            o: "o-layer".to_string(),
            n: "n-layer".to_string(),
        },
    };

    let value = serde_json::to_value(&setting).expect("LipSyncSetting must serialise");

    assert_eq!(value["sourceMode"], "layer");
    assert_eq!(value["targetLayer"], 2);
    assert_eq!(value["audioId"], "audio-1");
    assert_eq!(value["mapping"]["a"], "a-layer");
    assert_eq!(value["mapping"]["n"], "n-layer");
    assert!(value.get("source_mode").is_none());
    assert!(value.get("target_layer").is_none());
    assert!(value.get("audio_id").is_none());
}

#[test]
fn lip_sync_setting_audio_id_none_serialises_as_null() {
    // audioId は `string | null`（missing key ではなく null）。他フィールドと違い
    // 省略ではなくクロスオブジェクト参照の「未設定」を明示する null を保つ。
    let setting = LipSyncSetting {
        enabled: false,
        source_mode: LipSyncSourceMode::Object,
        target_layer: 0,
        audio_id: None,
        mapping: LipSyncMapping {
            a: String::new(),
            i: String::new(),
            u: String::new(),
            e: String::new(),
            o: String::new(),
            n: String::new(),
        },
    };

    let value = serde_json::to_value(&setting).expect("LipSyncSetting must serialise");

    assert!(value.get("audioId").is_some());
    assert!(value["audioId"].is_null());
}
