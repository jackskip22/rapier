use jixel::{encode_image_with_alpha, EncodeConfig};

static mut OUT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
pub extern "C" fn dealloc(p: *mut u8, len: usize) {
    unsafe { drop(Vec::from_raw_parts(p, 0, len)); }
}

/// RGBA8 in; returns the encoded length (0 on failure); the bytes are at out_ptr(). `distance` is
/// JPEG XL's Butteraugli distance (the caller maps a quality number to it, as libjxl did).
#[no_mangle]
pub extern "C" fn encode(ptr: *const u8, width: usize, height: usize, lossless: u32, distance: f32) -> usize {
    let input = unsafe { std::slice::from_raw_parts(ptr, width * height * 4) };
    let mut config = EncodeConfig::default();
    config.lossless = lossless != 0;
    config.distance = distance;
    match encode_image_with_alpha(input, width, height, &config) {
        Ok(bytes) => unsafe { OUT = bytes; OUT.len() },
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 { unsafe { OUT.as_ptr() } }

/// RGB (alpha dropped) lossy or lossless, to tell an alpha-path fault from a lossy-path fault.
#[no_mangle]
pub extern "C" fn encode_rgb(ptr: *const u8, width: usize, height: usize, lossless: u32, distance: f32) -> usize {
    let rgba = unsafe { std::slice::from_raw_parts(ptr, width * height * 4) };
    let mut rgb = Vec::with_capacity(width * height * 3);
    for px in rgba.chunks_exact(4) { rgb.extend_from_slice(&px[..3]); }
    let mut config = EncodeConfig::default();
    config.lossless = lossless != 0;
    config.distance = distance;
    match jixel::encode_image(&rgb, width, height, &config) {
        Ok(bytes) => unsafe { OUT = bytes; OUT.len() },
        Err(_) => 0,
    }
}

/// The fast lossless path (Jixel's port of libjxl's fast-lossless), RGBA8.
#[no_mangle]
pub extern "C" fn encode_fast(ptr: *const u8, width: usize, height: usize) -> usize {
    let input = unsafe { std::slice::from_raw_parts(ptr, width * height * 4) };
    let meta = jixel::FlMeta::srgb();
    match jixel::encode_fast_lossless(input, width, height, jixel::ColorSpace::Rgb, true, &meta) {
        Ok(bytes) => unsafe { OUT = bytes; OUT.len() },
        Err(_) => 0,
    }
}

/// Let the last result go, so a large encode does not stay resident between pictures.
#[no_mangle]
pub extern "C" fn release() { unsafe { OUT = Vec::new(); } }
