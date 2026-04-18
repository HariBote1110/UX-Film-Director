import AVFoundation
import CoreImage
import CoreVideo
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

// MARK: - JSON DTOs

struct BoundingBoxDTO: Codable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double
}

/// Unified stdin envelope. `command` defaults to `track` when omitted.
struct JobInput: Codable {
    var command: String?
    var videoPath: String
    var timeSec: Double?
    var startSec: Double?
    var endSec: Double?
    var initialBoundingBox: BoundingBoxDTO?
    var frameStride: Int?
    var targetFps: Double?
}

struct TrackSampleDTO: Codable {
    var tSec: Double
    var boundingBox: BoundingBoxDTO
}

struct TrackOutputSuccess: Codable {
    var ok: Bool = true
    var samples: [TrackSampleDTO]
    /// Set when tracking stopped early (lost target or Vision error) but partial samples are returned.
    var message: String?
}

struct AnimalObservationDTO: Codable {
    var identifier: String
    var confidence: Double
    var boundingBox: BoundingBoxDTO
}

struct DetectSubjectsOutput: Codable {
    var ok: Bool = true
    var animals: [AnimalObservationDTO]
}

struct SegmentPersonOutput: Codable {
    var ok: Bool = true
    /// PNG (alpha) base64 when a person mask is available.
    var maskPngBase64: String?
    var message: String?
}

struct FramePreviewOutput: Codable {
    var ok: Bool = true
    var width: Int
    var height: Int
    var jpegBase64: String
}

struct TrackOutputError: Codable {
    var ok: Bool = false
    var error: String
}

// MARK: - Stdout / stderr

func writeStdoutLineEncodable<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(value),
          let line = String(data: data, encoding: .utf8)
    else {
        fputs("{\"ok\":false,\"error\":\"Failed to encode output\"}\n", stderr)
        return
    }
    print(line)
}

func fail(_ message: String) -> Never {
    writeStdoutLineEncodable(TrackOutputError(ok: false, error: message))
    exit(1)
}

/// Minimum width/height in Vision normalised space so `VNTrackObjectRequest` does not hit
/// "unexpected tracked object bounding box size" (degenerate boxes).
private let kVisionMinTrackedDimension: CGFloat = 0.004

func cgRect(from box: BoundingBoxDTO) -> CGRect {
    CGRect(
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height
    )
}

/// Vision normalised coords: origin bottom-left, +y up. Clamps into [0,1] with a minimum size.
func clampVisionInitialBoundingBox(_ rect: CGRect) -> CGRect {
    var x = CGFloat(rect.origin.x)
    var y = CGFloat(rect.origin.y)
    var w = CGFloat(rect.size.width)
    var h = CGFloat(rect.size.height)
    if !x.isFinite || !y.isFinite || !w.isFinite || !h.isFinite {
        return CGRect(x: 0.25, y: 0.25, width: 0.5, height: 0.5)
    }
    x = max(0, min(1, x))
    y = max(0, min(1, y))
    w = max(kVisionMinTrackedDimension, w)
    h = max(kVisionMinTrackedDimension, h)
    w = min(w, 1 - x)
    h = min(h, 1 - y)
    if w < kVisionMinTrackedDimension {
        w = kVisionMinTrackedDimension
        x = max(0, min(x, 1 - w))
    }
    if h < kVisionMinTrackedDimension {
        h = kVisionMinTrackedDimension
        y = max(0, min(y, 1 - h))
    }
    return CGRect(x: x, y: y, width: w, height: h)
}

/// After `perform`, reject boxes that would likely cause the next `perform` to throw internally.
func isVisionTrackedBoxHealthy(_ rect: CGRect) -> Bool {
    guard rect.origin.x.isFinite,
          rect.origin.y.isFinite,
          rect.size.width.isFinite,
          rect.size.height.isFinite
    else {
        return false
    }
    guard rect.width >= kVisionMinTrackedDimension,
          rect.height >= kVisionMinTrackedDimension
    else {
        return false
    }
    // Allow a little slack for sub-pixel drift; still reject clearly invalid frames.
    let maxSlack: CGFloat = 0.02
    guard rect.minX >= -maxSlack,
          rect.minY >= -maxSlack,
          rect.maxX <= 1 + maxSlack,
          rect.maxY <= 1 + maxSlack
    else {
        return false
    }
    return true
}

func dto(from rect: CGRect) -> BoundingBoxDTO {
    BoundingBoxDTO(
        x: Double(rect.origin.x),
        y: Double(rect.origin.y),
        width: Double(rect.size.width),
        height: Double(rect.size.height)
    )
}

// MARK: - Image helpers

func copyCgImage(videoPath: String, timeSec: Double) throws -> CGImage {
    let url = URL(fileURLWithPath: videoPath)
    let asset = AVURLAsset(url: url)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    let t = CMTime(seconds: timeSec, preferredTimescale: 600)
    var actual = CMTime.zero
    return try generator.copyCGImage(at: t, actualTime: &actual)
}

