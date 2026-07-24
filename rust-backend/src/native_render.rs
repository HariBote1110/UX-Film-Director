#[cfg(unix)]
use crate::{
    collect_native_render_nv12_sources, collect_native_render_source_content_revisions,
    collect_native_render_sources, load_cached_getcolor_sample_frame,
};
use crate::cpu_simple_video::{
    try_render_simple_video_frame, try_render_simple_video_frame_to_shared_ring,
};
use crate::encode::write_rgba_frame_to_encoder;
use crate::inprocess_decode::InProcessDecodeSession;
use crate::params::{
    EncodeWriteNativeFrameParams, EncodeWriteResidentSceneFrameParams,
    NativeRenderAudioWaveformSource, NativeRenderSharedFrameParams,
};
use crate::rpc::{response_error, RpcResponse};
use crate::sessions::EncodeTransport;
use crate::state::{BackendState, SourceFrameCache};
use serde_json::{json, Value};
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::path::Path;
use uxfd_native_wgpu_renderer::{
    BgraIoSurfaceTarget, NativeAudioWaveformInput, NativeGeneratedGpuSources, NativeGetColorSource,
    NativeHksySource, NativeParticleSource, NativeShakingPolygonSource,
    NativeShatteredSphereSource, NativeSimpleTubeSource, NativeWgpuRenderError, NativeWgpuRenderer,
};
use uxfd_rust_core::{
    build_video_frame_decode_requests, evaluate_frame, parse_generated_particle_source,
    AudioWaveformSource, MediaKind, SceneMediaReference, SceneSnapshot, VideoFrameDecodeRequest,
};
use uxfd_sidecar_protocol::{ColourMetadata, FrameFormat};

#[cfg(unix)]
pub(crate) fn handle_encode_write_resident_scene_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<EncodeWriteResidentSceneFrameParams>(params.clone())
    {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid encode.writeResidentSceneFrame params: {error}"),
            );
        }
    };
    let Some(scene_session) = state.scene_sessions.get(&parsed.scene_id) else {
        return response_error(id, -32060, "No resident scene session for export");
    };
    if scene_session.revision != parsed.revision {
        return response_error(
            id,
            -32062,
            "Resident scene export revision does not match the active scene",
        );
    }

    let snapshot = evaluate_frame(&scene_session.project, parsed.frame_index);
    let referenced_media_ids: HashSet<&str> = snapshot
        .clips
        .iter()
        .map(|clip| clip.media_id.as_str())
        .collect();
    let media = scene_session
        .media
        .iter()
        .filter(|reference| referenced_media_ids.contains(reference.id.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    let width = scene_session.project.size.width;
    let height = scene_session.project.size.height;
    let fps_numerator = u128::from(scene_session.project.fps.numerator.max(1));
    let timestamp_us = (
        u128::from(parsed.frame_index)
            .saturating_mul(u128::from(scene_session.project.fps.denominator))
            .saturating_mul(1_000_000)
            / fps_numerator
    )
    .min(u128::from(u64::MAX)) as u64;

    let video_requests = match build_video_frame_decode_requests(&snapshot, &media) {
        Ok(value) => value.requests,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid resident video decode request: {error:?}"),
            );
        }
    };
    let video_source_frames = video_requests
        .iter()
        .map(|request| {
            (
                request.clip_id.as_str(),
                request.media_id.as_str(),
                request.source_frame,
            )
        })
        .collect::<Vec<_>>();
    if let Err(message) = validate_resident_video_source_frames(&video_source_frames) {
        return response_error(id, -32602, &message);
    }
    let nv12_sources = match collect_resident_video_nv12_sources(
        &parsed.session_id,
        &parsed.scene_id,
        parsed.revision,
        &video_requests,
        state,
    ) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32071, &message),
    };

    let mut native_params = params;
    let Value::Object(native_object) = &mut native_params else {
        return response_error(id, -32602, "Resident scene encode params must be an object");
    };
    native_object.insert(
        "renderId".to_string(),
        Value::String(format!(
            "resident-{}-{}-{}-{}",
            parsed.session_id, parsed.scene_id, parsed.revision, parsed.frame_index
        )),
    );
    native_object.insert("timestampUs".to_string(), Value::from(timestamp_us));
    native_object.insert("width".to_string(), Value::from(width));
    native_object.insert("height".to_string(), Value::from(height));
    native_object.insert("snapshot".to_string(), json!(snapshot));
    native_object.insert("media".to_string(), json!(media));
    native_object.insert("nv12Sources".to_string(), json!(nv12_sources));
    native_object
        .entry("sources".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));

    handle_encode_write_native_frame(id, native_params, state)
}

#[cfg(not(unix))]
pub(crate) fn handle_encode_write_resident_scene_frame(
    id: u64,
    _params: Value,
    _state: &mut BackendState,
) -> RpcResponse {
    response_error(
        id,
        -32070,
        "encode.writeResidentSceneFrame requires POSIX shared memory support",
    )
}

