//! macOS 専用: IOSurface の生 FFI 宣言。
//!
//! `io-surface` crate（crates.io）は採用しない: `core-foundation` 0.10 系に
//! 依存しており、wgpu-hal 経由で既にリンクされる `metal` クレート（`core-graphics-types`
//! 経由で `core-foundation` 0.9 系を要求）と重複してしまう
//! （progress/phase4b-nv12-iosurface-gpu-import.md 参照）。ここでは Metal
//! テクスチャ import に必要な最小限の関数だけを自前で宣言し、`objc`/`metal`
//! クレート（いずれも wgpu-hal と同一バージョン）とだけリンクする。
#![allow(dead_code)]

use std::os::raw::c_void;

pub(crate) type IOSurfaceRef = *mut c_void;
pub(crate) type IOSurfaceId = u32;

#[link(name = "IOSurface", kind = "framework")]
extern "C" {
    /// グローバル ID から IOSurface を解決する。戻り値は create rule
    /// （呼び出し側が `CFRelease` する責任を持つ）。
    pub(crate) fn IOSurfaceLookup(csid: IOSurfaceId) -> IOSurfaceRef;
    pub(crate) fn IOSurfaceGetID(buffer: IOSurfaceRef) -> IOSurfaceId;
    pub(crate) fn IOSurfaceGetWidth(buffer: IOSurfaceRef) -> usize;
    pub(crate) fn IOSurfaceGetHeight(buffer: IOSurfaceRef) -> usize;
    pub(crate) fn IOSurfaceGetPlaneCount(buffer: IOSurfaceRef) -> usize;
    pub(crate) fn IOSurfaceGetWidthOfPlane(buffer: IOSurfaceRef, plane: usize) -> usize;
    pub(crate) fn IOSurfaceGetHeightOfPlane(buffer: IOSurfaceRef, plane: usize) -> usize;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    pub(crate) fn CFRelease(cf: *mut c_void);
}