func jpegBase64(from cgImage: CGImage, quality: Double = 0.82) -> String? {
    let data = NSMutableData()
    let type = UTType.jpeg.identifier as CFString
    guard let dest = CGImageDestinationCreateWithData(data, type, 1, nil) else {
        return nil
    }
    let options: [CFString: Any] = [
        kCGImageDestinationLossyCompressionQuality: quality
    ]
    CGImageDestinationAddImage(dest, cgImage, options as CFDictionary)
    guard CGImageDestinationFinalize(dest) else {
        return nil
    }
    return (data as Data).base64EncodedString()
}

func pngBase64(from cgImage: CGImage) -> String? {
    let data = NSMutableData()
    let type = UTType.png.identifier as CFString
    guard let dest = CGImageDestinationCreateWithData(data, type, 1, nil) else {
        return nil
    }
    CGImageDestinationAddImage(dest, cgImage, nil)
    guard CGImageDestinationFinalize(dest) else {
        return nil
    }
    return (data as Data).base64EncodedString()
}

// MARK: - Commands

func runDetectSubjects(videoPath: String, timeSec: Double) throws -> DetectSubjectsOutput {
    let cgImage = try copyCgImage(videoPath: videoPath, timeSec: timeSec)
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    let request = VNRecognizeAnimalsRequest()
    try handler.perform([request])

    let observations = request.results ?? []

    let animals: [AnimalObservationDTO] = observations.map { obs in
        let topLabel = obs.labels.first
        let identifier = topLabel?.identifier ?? "animal"
        let confidence = Double(topLabel?.confidence ?? obs.confidence)
        return AnimalObservationDTO(
            identifier: identifier,
            confidence: confidence,
            boundingBox: dto(from: obs.boundingBox)
        )
    }

    return DetectSubjectsOutput(animals: animals)
}

func runSegmentPerson(videoPath: String, timeSec: Double) throws -> SegmentPersonOutput {
    let cgImage = try copyCgImage(videoPath: videoPath, timeSec: timeSec)
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    let request = VNGeneratePersonSegmentationRequest()
    request.qualityLevel = .accurate
    try handler.perform([request])

    guard let observation = request.results?.first as? VNPixelBufferObservation else {
        return SegmentPersonOutput(maskPngBase64: nil, message: "No person segmentation result.")
    }

    let buffer = observation.pixelBuffer
    let ciImage = CIImage(cvPixelBuffer: buffer)
    let context = CIContext(options: nil)
    guard let maskCg = context.createCGImage(ciImage, from: ciImage.extent) else {
        return SegmentPersonOutput(maskPngBase64: nil, message: "Could not render mask image.")
    }

    let b64 = pngBase64(from: maskCg)
    return SegmentPersonOutput(maskPngBase64: b64, message: b64 == nil ? "PNG encode failed." : nil)
}

func runFramePreview(videoPath: String, timeSec: Double) throws -> FramePreviewOutput {
    let cgImage = try copyCgImage(videoPath: videoPath, timeSec: timeSec)
    let w = cgImage.width
    let h = cgImage.height
    guard let b64 = jpegBase64(from: cgImage) else {
        fail("JPEG encode failed for frame preview.")
    }
    return FramePreviewOutput(width: w, height: h, jpegBase64: b64)
}