#[cfg(unix)]
pub(crate) fn handle_encode_write_native_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<EncodeWriteNativeFrameParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid encode.writeNativeFrame params: {error}"),
            );
        }
    };

    {
        let Some(session) = state.encode_sessions.get(&parsed.session_id) else {
            return response_error(id, -32052, "No active encode session");
        };
        if parsed.width != session.width || parsed.height != session.height {
            return response_error(
                id,
                -32602,
                "Native encode frame dimensions do not match active session",
            );
        }
        if session.pixel_format != FrameFormat::Rgba8Srgb
            || session.colour != ColourMetadata::rec709_srgb()
        {
            return response_error(
                id,
                -32602,
                "Only bt709/srgb/rgb/full rgba8Srgb native encode input is supported",
            );
        }
    }

    let sources =
        match collect_native_render_sources(
            &parsed.snapshot,
            &parsed.media,
            &parsed.sources,
            &mut state.source_frame_cache,
        ) {
            Ok(value) => value,
            Err(message) => {
                return response_error(id, native_render_source_error_code(&message), &message);
            }
        };
    let particle_sources =
        match collect_native_render_particle_sources(&parsed.snapshot, &parsed.media) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32602, &message),
        };
    let getcolor_sources =
        match collect_native_render_getcolor_sources(&parsed.media, &mut state.source_frame_cache) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32602, &message),
        };
    let hksy_sources = match collect_native_render_hksy_sources(&parsed.media) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32602, &message),
    };
    let simple_tube_sources = match collect_native_render_simple_tube_sources(&parsed.media) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32602, &message),
    };
    let shattered_sphere_sources =
        match collect_native_render_shattered_sphere_sources(&parsed.snapshot, &parsed.media) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32602, &message),
        };
    let shaking_polygon_sources =
        match collect_native_render_shaking_polygon_sources(&parsed.snapshot, &parsed.media) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32602, &message),
        };
    let generated_gpu_sources = NativeGeneratedGpuSources {
        particles: particle_sources,
        getcolor: getcolor_sources,
        hksy: hksy_sources,
        simple_tubes: simple_tube_sources,
        shaking_polygons: shaking_polygon_sources,
        shattered_spheres: shattered_sphere_sources,
        ..NativeGeneratedGpuSources::default()
    };
    let audio_waveforms = match collect_native_render_audio_waveforms(&parsed.audio_waveforms) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32602, &message),
    };
    let mut nv12_sources = parsed.nv12_sources;
    nv12_sources.extend(collect_native_render_nv12_sources(
        &parsed.sources,
        &state.decode_sessions,
    ));
    if !native_render_has_valid_input(
        parsed.snapshot.clips.len(),
        sources.len(),
        audio_waveforms.len(),
        nv12_sources.len(),
        !generated_gpu_sources.is_empty(),
    ) {
        return response_error(
            id,
            -32602,
            "sources, media, audioWaveforms, or nv12Sources must include at least one render source",
        );
    }

    let uses_iosurface_encoder = state
        .encode_sessions
        .get(&parsed.session_id)
        .is_some_and(|session| {
            #[cfg(target_os = "macos")]
            {
                matches!(session.transport, EncodeTransport::VideoToolbox(_))
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = session;
                false
            }
        });

    if !uses_iosurface_encoder
        && audio_waveforms.is_empty()
        && nv12_sources.is_empty()
        && generated_gpu_sources.is_empty()
    {
        if let Some(frame) = match try_render_simple_video_frame(
            &parsed.snapshot,
            &parsed.media,
            &sources,
            parsed.width,
            parsed.height,
        ) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32071, &message),
        } {
            let (session_id, frame_count, encoded_frame_byte_len) = {
                let Some(session) = state.encode_sessions.get_mut(&parsed.session_id) else {
                    return response_error(id, -32052, "No active encode session");
                };
                let encoded_frame_byte_len = match write_rgba_frame_to_encoder(session, &frame) {
                    Ok(value) => value,
                    Err(message) => return response_error(id, -32053, &message),
                };
                session.frame_count += 1;
                (
                    session.session_id.clone(),
                    session.frame_count,
                    encoded_frame_byte_len,
                )
            };

            return RpcResponse {
                id,
                ok: true,
                result: Some(json!({
                    "written": true,
                    "writtenNativeFrame": true,
                    "sessionId": session_id,
                    "renderId": parsed.render_id,
                    "renderPath": "cpuSimpleVideoComposite",
                    "frameIndex": parsed.frame_index,
                    "timestampUs": parsed.timestamp_us,
                    "encodedFrameByteLen": encoded_frame_byte_len,
                    "frameCount": frame_count,
                    "nv12ZeroCopyMediaIds": Vec::<String>::new(),
                })),
                error: None,
            };
        }
    }

    #[cfg(target_os = "macos")]
    let iosurface_frame = if uses_iosurface_encoder {
        let Some(session) = state.encode_sessions.get(&parsed.session_id) else {
            return response_error(id, -32052, "No active encode session");
        };
        let EncodeTransport::VideoToolbox(encoder) = &session.transport else {
            unreachable!("uses_iosurface_encoder guarantees VideoToolbox transport");
        };
        match encoder.acquire_frame() {
            Ok(frame) => Some(frame),
            Err(error) => {
                return response_error(
                    id,
                    -32053,
                    &format!("Failed to acquire IOSurface encode frame: {error}"),
                );
            }
        }
    } else {
        None
    };

    let renderer = match get_or_create_native_wgpu_renderer(state, parsed.width, parsed.height) {
        Ok(value) => value,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            return response_error(id, -32070, "Native WebGPU adapter is unavailable");
        }
        Err(error) => {
            return response_error(
                id,
                -32071,
                &format!("Native WebGPU renderer setup failed: {error:?}"),
            );
        }
    };

    // Phase 3a: media_id ごとの内容世代（revision）。unchanged な media は
    // native-wgpu-renderer 側の per-clip GPU テクスチャキャッシュにより
    // create_texture/write_texture が省略される。
    let content_revisions = collect_native_render_source_content_revisions(
        &parsed.snapshot,
        &parsed.media,
        &parsed.sources,
    );

    #[cfg(target_os = "macos")]
    if let Some(iosurface_frame) = iosurface_frame {
        let timings = match pollster::block_on(
            renderer.render_frame_to_bgra_iosurface_with_audio_waveforms(
                &parsed.snapshot,
                &sources,
                &audio_waveforms,
                &generated_gpu_sources,
                &content_revisions,
                &nv12_sources,
                BgraIoSurfaceTarget {
                    surface_id: iosurface_frame.surface_id(),
                    width: iosurface_frame.width(),
                    height: iosurface_frame.height(),
                },
            ),
        ) {
            Ok(value) => value,
            Err(error) => {
                return response_error(
                    id,
                    -32071,
                    &format!("Native WebGPU IOSurface render failed: {error:?}"),
                );
            }
        };
        let (session_id, frame_count) = {
            let Some(session) = state.encode_sessions.get_mut(&parsed.session_id) else {
                return response_error(id, -32052, "No active encode session");
            };
            let EncodeTransport::VideoToolbox(encoder) = &mut session.transport else {
                return response_error(id, -32053, "Encode transport changed during frame render");
            };
            if let Err(error) = encoder.append_frame(iosurface_frame, parsed.frame_index) {
                return response_error(
                    id,
                    -32053,
                    &format!("Failed to append IOSurface encode frame: {error}"),
                );
            }
            session.frame_count += 1;
            (session.session_id.clone(), session.frame_count)
        };
        let nv12_zero_copy_media_ids: Vec<&str> =
            nv12_sources.keys().map(String::as_str).collect();
        return RpcResponse {
            id,
            ok: true,
            result: Some(json!({
                "written": true,
                "writtenNativeFrame": true,
                "sessionId": session_id,
                "renderId": parsed.render_id,
                "renderPath": "iosurfaceVideoToolbox",
                "nv12ZeroCopyMediaIds": nv12_zero_copy_media_ids,
                "frameIndex": parsed.frame_index,
                "timestampUs": parsed.timestamp_us,
                "encodedFrameByteLen": 0,
                "frameCount": frame_count,
                "timings": {
                    "setupMs": timings.setup.as_secs_f64() * 1000.0,
                    "sourceUploadMs": timings.source_upload.as_secs_f64() * 1000.0,
                    "renderMs": timings.render.as_secs_f64() * 1000.0,
                    "readbackEncodeMs": 0.0,
                    "steadyStateMs": timings.steady_state.as_secs_f64() * 1000.0,
                    "totalMs": timings.total.as_secs_f64() * 1000.0,
                },
            })),
            error: None,
        };
    }

    let render = match pollster::block_on(renderer.render_frame_stages_with_audio_waveforms(
        &parsed.snapshot,
        &sources,
        &audio_waveforms,
        &generated_gpu_sources,
        &content_revisions,
        &nv12_sources,
    )) {
        Ok(value) => value,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            return response_error(id, -32070, "Native WebGPU adapter is unavailable");
        }
        Err(error) => {
            return response_error(
                id,
                -32071,
                &format!("Native WebGPU render failed: {error:?}"),
            );
        }
    };

    let (session_id, frame_count, encoded_frame_byte_len) = {
        let Some(session) = state.encode_sessions.get_mut(&parsed.session_id) else {
            return response_error(id, -32052, "No active encode session");
        };
        let encoded_frame_byte_len = match write_rgba_frame_to_encoder(session, &render.frame) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32053, &message),
        };
        session.frame_count += 1;
        (
            session.session_id.clone(),
            session.frame_count,
            encoded_frame_byte_len,
        )
    };
    let nv12_zero_copy_media_ids: Vec<&str> =
        nv12_sources.keys().map(String::as_str).collect();

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "written": true,
            "writtenNativeFrame": true,
            "sessionId": session_id,
            "renderId": parsed.render_id,
            "renderPath": "webgpuSceneComposite",
            "nv12ZeroCopyMediaIds": nv12_zero_copy_media_ids,
            "frameIndex": parsed.frame_index,
            "timestampUs": parsed.timestamp_us,
            "encodedFrameByteLen": encoded_frame_byte_len,
            "frameCount": frame_count,
            "timings": {
                "setupMs": render.timings.setup.as_secs_f64() * 1000.0,
                "sourceUploadMs": render.timings.source_upload.as_secs_f64() * 1000.0,
                "renderMs": render.timings.render.as_secs_f64() * 1000.0,
                "readbackEncodeMs": render.timings.readback_encode.as_secs_f64() * 1000.0,
                "steadyStateMs": render.timings.steady_state.as_secs_f64() * 1000.0,
                "totalMs": render.timings.total.as_secs_f64() * 1000.0,
            },
        })),
        error: None,
    }
}

