use uxfd_sidecar_protocol::{
    ChecksumAlgorithm, DecodeStartResponse, FrameChecksum, FrameDescriptor,
};

pub(crate) fn tight_rgba_byte_len(width: u32, height: u32) -> Result<usize, String> {
    u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(4))
        .and_then(|bytes| usize::try_from(bytes).ok())
        .ok_or_else(|| format!("decoded frame dimensions overflow: {width}x{height}"))
}

pub(crate) fn pad_rgba_rows(
    tight_rgba: &[u8],
    width: u32,
    height: u32,
    stride_bytes: u32,
) -> Result<Vec<u8>, String> {
    let row_bytes = u64::from(width)
        .checked_mul(4)
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| format!("row byte length overflow for width={width}"))?;
    let stride_bytes = usize::try_from(stride_bytes)
        .map_err(|_| format!("stride byte length overflows usize: {stride_bytes}"))?;
    if stride_bytes < row_bytes {
        return Err(format!(
            "stride is smaller than tight RGBA row: stride={stride_bytes}, row={row_bytes}"
        ));
    }

    let height =
        usize::try_from(height).map_err(|_| format!("height overflows usize: {height}"))?;
    let tight_len = row_bytes
        .checked_mul(height)
        .ok_or_else(|| "tight RGBA byte length overflow".to_string())?;
    if tight_rgba.len() != tight_len {
        return Err(format!(
            "tight RGBA byte length mismatch: expected={tight_len}, actual={}",
            tight_rgba.len()
        ));
    }
    let padded_len = stride_bytes
        .checked_mul(height)
        .ok_or_else(|| "padded RGBA byte length overflow".to_string())?;
    let mut padded = vec![0; padded_len];
    for row in 0..height {
        let source_start = row * row_bytes;
        let destination_start = row * stride_bytes;
        padded[destination_start..destination_start + row_bytes]
            .copy_from_slice(&tight_rgba[source_start..source_start + row_bytes]);
    }

    Ok(padded)
}

pub(crate) fn checksum_for_bytes(bytes: &[u8]) -> FrameChecksum {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(bytes);
    FrameChecksum {
        algorithm: ChecksumAlgorithm::Crc32,
        value_hex: format!("{:08x}", hasher.finalize()),
        byte_len: bytes.len() as u64,
    }
}

pub(crate) fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut index = 0;
    while index < bytes.len() {
        let b0 = bytes[index];
        let b1 = bytes.get(index + 1).copied().unwrap_or(0);
        let b2 = bytes.get(index + 2).copied().unwrap_or(0);
        let triple = ((b0 as u32) << 16) | ((b1 as u32) << 8) | b2 as u32;

        output.push(TABLE[((triple >> 18) & 0x3f) as usize] as char);
        output.push(TABLE[((triple >> 12) & 0x3f) as usize] as char);
        if index + 1 < bytes.len() {
            output.push(TABLE[((triple >> 6) & 0x3f) as usize] as char);
        } else {
            output.push('=');
        }
        if index + 2 < bytes.len() {
            output.push(TABLE[(triple & 0x3f) as usize] as char);
        } else {
            output.push('=');
        }
        index += 3;
    }
    output
}

pub(crate) fn descriptor_for_release(
    response: &DecodeStartResponse,
    slot_index: u32,
    generation: u64,
) -> Result<FrameDescriptor, String> {
    if slot_index >= response.slot_count {
        return Err(format!(
            "slotIndex out of bounds: slotIndex={slot_index}, slotCount={}",
            response.slot_count
        ));
    }
    let byte_offset = response
        .slot_byte_len
        .checked_mul(u64::from(slot_index))
        .ok_or_else(|| {
            format!(
                "byte offset overflow: slotIndex={slot_index}, slotByteLen={}",
                response.slot_byte_len
            )
        })?;

    Ok(FrameDescriptor {
        memory_id: response.memory_id.clone(),
        slot_index,
        generation,
        byte_offset,
        byte_len: response.slot_byte_len,
        width: response.width,
        height: response.height,
        stride_bytes: response.stride_bytes,
        format: response.format,
        colour: response.colour.clone(),
    })
}
