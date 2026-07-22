declare module 'simple-rnnoise-wasm' {
  export type RNNoiseAssets = [string | URL, Promise<WebAssembly.Module>];

  export class RNNoiseNode extends AudioWorkletNode {
    static register(context: BaseAudioContext, assetData?: RNNoiseAssets): Promise<void>;

    onstatus: ((event: MessageEvent) => void) | null;

    constructor(context: BaseAudioContext);
    update(keepalive?: boolean | 'stat'): void;
  }

  export function rnnoise_loadAssets(options?: {
    scriptSrc?: string | URL;
    moduleSrc?: string | BufferSource;
  }): Promise<RNNoiseAssets>;
}