#[cfg(not(unix))]
pub(crate) fn handle_encode_write_native_frame(
    id: u64,
    _params: Value,
    _state: &mut BackendState,
) -> RpcResponse {
    response_error(
        id,
        -32070,
        "encode.writeNativeFrame requires POSIX shared memory support",
    )
}

#[cfg(unix)]
pub(crate) fn handle_native_render_shared_frame(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<NativeRenderSharedFrameParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid render.nativeSharedFrame params: {error}"),
            );
        }
    };

    if parsed.slot_count == 0 {
        return response_error(id, -32602, "slotCount must be greater than zero");
    }
    let sources =
        match collect_native_render_sources(
            &parsed.snapshot,
            &parsed.media,
            &parsed.sources,
            &mut state.source_frame_cache,
        ) {
            Ok(value) => value,
            Err(message) => {
                return response_error(id, native_render_source_error_code(&message), &message);
            }
        };
    let particle_sources =
        match collect_native_render_particle_sources(&parsed.snapshot, &parsed.media) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32602, &message),
        };
    let getcolor_sources =
        match collect_native_render_getcolor_sources(&parsed.media, &mut state.source_frame_cache) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32602, &message),
        };
    let hksy_sources = match collect_native_render_hksy_sources(&parsed.media) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32602, &message),
    };
    let simple_tube_sources = match collect_native_render_simple_tube_sources(&parsed.media) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32602, &message),
    };
    let shattered_sphere_sources =
        match collect_native_render_shattered_sphere_sources(&parsed.snapshot, &parsed.media) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32602, &message),
        };
    let shaking_polygon_sources =
        match collect_native_render_shaking_polygon_sources(&parsed.snapshot, &parsed.media) {
            Ok(value) => value,
            Err(message) => return response_error(id, -32602, &message),
        };
    let generated_gpu_sources = NativeGeneratedGpuSources {
        particles: particle_sources,
        getcolor: getcolor_sources,
        hksy: hksy_sources,
        simple_tubes: simple_tube_sources,
        shaking_polygons: shaking_polygon_sources,
        shattered_spheres: shattered_sphere_sources,
        ..NativeGeneratedGpuSources::default()
    };
    let audio_waveforms = match collect_native_render_audio_waveforms(&parsed.audio_waveforms) {
        Ok(value) => value,
        Err(message) => return response_error(id, -32602, &message),
    };
    // Phase 4c Stage 2: computed up front (before the CPU fast path below)
    // because that fast path must be skipped whenever a zero-copy NV12
    // source is available -- it operates purely on the CPU RGBA bridge
    // (`sources`), so letting it intercept the single-clip case that Stage 1
    // populates would mean the by-far-most-common real scene (one video
    // clip, no effects) never reaches the GPU compositor at all and Stage 2
    // would never engage for it. The GPU path now handles this case at
    // least as cheaply (see the perf comparison in
    // `progress/phase4c-inprocess-decode-integration.md`), so routing it
    // there instead is a strict improvement, not a regression for the CPU
    // fast path's original purpose.
    let nv12_sources = collect_native_render_nv12_sources(&parsed.sources, &state.decode_sessions);
    if !native_render_has_valid_input(
        parsed.snapshot.clips.len(),
        sources.len(),
        audio_waveforms.len(),
        nv12_sources.len(),
        !generated_gpu_sources.is_empty(),
    ) {
        return response_error(
            id,
            -32602,
            "sources, media, audioWaveforms, or NV12 decode sessions must include every active clip",
        );
    }

    if audio_waveforms.is_empty()
        && nv12_sources.is_empty()
        && generated_gpu_sources.is_empty()
    {
        match try_render_simple_video_frame_to_shared_ring(
            &parsed.snapshot,
            &parsed.media,
            &sources,
            parsed.width,
            parsed.height,
            &parsed.memory_id,
            parsed.slot_count,
            parsed.pts_frame,
        ) {
            Ok(Some(render)) => {
                let frame = render.shared_frame.clone();
                let slot_count = render.slot_count;
                let slot_byte_len = render.slot_byte_len;
                state
                    .native_render_outputs
                    .insert(parsed.memory_id.clone(), render.ring);

                return RpcResponse {
                    id,
                    ok: true,
                    result: Some(json!({
                        "rendered": true,
                        "renderPath": "cpuSimpleVideoComposite",
                        "renderId": parsed.render_id,
                        "memoryId": parsed.memory_id,
                        "slotCount": slot_count,
                        "slotByteLen": slot_byte_len,
                        "frame": frame,
                        // Always empty on this path: the CPU fast path only
                        // ever runs when `nv12_sources` was empty to begin
                        // with (see the guard above). Present for response
                        // shape consistency with the GPU composite path.
                        "nv12ZeroCopyMediaIds": Vec::<String>::new(),
                    })),
                    error: None,
                };
            }
            Ok(None) => {}
            Err(message) => {
                return response_error(
                    id,
                    -32071,
                    &format!("Native CPU simple video render failed: {message}"),
                );
            }
        }
    }

    let renderer = match get_or_create_native_wgpu_renderer(state, parsed.width, parsed.height) {
        Ok(value) => value,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            return response_error(id, -32070, "Native WebGPU adapter is unavailable");
        }
        Err(error) => {
            return response_error(
                id,
                -32071,
                &format!("Native WebGPU renderer setup failed: {error:?}"),
            );
        }
    };

    // Phase 3a: `render.nativeSharedFrame` はプレビュー中に毎フレーム呼ばれる
    // ホットパスそのもの。media_id ごとの内容世代（revision）を渡すことで、
    // ドラッグ中の transform-only な更新でも静止画・PSD・生成テキスト等の
    // GPU テクスチャ再アップロードを避ける。
    let content_revisions = collect_native_render_source_content_revisions(
        &parsed.snapshot,
        &parsed.media,
        &parsed.sources,
    );
    let render =
        match pollster::block_on(renderer.render_frame_to_shared_ring_with_audio_waveforms(
            &parsed.snapshot,
            &sources,
            &audio_waveforms,
            &generated_gpu_sources,
            &content_revisions,
            &nv12_sources,
            &parsed.memory_id,
            parsed.slot_count,
            parsed.pts_frame,
        )) {
            Ok(value) => value,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                return response_error(id, -32070, "Native WebGPU adapter is unavailable");
            }
            Err(error) => {
                return response_error(
                    id,
                    -32071,
                    &format!("Native WebGPU render failed: {error:?}"),
                );
            }
        };

    let frame = render.shared_frame.clone();
    let slot_count = render.slot_count;
    let slot_byte_len = render.slot_byte_len;
    state
        .native_render_outputs
        .insert(parsed.memory_id.clone(), render.ring);

    // Diagnostic (mirrors the existing `decodePath` field on
    // decode.requestFrame): which media_ids this render actually resolved
    // through the Phase 4c Stage 2 zero-copy NV12 path, so integration tests
    // and production traces can confirm the CPU bridge was skipped.
    let nv12_zero_copy_media_ids: Vec<&str> =
        nv12_sources.keys().map(String::as_str).collect();

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "rendered": true,
            "renderId": parsed.render_id,
            "memoryId": parsed.memory_id,
            "slotCount": slot_count,
            "slotByteLen": slot_byte_len,
            "frame": frame,
            "renderPath": "webgpuSceneComposite",
            "nv12ZeroCopyMediaIds": nv12_zero_copy_media_ids,
        })),
        error: None,
    }
}

