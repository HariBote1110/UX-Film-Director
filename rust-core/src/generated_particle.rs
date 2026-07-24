use serde::Deserialize;

/// 標準パーティクルの GPU/CPU 共通パラメータ。
///
/// `generator` は [`parse_generated_particle_source`] で検証済みのため、
/// 実行時のパラメータには保持しない。
#[derive(Debug, Clone, PartialEq)]
pub struct GeneratedParticleParams {
    pub seed: u64,
    pub particle_count: u32,
    pub spread: f32,
    pub speed: f32,
    pub size: f32,
    pub colour: [u8; 3],
    pub lifetime_seconds: f32,
}

/// 標準パーティクルの位置を決める、CPU/WGSL 共通の決定的疑似乱数。
///
/// renderer の WGSL 実装は、この関数のビット演算と
/// `generated_particle.rs` の固定ベクターを正として一致させる。
pub fn generated_particle_unit(seed: u64, index: u32, lane: u64) -> f32 {
    let mut value = seed
        ^ ((index as u64).wrapping_mul(0x9e37_79b9_7f4a_7c15))
        ^ lane.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 30;
    value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^= value >> 31;
    (value as f64 / u64::MAX as f64) as f32
}

#[derive(Debug, Deserialize)]
struct GeneratedParticleSource {
    generator: String,
    seed: u64,
    particle_count: u32,
    spread: f32,
    speed: f32,
    size: f32,
    colour: String,
    lifetime_seconds: f32,
}

/// UI から serialise された `standard-particle` source を検証して、
/// native renderer が直接利用できる正規パラメータへ変換する。
pub fn parse_generated_particle_source(source: &str) -> Result<GeneratedParticleParams, String> {
    let source: GeneratedParticleSource =
        serde_json::from_str(source).map_err(|error| error.to_string())?;

    if source.generator != "standard-particle" {
        return Err("generator must be standard-particle".to_string());
    }
    if source.particle_count == 0 || source.particle_count > 10_000 {
        return Err("particle_count must be 1..10000".to_string());
    }
    if !source.spread.is_finite() || source.spread < 0.0 {
        return Err("spread must be a finite non-negative number".to_string());
    }
    if !source.speed.is_finite() || source.speed < 0.0 {
        return Err("speed must be a finite non-negative number".to_string());
    }
    if !source.size.is_finite() || source.size <= 0.0 {
        return Err("size must be a finite positive number".to_string());
    }
    if !source.lifetime_seconds.is_finite() || source.lifetime_seconds <= 0.0 {
        return Err("lifetime_seconds must be a finite positive number".to_string());
    }

    Ok(GeneratedParticleParams {
        seed: source.seed,
        particle_count: source.particle_count,
        spread: source.spread,
        speed: source.speed,
        size: source.size,
        colour: parse_hex_colour(&source.colour)?,
        lifetime_seconds: source.lifetime_seconds,
    })
}

fn parse_hex_colour(source: &str) -> Result<[u8; 3], String> {
    let source = source.trim();
    let Some(hex) = source.strip_prefix('#') else {
        return Err("source must be a #rrggbb hex colour".to_string());
    };
    if hex.len() != 6 || !hex.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("source must be a #rrggbb hex colour".to_string());
    }

    let red = u8::from_str_radix(&hex[0..2], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;
    let green = u8::from_str_radix(&hex[2..4], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;
    let blue = u8::from_str_radix(&hex[4..6], 16)
        .map_err(|_| "source must be a #rrggbb hex colour".to_string())?;

    Ok([red, green, blue])
}
