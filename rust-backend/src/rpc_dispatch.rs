use crate::decode::{
    handle_decode_release_frame, handle_decode_request_frame, handle_decode_start,
    handle_decode_stop,
};
use crate::encode::{
    handle_encode_abort, handle_encode_finish, handle_encode_start, handle_encode_write_frame,
};
use crate::fonts::handle_fonts_list;
use crate::media::{
    handle_audio_waveform_samples, handle_media_probe, handle_psd_await_blob, handle_psd_parse,
    handle_psd_render_composite,
};
use crate::native_render::{
    handle_encode_write_native_frame, handle_encode_write_resident_scene_frame,
    handle_native_render_shared_frame,
};
use crate::native_shared::handle_release_native_render_shared_frame;
use crate::proxy::handle_proxy_generate;
use crate::rpc::{HealthResult, RpcError, RpcRequest, RpcResponse};
use crate::scene::{handle_scene_evaluate, handle_scene_replace};
use crate::state::BackendState;
use crate::transcode::handle_encode_transcode_video;
use serde_json::Value;

pub(crate) fn handle_request(request: RpcRequest, state: &mut BackendState) -> RpcResponse {
    match request.method.as_str() {
        "health" => {
            let result = HealthResult {
                status: "ok",
                engine: "uxfd-rust-backend",
                version: env!("CARGO_PKG_VERSION"),
            };

            RpcResponse {
                id: request.id,
                ok: true,
                result: Some(serde_json::to_value(result).unwrap_or(Value::Null)),
                error: None,
            }
        }
        "echo" => RpcResponse {
            id: request.id,
            ok: true,
            result: Some(request.params),
            error: None,
        },
        "media.probe" => handle_media_probe(request.id, request.params),
        "fonts.list" => handle_fonts_list(request.id),
        "audio.waveformSamples" => handle_audio_waveform_samples(request.id, request.params),
        "psd.parse" => handle_psd_parse(request.id, request.params, state),
        "psd.renderComposite" => {
            handle_psd_render_composite(request.id, request.params, state)
        }
        "psd.await_blob" => handle_psd_await_blob(request.id, state),
        "decode.start" => handle_decode_start(request.id, request.params, state),
        "decode.stop" => handle_decode_stop(request.id, request.params, state),
        "decode.requestFrame" => {
            handle_decode_request_frame(request.id, request.params, state, false)
        }
        "decode.requestFrameInline" => {
            handle_decode_request_frame(request.id, request.params, state, true)
        }
        "decode.releaseFrame" => handle_decode_release_frame(request.id, request.params, state),
        "encode.start" => handle_encode_start(request.id, request.params, state),
        "encode.writeFrame" => handle_encode_write_frame(request.id, request.params, state),
        "encode.writeNativeFrame" => {
            handle_encode_write_native_frame(request.id, request.params, state)
        }
        "encode.writeResidentSceneFrame" => {
            handle_encode_write_resident_scene_frame(request.id, request.params, state)
        }
        "encode.transcodeVideo" => handle_encode_transcode_video(request.id, request.params, state),
        "encode.finish" => handle_encode_finish(request.id, request.params, state),
        "encode.abort" => handle_encode_abort(request.id, request.params, state),
        "render.nativeSharedFrame" => {
            handle_native_render_shared_frame(request.id, request.params, state)
        }
        "render.releaseNativeSharedFrame" => {
            handle_release_native_render_shared_frame(request.id, request.params, state)
        }
        "scene.replace" => handle_scene_replace(request.id, request.params, state),
        "scene.evaluate" => handle_scene_evaluate(request.id, request.params, state),
        "proxy.generate" => handle_proxy_generate(request.id, request.params),
        _ => RpcResponse {
            id: request.id,
            ok: false,
            result: None,
            error: Some(RpcError {
                code: -32601,
                message: format!("Method not found: {}", request.method),
            }),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn request(id: u64, method: &str, params: Value) -> RpcRequest {
        RpcRequest {
            id,
            method: method.to_string(),
            params,
        }
    }

    fn replace_params(scene_id: &str, revision: u64, colour: &str) -> Value {
        json!({
            "sceneId": scene_id,
            "revision": revision,
            "project": {
                "id": "project-1",
                "version": 1,
                "size": { "width": 1920, "height": 1080 },
                "fps": { "numerator": 60, "denominator": 1 },
                "colour": {
                    "profile": "rec709-sdr",
                    "working_space": "linear-light",
                    "alpha": "premultiplied"
                },
                "media": [{
                    "id": "media-1",
                    "kind": "SolidColour",
                    "source": colour
                }],
                "tracks": [{
                    "id": "track-1",
                    "clips": [{
                        "id": "clip-1",
                        "media_id": "media-1",
                        "kind": "SolidColourPlane",
                        "start_frame": 0,
                        "duration_frames": 60,
                        "transform": {
                            "translation_x": 12.0,
                            "translation_y": 34.0,
                            "scale_x": 1.0,
                            "scale_y": 1.0,
                            "rotation_degrees": 0.0,
                            "sampling": "nearest"
                        },
                        "opacity": 1.0,
                        "effects": []
                    }]
                }]
            },
            "media": [{
                "id": "media-1",
                "kind": "SolidColour",
                "source": colour,
                "width": 320,
                "height": 180
            }]
        })
    }

    #[test]
    fn scene_replace_then_evaluate_returns_resident_project_snapshot_and_media() {
        let mut state = BackendState::default();
        let replaced = handle_request(
            request(1, "scene.replace", replace_params("scene-1", 4, "#112233")),
            &mut state,
        );
        assert!(
            replaced.ok,
            "scene.replace must create the resident session"
        );

        let evaluated = handle_request(
            request(
                2,
                "scene.evaluate",
                json!({ "sceneId": "scene-1", "revision": 4, "frameIndex": 12 }),
            ),
            &mut state,
        );
        assert!(evaluated.ok, "scene.evaluate must use the resident session");
        let result = evaluated.result.expect("scene.evaluate result");
        assert_eq!(result["frameIndex"], 12);
        assert_eq!(result["snapshot"]["frame_index"], 12);
        assert_eq!(result["canvas"]["width"], 1920);
        assert_eq!(result["canvas"]["height"], 1080);
        assert_eq!(result["snapshot"]["clips"][0]["clip_id"], "clip-1");
        assert_eq!(result["media"][0]["source"], "#112233");
    }

    #[test]
    fn resident_scene_encode_evaluates_without_receiving_a_snapshot() {
        let mut state = BackendState::default();
        assert!(
            handle_request(
                request(1, "scene.replace", replace_params("export-scene", 4, "#112233")),
                &mut state,
            )
            .ok
        );

        let response = handle_request(
            request(
                2,
                "encode.writeResidentSceneFrame",
                json!({
                    "sessionId": "missing-encode-session",
                    "sceneId": "export-scene",
                    "revision": 4,
                    "frameIndex": 12
                }),
            ),
            &mut state,
        );

        assert!(!response.ok);
        assert_eq!(
            response.error.expect("missing encode session error").code,
            -32052
        );
    }

    #[test]
    fn scene_evaluate_returns_only_media_referenced_by_active_clips() {
        let mut params = replace_params("scene-1", 4, "#112233");
        params["project"]["media"]
            .as_array_mut()
            .expect("project media array")
            .push(json!({
                "id": "media-later",
                "kind": "SolidColour",
                "source": "#ff0000"
            }));
        params["project"]["tracks"][0]["clips"]
            .as_array_mut()
            .expect("track clips array")
            .push(json!({
                "id": "clip-later",
                "media_id": "media-later",
                "kind": "SolidColourPlane",
                "start_frame": 30,
                "duration_frames": 30,
                "opacity": 1.0,
                "effects": []
            }));
        params["media"]
            .as_array_mut()
            .expect("scene media array")
            .push(json!({
                "id": "media-later",
                "kind": "SolidColour",
                "source": "#ff0000",
                "width": 320,
                "height": 180
            }));
        let mut state = BackendState::default();
        assert!(handle_request(request(1, "scene.replace", params), &mut state).ok);

        let evaluated = handle_request(
            request(
                2,
                "scene.evaluate",
                json!({ "sceneId": "scene-1", "revision": 4, "frameIndex": 12 }),
            ),
            &mut state,
        );
        let result = evaluated.result.expect("scene.evaluate result");

        assert_eq!(result["media"].as_array().expect("evaluated media").len(), 1);
        assert_eq!(result["media"][0]["id"], "media-1");
    }

    #[test]
    fn scene_replace_rejects_same_or_older_revision_without_overwriting_resident_scene() {
        let mut state = BackendState::default();
        assert!(
            handle_request(
                request(1, "scene.replace", replace_params("scene-1", 4, "#112233")),
                &mut state,
            )
            .ok
        );

        for revision in [4, 3] {
            let stale = handle_request(
                request(
                    2,
                    "scene.replace",
                    replace_params("scene-1", revision, "#ff0000"),
                ),
                &mut state,
            );
            assert!(!stale.ok);
            assert_eq!(stale.error.expect("stale replace error").code, -32061);
        }

        let evaluated = handle_request(
            request(
                3,
                "scene.evaluate",
                json!({ "sceneId": "scene-1", "revision": 4, "frameIndex": 0 }),
            ),
            &mut state,
        );
        assert!(evaluated.ok);
        assert_eq!(
            evaluated.result.expect("scene result")["media"][0]["source"],
            "#112233"
        );
    }

    #[test]
    fn scene_evaluate_rejects_revision_mismatch_and_missing_scene() {
        let mut state = BackendState::default();
        let missing = handle_request(
            request(
                1,
                "scene.evaluate",
                json!({ "sceneId": "missing", "revision": 1, "frameIndex": 0 }),
            ),
            &mut state,
        );
        assert!(!missing.ok);
        assert_eq!(missing.error.expect("missing scene error").code, -32060);

        assert!(
            handle_request(
                request(2, "scene.replace", replace_params("scene-1", 4, "#112233")),
                &mut state,
            )
            .ok
        );
        let mismatch = handle_request(
            request(
                3,
                "scene.evaluate",
                json!({ "sceneId": "scene-1", "revision": 5, "frameIndex": 0 }),
            ),
            &mut state,
        );
        assert!(!mismatch.ok);
        assert_eq!(
            mismatch.error.expect("revision mismatch error").code,
            -32062
        );
    }
}
