mod cpu_simple_video;
pub(crate) mod decode;
mod encode;
mod fonts;
mod frames;
mod generated;
mod inprocess_decode;
mod media;
mod native_render;
mod native_shared;
mod params;
mod proxy;
mod psd_fast;
mod rpc;
mod rpc_dispatch;
mod sessions;
mod source_frames;
mod state;
mod transcode;

#[cfg(test)]
use generated::*;
use rpc::{RpcError, RpcRequest, RpcResponse};
use rpc_dispatch::handle_request;
pub(crate) use source_frames::{
    collect_native_render_source_content_revisions, collect_native_render_sources,
    is_jpeg_source, is_psd_source, local_media_source_path,
};
use state::BackendState;
use std::io::{self, BufRead, Write};
#[cfg(test)]
use uxfd_rust_core::{MediaKind, SceneMediaReference};

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    let mut state = BackendState::default();

    for line_result in stdin.lock().lines() {
        let line = match line_result {
            Ok(value) => value,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let parsed = serde_json::from_str::<RpcRequest>(&line);
        let response = match parsed {
            Ok(request) => handle_request(request, &mut state),
            Err(error) => RpcResponse {
                id: 0,
                ok: false,
                result: None,
                error: Some(RpcError {
                    code: -32700,
                    message: format!("Invalid JSON: {error}"),
                }),
            },
        };

        let serialised = match serde_json::to_string(&response) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if writeln!(stdout, "{serialised}").is_err() {
            break;
        }

        if stdout.flush().is_err() {
            break;
        }
    }
    for (_, mut session) in state.encode_sessions.drain() {
        let _ = session.stdin.flush();
        drop(session.stdin);
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
}

#[cfg(test)]
mod generated_frame_tests;