#[cfg(not(unix))]
pub(crate) fn handle_native_render_shared_frame(
    id: u64,
    _params: Value,
    _state: &mut BackendState,
) -> RpcResponse {
    response_error(
        id,
        -32070,
        "render.nativeSharedFrame requires POSIX shared memory support",
    )
}

fn collect_native_render_audio_waveforms(
    waveforms: &[NativeRenderAudioWaveformSource],
) -> Result<Vec<NativeAudioWaveformInput>, String> {
    waveforms
        .iter()
        .map(|waveform| {
            let source = AudioWaveformSource::from_json(&waveform.source).map_err(|error| {
                format!("Invalid native render audio waveform source: {error:?}")
            })?;
            Ok(NativeAudioWaveformInput {
                media_id: waveform.media_id.clone(),
                source,
                samples: waveform.samples.clone(),
                sample_rate: waveform.sample_rate,
                width: waveform.width,
                height: waveform.height,
            })
        })
        .collect()
}

fn validate_resident_video_source_frames(
    requests: &[(&str, &str, u64)],
) -> Result<(), String> {
    let mut frames_by_media: HashMap<&str, (&str, u64)> = HashMap::new();
    for &(clip_id, media_id, source_frame) in requests {
        if let Some(&(existing_clip_id, existing_source_frame)) = frames_by_media.get(media_id) {
            if existing_source_frame != source_frame {
                return Err(format!(
                    "Resident NV12 source {media_id} is requested by {existing_clip_id} at frame \
                     {existing_source_frame} and by {clip_id} at frame {source_frame}; the native \
                     renderer must key video textures by clip id before this overlap is supported",
                ));
            }
        } else {
            frames_by_media.insert(media_id, (clip_id, source_frame));
        }
    }
    Ok(())
}

fn collect_native_render_shattered_sphere_sources(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
) -> Result<HashMap<String, NativeShatteredSphereSource>, String> {
    let mut sources = HashMap::new();
    for media in media_items
        .iter()
        .filter(|media| media.kind == MediaKind::GeneratedShatteredSphere)
    {
        let mut source_frames = snapshot
            .clips
            .iter()
            .filter(|clip| clip.media_id == media.id)
            .map(|clip| clip.source_frame);
        let source_frame = source_frames.next().unwrap_or(snapshot.frame_index);
        if source_frames.any(|candidate| candidate != source_frame) {
            return Err(format!(
                "Native render cannot use ShatteredSphere media {} at multiple source frames in one scene",
                media.id
            ));
        }
        let mut hasher = DefaultHasher::new();
        media.id.hash(&mut hasher);
        media.source.hash(&mut hasher);
        media.width.hash(&mut hasher);
        media.height.hash(&mut hasher);
        let descriptor = NativeShatteredSphereSource {
            source: media.source.clone(),
            width: media.width,
            height: media.height,
            source_frame,
            config_revision: hasher.finish(),
        };
        if sources.insert(media.id.clone(), descriptor).is_some() {
            return Err(format!(
                "Duplicate native render ShatteredSphere mediaId '{}'",
                media.id
            ));
        }
    }
    Ok(sources)
}

