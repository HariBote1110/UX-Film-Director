//! R3バッチC: `psd` kindの編集モデル正本。`src/types.ts`の`PsdObject`固有部分
//! (`PsdObjectFields`)がRust側で定義され、既定値・wire上のcamelCase命名を
//! 保つことを固定する。`layerTree`（表示専用の派生ビュー）と`file`
//! （ブラウザ`File`、ランタイム専用）はこの型に含まれない。

use std::collections::BTreeMap;

use uxfd_rust_core::{
    LipSyncMapping, LipSyncSetting, LipSyncSourceMode, PsdLayerNodeFields, PsdObjectFields,
    PsdWorldPlacement, Vec3,
};

#[test]
fn psd_object_fields_default_is_neutral_except_scale() {
    // psd は image と同じく、実サイズ・src は解析済みPSDファイルから決まるため
    // width/height/src に固定既定値は無い（ニュートラルな空値）。
    // scale だけは `src/utils/psdParser.ts` の4箇所すべてで `1.0` の固定
    // リテラルであり、ファイル由来ではない真の既定値。
    let defaults = PsdObjectFields::default();

    assert_eq!(defaults.src, "");
    assert!(defaults.file_path.is_none());
    assert_eq!(defaults.width, 0.0);
    assert_eq!(defaults.height, 0.0);
    assert_eq!(defaults.scale, 1.0);
    assert!(defaults.root_layer.is_none());
    assert!(defaults.active_layer_ids.is_none());
    assert!(defaults.lip_sync.is_none());
    assert!(defaults.world_placement.is_none());
}

#[test]
fn psd_object_fields_serialise_with_camel_case_field_names() {
    let mut active_layer_ids = BTreeMap::new();
    active_layer_ids.insert("root".to_string(), true);
    active_layer_ids.insert("psd-layer-1".to_string(), false);

    let fields = PsdObjectFields {
        src: "blob:http://localhost/abc".to_string(),
        file_path: Some("/tmp/character.psd".to_string()),
        width: 640.0,
        height: 480.0,
        scale: 1.0,
        root_layer: Some(PsdLayerNodeFields {
            id: "root".to_string(),
            name: "Root".to_string(),
            is_group: true,
            is_radio: false,
            children: Vec::new(),
            width: 640.0,
            height: 480.0,
            left: 0.0,
            top: 0.0,
            default_visible: true,
            src: None,
        }),
        active_layer_ids: Some(active_layer_ids),
        lip_sync: Some(LipSyncSetting {
            enabled: true,
            source_mode: LipSyncSourceMode::Layer,
            target_layer: 3,
            audio_id: None,
            mapping: LipSyncMapping {
                a: "mouth_a".to_string(),
                i: "mouth_i".to_string(),
                u: "mouth_u".to_string(),
                e: "mouth_e".to_string(),
                o: "mouth_o".to_string(),
                n: "mouth_n".to_string(),
            },
        }),
        world_placement: Some(PsdWorldPlacement {
            enabled: true,
            position: Vec3 { x: -1.0, y: 0.0, z: 2.0 },
            rotation_y_deg: 45.0,
            scale: 1.5,
            billboard: true,
        }),
    };

    let value = serde_json::to_value(&fields).expect("PsdObjectFields must serialise");

    assert_eq!(value["src"], "blob:http://localhost/abc");
    assert_eq!(value["filePath"], "/tmp/character.psd");
    assert_eq!(value["width"], 640.0);
    assert_eq!(value["height"], 480.0);
    assert_eq!(value["scale"], 1.0);
    assert!(value.get("file_path").is_none());
    assert!(value.get("root_layer").is_none());
    assert!(value.get("active_layer_ids").is_none());
    assert!(value.get("lip_sync").is_none());
    assert!(value.get("world_placement").is_none());

    assert_eq!(value["rootLayer"]["id"], "root");
    // BTreeMap keys serialise in sorted order (deterministic), not insertion order.
    let keys: Vec<&str> = value["activeLayerIds"]
        .as_object()
        .expect("activeLayerIds must be an object")
        .keys()
        .map(|k| k.as_str())
        .collect();
    assert_eq!(keys, vec!["psd-layer-1", "root"]);
    assert_eq!(value["lipSync"]["sourceMode"], "layer");
    assert_eq!(value["lipSync"]["targetLayer"], 3);
    assert!(value["lipSync"]["audioId"].is_null());
    assert_eq!(value["worldPlacement"]["rotationYDeg"], 45.0);
}

#[test]
fn psd_object_fields_omit_absent_optional_fields() {
    let fields = PsdObjectFields::default();

    let value = serde_json::to_value(&fields).expect("PsdObjectFields must serialise");

    assert!(value.get("filePath").is_none());
    assert!(value.get("rootLayer").is_none());
    assert!(value.get("activeLayerIds").is_none());
    assert!(value.get("lipSync").is_none());
    assert!(value.get("worldPlacement").is_none());
}

#[test]
fn psd_object_fields_round_trip_through_json() {
    let mut active_layer_ids = BTreeMap::new();
    active_layer_ids.insert("root".to_string(), true);

    let fields = PsdObjectFields {
        src: "blob:abc".to_string(),
        file_path: None,
        width: 100.0,
        height: 200.0,
        scale: 1.0,
        root_layer: Some(PsdLayerNodeFields {
            id: "root".to_string(),
            name: "Root".to_string(),
            is_group: true,
            is_radio: false,
            children: Vec::new(),
            width: 100.0,
            height: 200.0,
            left: 0.0,
            top: 0.0,
            default_visible: true,
            src: None,
        }),
        active_layer_ids: Some(active_layer_ids),
        lip_sync: None,
        world_placement: None,
    };

    let json = serde_json::to_string(&fields).expect("serialise");
    let restored: PsdObjectFields = serde_json::from_str(&json).expect("deserialise");

    assert_eq!(fields, restored);
}