func runTrack(
    videoPath: String,
    startSec: Double,
    endSec: Double,
    initialBox: BoundingBoxDTO,
    frameStride: Int?,
    targetFps: Double?
) -> TrackOutputSuccess {
    guard endSec > startSec else {
        fail("endSec must be greater than startSec")
    }

    let path = videoPath
    guard FileManager.default.fileExists(atPath: path) else {
        fail("video file not found at path: \(path)")
    }

    let url = URL(fileURLWithPath: path)
    let asset = AVURLAsset(url: url)
    let videoTracks = asset.tracks(withMediaType: .video)
    guard let videoTrack = videoTracks.first else {
        fail("no video track in asset")
    }

    guard let reader = try? AVAssetReader(asset: asset) else {
        fail("AVAssetReader init failed")
    }

    let outputSettings: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]
    let output = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: outputSettings)
    output.alwaysCopiesSampleData = false

    guard reader.canAdd(output) else {
        fail("cannot add track output to reader")
    }
    reader.add(output)

    let durationSec = endSec - startSec
    let timeRange = CMTimeRange(
        start: CMTime(seconds: startSec, preferredTimescale: 600),
        duration: CMTime(seconds: durationSec, preferredTimescale: 600)
    )
    reader.timeRange = timeRange

    guard reader.startReading() else {
        fail("AVAssetReader failed to start: \(reader.error?.localizedDescription ?? "unknown")")
    }

    let rawInitial = cgRect(from: initialBox)
    let initialRect = clampVisionInitialBoundingBox(rawInitial)
    let clampedInitial =
        abs(Double(rawInitial.origin.x - initialRect.origin.x)) > 1e-6
        || abs(Double(rawInitial.origin.y - initialRect.origin.y)) > 1e-6
        || abs(Double(rawInitial.size.width - initialRect.size.width)) > 1e-6
        || abs(Double(rawInitial.size.height - initialRect.size.height)) > 1e-6
    if clampedInitial {
        fputs("uxfd-coreml-tracker: initial bounding box was clamped to Vision-safe values.\n", stderr)
    }
    let observation = VNDetectedObjectObservation(boundingBox: initialRect)

    let stride = max(1, frameStride ?? 1)
    let fps = targetFps ?? 0
    let minEmitInterval: Double? = fps > 0 ? (1.0 / fps) : nil

    var samples: [TrackSampleDTO] = []
    var frameIndex = 0
    var lastEmittedMediaSec: Double?
    var earlyExitMessage: String?

    let sequenceHandler = VNSequenceRequestHandler()
    let request = VNTrackObjectRequest(detectedObjectObservation: observation)
    request.trackingLevel = .accurate

    while reader.status == .reading {
        guard let sampleBuffer = output.copyNextSampleBuffer() else {
            break
        }
        defer { CMSampleBufferInvalidate(sampleBuffer) }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            continue
        }

        let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let mediaSec = CMTimeGetSeconds(presentationTime)

        do {
            try sequenceHandler.perform([request], on: pixelBuffer)
        } catch {
            let desc = error.localizedDescription
            earlyExitMessage =
                "Vision perform failed at t=\(mediaSec)s (\(desc)). Returning \(samples.count) sample(s) collected so far."
            break
        }

        guard let results = request.results as? [VNDetectedObjectObservation],
              let first = results.first
        else {
            frameIndex += 1
            continue
        }

        let box = first.boundingBox
        if !isVisionTrackedBoxHealthy(box) {
            earlyExitMessage =
                "Tracking stopped at t=\(mediaSec)s: bounding box no longer usable for Vision (too small or out of range). Returning \(samples.count) sample(s)."
            break
        }
        let shouldEmit: Bool
        if frameIndex % stride != 0 {
            shouldEmit = false
        } else if let interval = minEmitInterval {
            if let last = lastEmittedMediaSec {
                shouldEmit = (mediaSec - last) >= interval - 1e-6
            } else {
                shouldEmit = true
            }
        } else {
            shouldEmit = true
        }

        if shouldEmit {
            samples.append(TrackSampleDTO(tSec: mediaSec, boundingBox: dto(from: box)))
            lastEmittedMediaSec = mediaSec
        }

        frameIndex += 1
    }

    if samples.isEmpty, reader.status == .failed {
        fail("reader failed: \(reader.error?.localizedDescription ?? "unknown")")
    }

    return TrackOutputSuccess(samples: samples, message: earlyExitMessage)
}

// MARK: - Entry

let inputData = FileHandle.standardInput.readDataToEndOfFile()
guard !inputData.isEmpty else {
    fail("stdin is empty; expected JSON JobInput")
}

let decoder = JSONDecoder()
let input: JobInput
do {
    input = try decoder.decode(JobInput.self, from: inputData)
} catch {
    fail("Invalid input JSON: \(error.localizedDescription)")
}

let cmd = (input.command ?? "track").lowercased()

switch cmd {
case "detectsubjects":
    guard let t = input.timeSec, t.isFinite else {
        fail("detectSubjects requires finite timeSec")
    }
    do {
        let out = try runDetectSubjects(videoPath: input.videoPath, timeSec: t)
        writeStdoutLineEncodable(out)
    } catch {
        fail("detectSubjects failed: \(error.localizedDescription)")
    }

case "segmentperson":
    guard let t = input.timeSec, t.isFinite else {
        fail("segmentPerson requires finite timeSec")
    }
    do {
        let out = try runSegmentPerson(videoPath: input.videoPath, timeSec: t)
        writeStdoutLineEncodable(out)
    } catch {
        fail("segmentPerson failed: \(error.localizedDescription)")
    }

case "framepreview":
    guard let t = input.timeSec, t.isFinite else {
        fail("framePreview requires finite timeSec")
    }
    do {
        let out = try runFramePreview(videoPath: input.videoPath, timeSec: t)
        writeStdoutLineEncodable(out)
    } catch {
        fail("framePreview failed: \(error.localizedDescription)")
    }

case "track":
    guard let start = input.startSec, let end = input.endSec, let box = input.initialBoundingBox else {
        fail("track requires startSec, endSec, and initialBoundingBox")
    }
    guard start.isFinite, end.isFinite else {
        fail("track requires finite startSec and endSec")
    }
    let out = runTrack(
        videoPath: input.videoPath,
        startSec: start,
        endSec: end,
        initialBox: box,
        frameStride: input.frameStride,
        targetFps: input.targetFps
    )
    writeStdoutLineEncodable(out)

default:
    fail("unknown command: \(cmd). Use track, detectSubjects, segmentPerson, or framePreview.")
}