fn collect_native_render_particle_sources(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
) -> Result<HashMap<String, NativeParticleSource>, String> {
    let mut sources = HashMap::new();
    for media in media_items
        .iter()
        .filter(|media| media.kind == MediaKind::GeneratedParticle)
    {
        if media.width == 0 || media.height == 0 {
            return Err(format!(
                "GeneratedParticle media dimensions must be positive, got {}x{}",
                media.width, media.height
            ));
        }
        let mut source_frames = snapshot
            .clips
            .iter()
            .filter(|clip| clip.media_id == media.id)
            .map(|clip| clip.source_frame);
        let source_frame = source_frames.next().unwrap_or(snapshot.frame_index);
        if source_frames.any(|candidate| candidate != source_frame) {
            return Err(format!(
                "Native render cannot use Particle media {} at multiple source frames in one scene",
                media.id
            ));
        }
        let params = parse_generated_particle_source(&media.source).map_err(|message| {
            format!("Invalid GeneratedParticle media '{}': {message}", media.id)
        })?;
        let mut hasher = DefaultHasher::new();
        media.id.hash(&mut hasher);
        media.source.hash(&mut hasher);
        media.width.hash(&mut hasher);
        media.height.hash(&mut hasher);
        let descriptor = NativeParticleSource {
            params,
            width: media.width,
            height: media.height,
            source_frame,
            config_revision: hasher.finish(),
        };
        if sources.insert(media.id.clone(), descriptor).is_some() {
            return Err(format!(
                "Duplicate native render Particle mediaId '{}'",
                media.id
            ));
        }
    }
    Ok(sources)
}

fn collect_native_render_shaking_polygon_sources(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
) -> Result<HashMap<String, NativeShakingPolygonSource>, String> {
    let mut sources = HashMap::new();
    for media in media_items
        .iter()
        .filter(|media| media.kind == MediaKind::GeneratedShakingPolygon)
    {
        let mut source_frames = snapshot
            .clips
            .iter()
            .filter(|clip| clip.media_id == media.id)
            .map(|clip| clip.source_frame);
        let source_frame = source_frames.next().unwrap_or(snapshot.frame_index);
        if source_frames.any(|candidate| candidate != source_frame) {
            return Err(format!(
                "Native render cannot use ShakingPolygon media {} at multiple source frames in one scene",
                media.id
            ));
        }
        let mut hasher = DefaultHasher::new();
        media.id.hash(&mut hasher);
        media.source.hash(&mut hasher);
        media.width.hash(&mut hasher);
        media.height.hash(&mut hasher);
        source_frame.hash(&mut hasher);
        let descriptor = NativeShakingPolygonSource {
            source: media.source.clone(),
            width: media.width,
            height: media.height,
            source_frame,
            config_revision: hasher.finish(),
        };
        if sources.insert(media.id.clone(), descriptor).is_some() {
            return Err(format!(
                "Duplicate native render ShakingPolygon mediaId '{}'",
                media.id
            ));
        }
    }
    Ok(sources)
}

fn collect_native_render_getcolor_sources(
    media_items: &[SceneMediaReference],
    source_frame_cache: &mut SourceFrameCache,
) -> Result<HashMap<String, NativeGetColorSource>, String> {
    let mut sources = HashMap::new();
    for media in media_items
        .iter()
        .filter(|media| media.kind == MediaKind::GeneratedGetColorDots)
    {
        let (sample_frame, config_revision) =
            load_cached_getcolor_sample_frame(media, source_frame_cache)?;
        let descriptor = NativeGetColorSource {
            source: media.source.clone(),
            sample_frame,
            width: media.width,
            height: media.height,
            config_revision,
        };
        if sources.insert(media.id.clone(), descriptor).is_some() {
            return Err(format!(
                "Duplicate native render GetColor mediaId '{}'",
                media.id
            ));
        }
    }
    Ok(sources)
}

fn collect_native_render_hksy_sources(
    media_items: &[SceneMediaReference],
) -> Result<HashMap<String, NativeHksySource>, String> {
    let mut sources = HashMap::new();
    for media in media_items
        .iter()
        .filter(|media| media.kind == MediaKind::GeneratedHksyCheckerGrid)
    {
        let mut hasher = DefaultHasher::new();
        media.id.hash(&mut hasher);
        media.source.hash(&mut hasher);
        media.width.hash(&mut hasher);
        media.height.hash(&mut hasher);
        let descriptor = NativeHksySource {
            source: media.source.clone(),
            width: media.width,
            height: media.height,
            config_revision: hasher.finish(),
        };
        if sources.insert(media.id.clone(), descriptor).is_some() {
            return Err(format!(
                "Duplicate native render HKSY mediaId '{}'",
                media.id
            ));
        }
    }
    Ok(sources)
}

fn collect_native_render_simple_tube_sources(
    media_items: &[SceneMediaReference],
) -> Result<HashMap<String, NativeSimpleTubeSource>, String> {
    let mut sources = HashMap::new();
    for media in media_items
        .iter()
        .filter(|media| media.kind == MediaKind::GeneratedSimpleTube)
    {
        let mut hasher = DefaultHasher::new();
        media.id.hash(&mut hasher);
        media.source.hash(&mut hasher);
        media.width.hash(&mut hasher);
        media.height.hash(&mut hasher);
        let descriptor = NativeSimpleTubeSource {
            source: media.source.clone(),
            width: media.width,
            height: media.height,
            config_revision: hasher.finish(),
        };
        if sources.insert(media.id.clone(), descriptor).is_some() {
            return Err(format!(
                "Duplicate native render SimpleTube mediaId '{}'",
                media.id
            ));
        }
    }
    Ok(sources)
}

fn native_render_has_valid_input(
    active_clip_count: usize,
    source_count: usize,
    audio_waveform_count: usize,
    nv12_source_count: usize,
    has_generated_gpu_sources: bool,
) -> bool {
    active_clip_count == 0
        || source_count > 0
        || audio_waveform_count > 0
        || nv12_source_count > 0
        || has_generated_gpu_sources
}

