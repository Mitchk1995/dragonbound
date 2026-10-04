import * as THREE from 'three';
import { DepthTexture, NodeMaterial, QuadMesh, RendererUtils, RenderTarget, TextureNode, type NodeFrame } from 'three/webgpu';
import { NodeUpdateType, uv } from 'three/tsl';
import SSGINode from 'three/examples/jsm/tsl/display/SSGINode.js';

/** Two small helpers the lighting effects (post.ts) build on three.js's own nodes. */

/**
 * The scene's depth with one sample a pixel, for effects that read four texels at once (GTAO): a
 * multisampled depth cannot be gathered. Before each frame a quad writes sample 0 of each pixel into
 * a plain depth texture (as an RTTNode renders its picture: every copy of this node refers back to it,
 * so it draws once a frame wherever it is read).
 */
export class FlatDepth extends TextureNode {
  private readonly rt: RenderTarget;
  private readonly material = new NodeMaterial();
  private readonly quad = new QuadMesh(this.material);
  private state: unknown;
  private readonly drawSize = new THREE.Vector2();
  constructor(source: TextureNode) {
    const rt = new RenderTarget(1, 1, { depthBuffer: true, depthTexture: new DepthTexture(1, 1) });
    super(rt.depthTexture!);
    this.rt = rt;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.material.colorWrite = false;
    this.material.depthFunc = THREE.AlwaysDepth;
    this.material.depthNode = source.sample(uv()).r;
  }
  updateBefore(frame: NodeFrame) {
    const r = frame.renderer!;
    r.getDrawingBufferSize(this.drawSize);
    if (this.rt.width !== this.drawSize.x || this.rt.height !== this.drawSize.y) this.rt.setSize(this.drawSize.x, this.drawSize.y);
    this.state = RendererUtils.resetRendererState(r as never, this.state as never);
    r.setRenderTarget(this.rt);
    this.quad.render(r as never);
    RendererUtils.restoreRendererState(r as never, this.state as never);
    return undefined;
  }
  clone() {
    const n = new TextureNode(this.value, this.uvNode, this.levelNode);
    n.sampler = this.sampler;
    n.referenceNode = this;
    return n as unknown as this;
  }
  dispose() {
    this.rt.dispose();
    this.material.dispose();
    super.dispose();
  }
}

/**
 * SSGI worked at a fraction of the screen's size (its node always works at full size). (Its typings
 * leave setSize out, so the node's own is called through its prototype.)
 */
export class ScaledSSGI extends SSGINode {
  scale = 1;
  setSize(width: number, height: number) {
    (SSGINode.prototype as unknown as { setSize(w: number, h: number): void }).setSize.call(this, Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)));
  }
}
