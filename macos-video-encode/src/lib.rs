//! macOS の IOSurface-backed VideoToolbox encode 境界。

#[cfg(target_os = "macos")]
mod macos {
    use std::fmt;
    use std::path::Path;
    use std::ptr::NonNull;
    use std::time::{Duration, Instant};

    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_av_foundation::{
        AVAssetWriter, AVAssetWriterInput, AVAssetWriterInputPixelBufferAdaptor, AVFileTypeMPEG4,
        AVMediaTypeVideo, AVVideoCodecKey, AVVideoCodecTypeH264, AVVideoHeightKey, AVVideoWidthKey,
    };
    use objc2_core_foundation::{CFDictionary, CFNumber, CFRetained, CFString, CFType};
    use objc2_core_media::CMTime;
    use objc2_core_video::{
        kCVPixelBufferHeightKey, kCVPixelBufferIOSurfacePropertiesKey,
        kCVPixelBufferPixelFormatTypeKey, kCVPixelBufferWidthKey, kCVPixelFormatType_32BGRA,
        CVPixelBuffer, CVPixelBufferGetIOSurface, CVPixelBufferPool,
    };
    use objc2_foundation::{NSDictionary, NSString, NSURL};

    #[derive(Debug)]
    pub enum EncodeError {
        MissingFrameworkConstant(&'static str),
        WriterCreation(String),
        InputRejected,
        StartFailed(String),
        PixelBufferPoolUnavailable,
        PixelBufferAllocation(i32),
        MissingIoSurface,
        BackpressureTimeout,
        AppendFailed(String),
        FinishFailed(String),
        InvalidDimensions,
        OutputPathUnwritable(String),
    }

    impl fmt::Display for EncodeError {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(formatter, "{self:?}")
        }
    }

    impl std::error::Error for EncodeError {}

    pub struct EncodeFrame {
        pixel_buffer: CFRetained<CVPixelBuffer>,
        surface_id: u32,
        width: u32,
        height: u32,
    }

    unsafe impl Send for EncodeFrame {}

    impl EncodeFrame {
        pub fn surface_id(&self) -> u32 {
            self.surface_id
        }

        pub fn width(&self) -> u32 {
            self.width
        }

        pub fn height(&self) -> u32 {
            self.height
        }
    }

    pub struct VideoEncodeSession {
        writer: Retained<AVAssetWriter>,
        input: Retained<AVAssetWriterInput>,
        adaptor: Retained<AVAssetWriterInputPixelBufferAdaptor>,
        width: u32,
        height: u32,
        fps: u32,
        finished: bool,
    }

    unsafe impl Send for VideoEncodeSession {}

    impl VideoEncodeSession {
        pub fn start(
            output_path: &Path,
            width: u32,
            height: u32,
            fps: u32,
        ) -> Result<Self, EncodeError> {
            if width == 0 || height == 0 || fps == 0 {
                return Err(EncodeError::InvalidDimensions);
            }

            if let Err(error) = std::fs::remove_file(output_path) {
                if error.kind() != std::io::ErrorKind::NotFound {
                    return Err(EncodeError::OutputPathUnwritable(error.to_string()));
                }
            }

            let path = NSString::from_str(&output_path.to_string_lossy());
            let url = NSURL::fileURLWithPath(&path);
            let file_type = unsafe { AVFileTypeMPEG4 }
                .ok_or(EncodeError::MissingFrameworkConstant("AVFileTypeMPEG4"))?;
            let writer = unsafe { AVAssetWriter::assetWriterWithURL_fileType_error(&url, file_type) }
                .map_err(|error| EncodeError::WriterCreation(error.localizedDescription().to_string()))?;

            let media_type = unsafe { AVMediaTypeVideo }
                .ok_or(EncodeError::MissingFrameworkConstant("AVMediaTypeVideo"))?;
            let settings = build_video_settings(width, height)?;
            let input = unsafe {
                AVAssetWriterInput::assetWriterInputWithMediaType_outputSettings(
                    media_type,
                    Some(as_ns_dictionary(&settings)),
                )
            };
            let pixel_attributes = build_pixel_buffer_attributes(width, height);
            let adaptor = unsafe {
                AVAssetWriterInputPixelBufferAdaptor::
                    assetWriterInputPixelBufferAdaptorWithAssetWriterInput_sourcePixelBufferAttributes(
                        &input,
                        Some(as_ns_dictionary(&pixel_attributes)),
                    )
            };

            if !unsafe { writer.canAddInput(&input) } {
                let _ = std::fs::remove_file(output_path);
                return Err(EncodeError::InputRejected);
            }
            unsafe { writer.addInput(&input) };
            if !unsafe { writer.startWriting() } {
                let _ = std::fs::remove_file(output_path);
                return Err(EncodeError::StartFailed(writer_error(&writer)));
            }
            unsafe { writer.startSessionAtSourceTime(CMTime::new(0, fps as i32)) };

            Ok(Self {
                writer,
                input,
                adaptor,
                width,
                height,
                fps,
                finished: false,
            })
        }