#[cfg(target_os = "macos")]
fn collect_resident_video_nv12_sources(
    encode_session_id: &str,
    scene_id: &str,
    revision: u64,
    requests: &[VideoFrameDecodeRequest],
    state: &mut BackendState,
) -> Result<HashMap<String, uxfd_rust_core::Nv12IoSurfaceRef>, String> {
    let mut sources = HashMap::new();
    for request in requests {
        if sources.contains_key(&request.media_id) {
            continue;
        }
        let decoder_key = resident_video_decoder_key(
            encode_session_id,
            scene_id,
            revision,
            &request.media_id,
        );
        if !state.resident_video_decoders.contains_key(&decoder_key) {
            let decoder = InProcessDecodeSession::open_nv12_only(
                Path::new(&request.source),
                request.width,
                request.height,
            )
            .map_err(|error| {
                format!(
                    "Failed to open resident NV12 decoder for {}: {error}",
                    request.media_id
                )
            })?;
            state.resident_video_decoders.insert(decoder_key.clone(), decoder);
        }
        let target_pts_seconds = request.source_frame as f64
            * request.source_rate.denominator as f64
            / request.source_rate.numerator as f64;
        let frame = state
            .resident_video_decoders
            .get(&decoder_key)
            .expect("resident decoder must exist after insertion")
            .request_nv12_frame(target_pts_seconds)
            .map_err(|error| {
                format!(
                    "Failed to decode resident NV12 frame for {}: {error}",
                    request.media_id
                )
            })?;
        sources.insert(request.media_id.clone(), frame.source);
    }
    Ok(sources)
}

#[cfg(not(target_os = "macos"))]
fn collect_resident_video_nv12_sources(
    _encode_session_id: &str,
    _scene_id: &str,
    _revision: u64,
    requests: &[VideoFrameDecodeRequest],
    _state: &mut BackendState,
) -> Result<HashMap<String, uxfd_rust_core::Nv12IoSurfaceRef>, String> {
    if requests.is_empty() {
        Ok(HashMap::new())
    } else {
        Err("Resident NV12 decode is only available on macOS".to_string())
    }
}

fn resident_video_decoder_key(
    encode_session_id: &str,
    scene_id: &str,
    revision: u64,
    media_id: &str,
) -> String {
    format!("{encode_session_id}\0{scene_id}\0{revision}\0{media_id}")
}

pub(crate) fn native_render_source_error_code(message: &str) -> i64 {
    if message.starts_with("Failed to attach native render source shared memory")
        || message.starts_with("Failed to read native render source frame")
        || message.starts_with("Failed to release native render source frame")
    {
        -32072
    } else {
        -32602
    }
}

