/* tslint:disable */
/* eslint-disable */

interface RenderingRegionLike {
    left: number;
    top: number;
    width: number;
    height: number;
}



export class JxlImage {
    free(): void;
    [Symbol.dispose](): void;
    feedBytes(bytes: Uint8Array): number;
    constructor();
    render(keyframe_idx?: number | null): RenderResult;
    tryInit(): boolean;
    forceSrgb: boolean;
    readonly height: number | undefined;
    readonly animated: boolean | undefined;
    readonly loaded: boolean;
    readonly numLoadedKeyframes: number;
    readonly numLoops: number | undefined;
    get renderingRegion(): RenderingRegion | undefined;
    set renderingRegion(value: RenderingRegionLike);
    readonly width: number | undefined;
}

export class RenderResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    encodeToPng(): Uint8Array;
    readonly duration: number;
    readonly durationDenominator: number;
    readonly durationNumerator: number;
    readonly iccProfile: Uint8Array;
}

export class RenderingRegion {
    private constructor();
    /**
     ** Return copy of self without private attributes.
     */
    toJSON(): Object;
    /**
     * Return stringified version of self.
     */
    toString(): string;
    free(): void;
    [Symbol.dispose](): void;
    height: number;
    left: number;
    top: number;
    width: number;
}

/**
 * Return the version of jxl-oxide-wasm.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_renderingregion_height: (a: number) => number;
    readonly __wbg_get_renderingregion_left: (a: number) => number;
    readonly __wbg_get_renderingregion_top: (a: number) => number;
    readonly __wbg_get_renderingregion_width: (a: number) => number;
    readonly __wbg_jxlimage_free: (a: number, b: number) => void;
    readonly __wbg_renderingregion_free: (a: number, b: number) => void;
    readonly __wbg_renderresult_free: (a: number, b: number) => void;
    readonly __wbg_set_renderingregion_height: (a: number, b: number) => void;
    readonly __wbg_set_renderingregion_left: (a: number, b: number) => void;
    readonly __wbg_set_renderingregion_top: (a: number, b: number) => void;
    readonly __wbg_set_renderingregion_width: (a: number, b: number) => void;
    readonly jxlimage_feedBytes: (a: number, b: number, c: number) => [number, number, number];
    readonly jxlimage_force_srgb: (a: number) => number;
    readonly jxlimage_height: (a: number) => number;
    readonly jxlimage_is_animation: (a: number) => number;
    readonly jxlimage_is_loading_done: (a: number) => number;
    readonly jxlimage_new: () => number;
    readonly jxlimage_num_loaded_keyframes: (a: number) => number;
    readonly jxlimage_num_loops: (a: number) => number;
    readonly jxlimage_render: (a: number, b: number) => [number, number, number];
    readonly jxlimage_rendering_region: (a: number) => number;
    readonly jxlimage_set_force_srgb: (a: number, b: number) => void;
    readonly jxlimage_set_rendering_region: (a: number, b: any) => void;
    readonly jxlimage_tryInit: (a: number) => [number, number, number];
    readonly jxlimage_width: (a: number) => number;
    readonly renderresult_encodeToPng: (a: number) => [number, number, number, number];
    readonly renderresult_frame_duration: (a: number) => number;
    readonly renderresult_frame_duration_denom: (a: number) => number;
    readonly renderresult_frame_duration_numer: (a: number) => number;
    readonly renderresult_icc_profile: (a: number) => [number, number];
    readonly version: () => [number, number];
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