        pub fn acquire_frame(&self) -> Result<EncodeFrame, EncodeError> {
            let pool = unsafe { self.adaptor.pixelBufferPool() }
                .ok_or(EncodeError::PixelBufferPoolUnavailable)?;
            let mut raw_pixel_buffer: *mut CVPixelBuffer = std::ptr::null_mut();
            let output = NonNull::from(&mut raw_pixel_buffer);
            let status =
                unsafe { CVPixelBufferPool::create_pixel_buffer(None, &pool, output) };
            if status != 0 {
                return Err(EncodeError::PixelBufferAllocation(status));
            }
            let pixel_buffer = unsafe {
                CFRetained::from_raw(
                    NonNull::new(raw_pixel_buffer)
                        .ok_or(EncodeError::PixelBufferAllocation(-1))?,
                )
            };
            let surface = CVPixelBufferGetIOSurface(Some(&pixel_buffer))
                .ok_or(EncodeError::MissingIoSurface)?;

            Ok(EncodeFrame {
                pixel_buffer,
                surface_id: surface.id(),
                width: self.width,
                height: self.height,
            })
        }

        pub fn append_frame(
            &mut self,
            frame: EncodeFrame,
            frame_index: u64,
        ) -> Result<(), EncodeError> {
            let deadline = Instant::now() + Duration::from_secs(5);
            while !unsafe { self.input.isReadyForMoreMediaData() } {
                if Instant::now() >= deadline {
                    return Err(EncodeError::BackpressureTimeout);
                }
                std::thread::yield_now();
            }
            let presentation_time =
                unsafe { CMTime::new(frame_index as i64, self.fps as i32) };
            if !unsafe {
                self.adaptor.appendPixelBuffer_withPresentationTime(
                    &frame.pixel_buffer,
                    presentation_time,
                )
            } {
                return Err(EncodeError::AppendFailed(writer_error(&self.writer)));
            }
            Ok(())
        }

        pub fn finish(mut self) -> Result<(), EncodeError> {
            unsafe { self.input.markAsFinished() };
            #[allow(deprecated)]
            let succeeded = unsafe { self.writer.finishWriting() };
            if !succeeded {
                return Err(EncodeError::FinishFailed(writer_error(&self.writer)));
            }
            self.finished = true;
            Ok(())
        }
    }

    impl Drop for VideoEncodeSession {
        fn drop(&mut self) {
            if !self.finished {
                unsafe { self.writer.cancelWriting() };
            }
        }
    }

    fn build_video_settings(
        width: u32,
        height: u32,
    ) -> Result<CFRetained<CFDictionary<CFString, CFType>>, EncodeError> {
        let codec_key = unsafe { AVVideoCodecKey }
            .ok_or(EncodeError::MissingFrameworkConstant("AVVideoCodecKey"))?;
        let width_key = unsafe { AVVideoWidthKey }
            .ok_or(EncodeError::MissingFrameworkConstant("AVVideoWidthKey"))?;
        let height_key = unsafe { AVVideoHeightKey }
            .ok_or(EncodeError::MissingFrameworkConstant("AVVideoHeightKey"))?;
        let codec = unsafe { AVVideoCodecTypeH264 }
            .ok_or(EncodeError::MissingFrameworkConstant("AVVideoCodecTypeH264"))?;
        let width_number = CFNumber::new_i32(width as i32);
        let height_number = CFNumber::new_i32(height as i32);
        let keys = [
            as_cf_string(codec_key),
            as_cf_string(width_key),
            as_cf_string(height_key),
        ];
        let values: [&CFType; 3] = [
            as_cf_type(as_cf_string(codec)),
            width_number.as_ref(),
            height_number.as_ref(),
        ];
        Ok(CFDictionary::from_slices(&keys, &values))
    }

    fn build_pixel_buffer_attributes(
        width: u32,
        height: u32,
    ) -> CFRetained<CFDictionary<CFString, CFType>> {
        let format = CFNumber::new_i32(kCVPixelFormatType_32BGRA as i32);
        let width = CFNumber::new_i32(width as i32);
        let height = CFNumber::new_i32(height as i32);
        let iosurface_properties: CFRetained<CFDictionary<CFString, CFType>> =
            CFDictionary::empty();
        let keys = unsafe {
            [
                kCVPixelBufferPixelFormatTypeKey,
                kCVPixelBufferWidthKey,
                kCVPixelBufferHeightKey,
                kCVPixelBufferIOSurfacePropertiesKey,
            ]
        };
        let values: [&CFType; 4] = [
            format.as_ref(),
            width.as_ref(),
            height.as_ref(),
            iosurface_properties.as_ref(),
        ];
        CFDictionary::from_slices(&keys, &values)
    }

    fn as_ns_dictionary(
        dictionary: &CFDictionary<CFString, CFType>,
    ) -> &NSDictionary<NSString, AnyObject> {
        let dictionary: &NSDictionary<CFString, CFType> = dictionary.as_ref();
        unsafe { dictionary.cast_unchecked() }
    }

    fn as_cf_string(value: &NSString) -> &CFString {
        unsafe { &*(value as *const NSString).cast::<CFString>() }
    }

    fn as_cf_type(value: &CFString) -> &CFType {
        unsafe { &*(value as *const CFString).cast::<CFType>() }
    }

    fn writer_error(writer: &AVAssetWriter) -> String {
        unsafe {
            writer
                .error()
                .map(|error| error.localizedDescription().to_string())
                .unwrap_or_else(|| format!("AVAssetWriter status {:?}", writer.status()))
        }
    }
}

#[cfg(target_os = "macos")]
pub use macos::{EncodeError, EncodeFrame, VideoEncodeSession};
