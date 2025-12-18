mod ear;
mod perclos;
mod blink;
mod yawn;
mod head_pose;
mod blendshape;
mod fatigue;

pub use ear::*;
pub use perclos::*;
pub use blink::*;
pub use yawn::*;
pub use head_pose::*;
pub use blendshape::*;
pub use fatigue::*;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