pub(crate) fn get_or_create_native_wgpu_renderer(
    state: &mut BackendState,
    width: u32,
    height: u32,
) -> Result<&NativeWgpuRenderer, NativeWgpuRenderError> {
    match state.native_wgpu_renderer.as_mut() {
        Some(renderer) if renderer.width() == width && renderer.height() == height => {}
        Some(renderer) => {
            // Phase 3a: 単なる出力サイズ変更（ペインリサイズ）ではレンダラごと
            // （device・pipeline・per-media GPU テクスチャキャッシュを含む全体）
            // を破棄・再構築せず、出力サイズ依存リソース（output_texture／
            // readback_buffer）だけを作り直す。旧実装は毎回フルリビルドしており、
            // リサイズのたびに全クリップの GPU リソースを失っていた。
            renderer.resize_output(width, height)?;
        }
        None => {
            state.native_wgpu_renderer =
                Some(pollster::block_on(NativeWgpuRenderer::new(width, height))?);
        }
    }

    Ok(state
        .native_wgpu_renderer
        .as_ref()
        .expect("native WGPU renderer should be present after creation"))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn resident_video_sources_reject_one_media_at_conflicting_source_frames() {
        let requests = [
            ("clip-a", "media-video", 10_u64),
            ("clip-b", "media-video", 11_u64),
        ];

        let error = validate_resident_video_source_frames(&requests)
            .expect_err("one media id cannot identify two different NV12 frames");

        assert!(error.contains("media-video"), "{error}");
        assert!(error.contains("clip-a"), "{error}");
        assert!(error.contains("clip-b"), "{error}");
    }

    #[test]
    fn resident_video_sources_allow_reusing_the_same_decoded_frame() {
        let requests = [
            ("clip-a", "media-video", 10_u64),
            ("clip-b", "media-video", 10_u64),
        ];

        validate_resident_video_source_frames(&requests)
            .expect("matching source frames may share one resident NV12 surface");
    }

    #[test]
    fn native_render_allows_an_empty_snapshot_as_a_transparent_frame() {
        assert!(native_render_has_valid_input(0, 0, 0, 0, false));
        assert!(!native_render_has_valid_input(1, 0, 0, 0, false));
        assert!(native_render_has_valid_input(1, 0, 0, 1, false));
        assert!(native_render_has_valid_input(1, 0, 0, 0, true));
    }

    #[test]
    fn shattered_sphere_is_collected_as_gpu_descriptor_without_cpu_rgba() {
        let snapshot = uxfd_rust_core::SceneSnapshot {
            frame_index: 20,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "shattered-sphere-clip".to_string(),
                track_id: "track".to_string(),
                media_id: "shattered-sphere-media".to_string(),
                source_frame: 20,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let media = vec![uxfd_rust_core::SceneMediaReference {
            id: "shattered-sphere-media".to_string(),
            kind: uxfd_rust_core::MediaKind::GeneratedShatteredSphere,
            source: r##"{"generator":"shattered-sphere-93","fracture_amount":100,"delay":20,"radius":24,"limit_distance":40,"thickness":10,"fragment_size":8,"random_shape":80,"speed":100,"impact":80,"gravity":[0,100,0],"spin":100,"direction_diffusion":90,"colour":"#80d8ff","seed":93}"##.to_string(),
            width: 64,
            height: 48,
            source_rate: None,
            active_layer_ids: Vec::new(),
        }];

        let sources = collect_native_render_shattered_sphere_sources(&snapshot, &media)
            .expect("ShatteredSphere GPU descriptor collection must succeed");
        let source = sources
            .get("shattered-sphere-media")
            .expect("descriptor must be collected");
        assert_eq!(source.source_frame, 20);
        assert_eq!(source.width, 64);
        assert_eq!(source.height, 48);
    }

    #[test]
    fn getcolor_is_collected_as_gpu_descriptor_without_cpu_rgba() {
        let snapshot = uxfd_rust_core::SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "getcolor-clip".to_string(),
                track_id: "track".to_string(),
                media_id: "getcolor-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let media = vec![uxfd_rust_core::SceneMediaReference {
            id: "getcolor-media".to_string(),
            kind: uxfd_rust_core::MediaKind::GeneratedGetColorDots,
            source: r##"{"generator":"getcolor-v2r-dot-field","columns":16,"rows":9,"dot_size":12,"size_influence":0.65,"luminance_influence":0.7,"hue_shift_degrees":0,"alternate_rows":true,"foreground_colour":"#ffffff","secondary_colour":"#36c2ff","background_colour":"#000000","source_image":null,"seed":93}"##.to_string(),
            width: 320,
            height: 180,
            source_rate: None,
            active_layer_ids: Vec::new(),
        }];
        let mut cache = crate::state::SourceFrameCache::default();

        let rgba_sources =
            collect_native_render_sources(&snapshot, &media, &[], &mut cache)
                .expect("GetColor CPU source collection must succeed");
        assert!(
            rgba_sources.is_empty(),
            "GetColor must not allocate a completed CPU RGBA source"
        );

        let sources = collect_native_render_getcolor_sources(&media, &mut cache)
            .expect("GetColor GPU descriptor collection must succeed");
        let source = sources
            .get("getcolor-media")
            .expect("descriptor must be collected");
        assert_eq!(source.width, 320);
        assert_eq!(source.height, 180);
        assert!(source.sample_frame.is_none());
        assert_ne!(source.config_revision, 0);
    }

    #[test]
    fn hksy_is_collected_as_gpu_descriptor_without_cpu_rgba() {
        let snapshot = uxfd_rust_core::SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "hksy-clip".to_string(),
                track_id: "track".to_string(),
                media_id: "hksy-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let media = vec![uxfd_rust_core::SceneMediaReference {
            id: "hksy-media".to_string(),
            kind: uxfd_rust_core::MediaKind::GeneratedHksyCheckerGrid,
            source: r##"{"generator":"hksy-checker-grid","pattern":"checker-grid","cell_size":8,"line_width":2,"checker_enabled":true,"grid_enabled":true,"foreground_colour":"#ff0000","secondary_colour":"#00ff00","background_colour":"#0000ff","palette_colours":null,"separate_interval":null,"separate_line_width":null,"anchor_points":null,"round_caps":null,"max_join_distance":null}"##.to_string(),
            width: 320,
            height: 180,
            source_rate: None,
            active_layer_ids: Vec::new(),
        }];
        let mut cache = crate::state::SourceFrameCache::default();

        let rgba_sources =
            collect_native_render_sources(&snapshot, &media, &[], &mut cache)
                .expect("HKSY CPU source collection must succeed");
        assert!(
            rgba_sources.is_empty(),
            "HKSY must not allocate a completed CPU RGBA source"
        );

        let sources =
            collect_native_render_hksy_sources(&media).expect("HKSY descriptor collection succeeds");
        let source = sources.get("hksy-media").expect("descriptor must be collected");
        assert_eq!(source.width, 320);
        assert_eq!(source.height, 180);
        assert_ne!(source.config_revision, 0);
    }

    #[test]
    fn simple_tube_is_collected_as_gpu_descriptor_without_cpu_rgba() {
        let snapshot = uxfd_rust_core::SceneSnapshot {
            frame_index: 0,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "simple-tube-clip".to_string(),
                track_id: "track".to_string(),
                media_id: "simple-tube-media".to_string(),
                source_frame: 0,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let media = vec![uxfd_rust_core::SceneMediaReference {
            id: "simple-tube-media".to_string(),
            kind: uxfd_rust_core::MediaKind::GeneratedSimpleTube,
            source: r##"{"generator":"simple-tube-93","radius":28,"depth":32,"segments":12,"rings":6,"twist_degrees":45,"random_amount":0,"stroke_width":2,"colour":"#ff0000","secondary_colour":"#00ff00","colour_pattern":"ring","fog_strength":0,"fog_colour":"#ffffff","seed":93,"torus":false}"##.to_string(),
            width: 320,
            height: 180,
            source_rate: None,
            active_layer_ids: Vec::new(),
        }];
        let mut cache = crate::state::SourceFrameCache::default();

        let rgba_sources =
            collect_native_render_sources(&snapshot, &media, &[], &mut cache)
                .expect("SimpleTube CPU source collection must succeed");
        assert!(
            rgba_sources.is_empty(),
            "SimpleTube must not allocate a completed CPU RGBA source"
        );

        let sources = collect_native_render_simple_tube_sources(&media)
            .expect("SimpleTube descriptor collection succeeds");
        let source = sources
            .get("simple-tube-media")
            .expect("descriptor must be collected");
        assert_eq!(source.width, 320);
        assert_eq!(source.height, 180);
        assert_ne!(source.config_revision, 0);
    }

    #[test]
    fn particle_is_collected_as_animated_gpu_descriptor_without_cpu_rgba() {
        let build_snapshot = |source_frames: &[u64]| uxfd_rust_core::SceneSnapshot {
            frame_index: source_frames.first().copied().unwrap_or(0),
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: source_frames
                .iter()
                .enumerate()
                .map(|(index, source_frame)| uxfd_rust_core::EvaluatedClip {
                    clip_id: format!("particle-clip-{index}"),
                    track_id: "track".to_string(),
                    media_id: "particle-media".to_string(),
                    source_frame: *source_frame,
                    z_index: index as u32,
                    transform: uxfd_rust_core::Transform::identity(),
                    opacity: 1.0,
                    effects: Vec::new(),
                })
                .collect(),
        };
        let media = vec![uxfd_rust_core::SceneMediaReference {
            id: "particle-media".to_string(),
            kind: uxfd_rust_core::MediaKind::GeneratedParticle,
            source: r##"{"generator":"standard-particle","seed":93,"particle_count":16,"spread":180,"speed":120,"size":6,"colour":"#80d8ff","lifetime_seconds":1.5}"##.to_string(),
            width: 320,
            height: 180,
            source_rate: None,
            active_layer_ids: Vec::new(),
        }];
        let first_snapshot = build_snapshot(&[0]);
        let later_snapshot = build_snapshot(&[30]);
        let mut cache = crate::state::SourceFrameCache::default();

        let rgba_sources =
            collect_native_render_sources(&first_snapshot, &media, &[], &mut cache)
                .expect("Particle CPU source collection must succeed");
        assert!(
            rgba_sources.is_empty(),
            "Particle must not allocate a completed CPU RGBA source"
        );

        let first = collect_native_render_particle_sources(&first_snapshot, &media)
            .expect("first Particle descriptor collection succeeds");
        let later = collect_native_render_particle_sources(&later_snapshot, &media)
            .expect("later Particle descriptor collection succeeds");
        let first = first
            .get("particle-media")
            .expect("first descriptor must be collected");
        let later = later
            .get("particle-media")
            .expect("later descriptor must be collected");
        assert_eq!(first.source_frame, 0);
        assert_eq!(later.source_frame, 30);
        assert_eq!(first.config_revision, later.config_revision);
        assert_eq!(first.width, 320);
        assert_eq!(first.height, 180);

        let error = collect_native_render_particle_sources(&build_snapshot(&[0, 30]), &media)
            .expect_err("one particle media at conflicting frames must be rejected");
        assert!(error.contains("multiple source frames"));
    }

    #[test]
    fn focus_lines_is_collected_with_shared_bucket_revision_without_cpu_rgba() {
        let build_snapshot = |source_frame| uxfd_rust_core::SceneSnapshot {
            frame_index: source_frame,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "focus-lines-clip".to_string(),
                track_id: "track".to_string(),
                media_id: "focus-lines-media".to_string(),
                source_frame,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let build_media = |keyframe_interval| {
            vec![uxfd_rust_core::SceneMediaReference {
                id: "focus-lines-media".to_string(),
                kind: uxfd_rust_core::MediaKind::GeneratedFocusLinesPlus,
                source: format!(
                    r##"{{"generator":"focus-lines-plus","ray_width":2.5,"gap":6,"centre_radius":8,"rotation_degrees":15,"centre_x":160,"centre_y":90,"centre_jitter_percent":20,"seed":93,"keyframe_interval":{keyframe_interval},"line_colour":"#ff8000"}}"##
                ),
                width: 320,
                height: 180,
                source_rate: None,
                active_layer_ids: Vec::new(),
            }]
        };
        let static_media = build_media(0);
        let mut cache = crate::state::SourceFrameCache::default();

        let rgba_sources =
            collect_native_render_sources(&build_snapshot(0), &static_media, &[], &mut cache)
                .expect("FocusLinesPlus CPU source collection must succeed");
        assert!(
            rgba_sources.is_empty(),
            "FocusLinesPlus must not allocate a completed CPU RGBA source"
        );

        let first = collect_native_render_focus_lines_sources(&build_snapshot(0), &static_media)
            .expect("first static descriptor collection succeeds");
        let later = collect_native_render_focus_lines_sources(&build_snapshot(60), &static_media)
            .expect("later static descriptor collection succeeds");
        assert_eq!(
            first["focus-lines-media"].config_revision,
            later["focus-lines-media"].config_revision
        );
        assert_eq!(later["focus-lines-media"].source_frame, 60);

        let bucketed_media = build_media(10);
        let bucket_nine =
            collect_native_render_focus_lines_sources(&build_snapshot(9), &bucketed_media)
                .expect("bucket nine descriptor collection succeeds");
        let bucket_ten =
            collect_native_render_focus_lines_sources(&build_snapshot(10), &bucketed_media)
                .expect("bucket ten descriptor collection succeeds");
        assert_ne!(
            bucket_nine["focus-lines-media"].config_revision,
            bucket_ten["focus-lines-media"].config_revision
        );
    }

    #[test]
    fn shaking_polygon_is_collected_as_animated_gpu_descriptor_without_cpu_rgba() {
        let build_snapshot = |source_frame| uxfd_rust_core::SceneSnapshot {
            frame_index: source_frame,
            colour: uxfd_rust_core::ColourPipeline::rec709_sdr_linear(),
            clips: vec![uxfd_rust_core::EvaluatedClip {
                clip_id: "shaking-polygon-clip".to_string(),
                track_id: "track".to_string(),
                media_id: "shaking-polygon-media".to_string(),
                source_frame,
                z_index: 0,
                transform: uxfd_rust_core::Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let media = vec![uxfd_rust_core::SceneMediaReference {
            id: "shaking-polygon-media".to_string(),
            kind: uxfd_rust_core::MediaKind::GeneratedShakingPolygon,
            source: r##"{"generator":"shaking-polygon","line_width":3,"vertex_count":5,"fixed_diameter":36,"vertical_distortion_percent":10,"repeat_count":3,"repeat_frequency":2,"fill":true,"jitter_range":4,"jitter_interval":2,"stepped":false,"colour":"#ff8000","seed":93}"##.to_string(),
            width: 64,
            height: 48,
            source_rate: None,
            active_layer_ids: Vec::new(),
        }];

        let first = collect_native_render_shaking_polygon_sources(&build_snapshot(0), &media)
            .expect("first ShakingPolygon GPU descriptor collection must succeed");
        let next = collect_native_render_shaking_polygon_sources(&build_snapshot(1), &media)
            .expect("next ShakingPolygon GPU descriptor collection must succeed");
        let first = first
            .get("shaking-polygon-media")
            .expect("first descriptor must be collected");
        let next = next
            .get("shaking-polygon-media")
            .expect("next descriptor must be collected");
        assert_eq!(first.source_frame, 0);
        assert_eq!(next.source_frame, 1);
        assert_ne!(
            first.config_revision, next.config_revision,
            "animated source frames must invalidate the ShakingPolygon GPU texture"
        );
    }

    #[test]
    fn get_or_create_native_wgpu_renderer_resizes_in_place_and_reports_new_dimensions() {
        // タスク4: 出力サイズが変わっただけならレンダラごと破棄・再構築せず、
        // `resize_output` 経由で出力サイズ依存リソースだけを作り直すこと。
        // ここでは（内部の GPU リソース識別を外から直接観測できないため）
        // resize が panic/error せずに完走し、その後の呼び出しで正しい新しい
        // サイズが一貫して返ることを固定する。per-media テクスチャキャッシュが
        // 実際にリサイズをまたいで生き残ることは native-wgpu-renderer クレート
        // 側の `resize_output_keeps_media_texture_cache_alive_and_renders_are_correct`
        // で hit/miss カウンタにより直接検証している。
        let mut state = BackendState::default();

        let first = match get_or_create_native_wgpu_renderer(&mut state, 4, 4) {
            Ok(renderer) => {
                assert_eq!((renderer.width(), renderer.height()), (4, 4));
                true
            }
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!(
                    "skipping get_or_create_native_wgpu_renderer resize test: \
                     no GPU adapter available"
                );
                false
            }
            Err(error) => panic!("renderer creation failed: {error:?}"),
        };
        if !first {
            return;
        }

        let resized = get_or_create_native_wgpu_renderer(&mut state, 8, 6)
            .expect("resizing to a larger output within adapter limits must succeed");
        assert_eq!((resized.width(), resized.height()), (8, 6));

        // 同じサイズを重ねて渡した場合は resize すら発生しない（no-op）。
        let unchanged = get_or_create_native_wgpu_renderer(&mut state, 8, 6)
            .expect("repeating the same size must be a no-op success");
        assert_eq!((unchanged.width(), unchanged.height()), (8, 6));

        // シュリンクも同じ経路で扱えること。
        let shrunk = get_or_create_native_wgpu_renderer(&mut state, 2, 2)
            .expect("shrinking must also succeed via resize_output");
        assert_eq!((shrunk.width(), shrunk.height()), (2, 2));
    }
}
