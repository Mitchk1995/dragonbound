import * as THREE from 'three';
import { AttributeNode, StackNode, type Node, type NodeBuilder } from 'three/webgpu';
import { float, setCurrentStack, vec3 } from 'three/tsl';
import { patchHooks, type PatchHooks } from '../src/render/patch';

export interface PatchGraph {
  /** Which hooks the material's patches fill. */
  hooks: Set<keyof PatchHooks>;
  /** The geometry attributes the patches read. */
  attributes: Set<string>;
  /** The textures they sample. */
  textures: Set<THREE.Texture>;
  /** Every node the hooks built, conditional branches included. */
  nodes: Set<Node>;
}

/**
 * Build a material's patch nodes as a program build would (for `object`, a plain mesh by default) and
 * gather what they read.
 */
export function patchGraph(mat: THREE.Material, object: THREE.Object3D = new THREE.Mesh()): PatchGraph {
  const stack = new StackNode();
  setCurrentStack(stack);
  const outputs: Node[] = [stack];
  const hooks = new Set<keyof PatchHooks>();
  try {
    for (const h of patchHooks(mat, { object } as unknown as NodeBuilder)) {
      for (const k of Object.keys(h) as (keyof PatchHooks)[]) if (h[k]) hooks.add(k);
      if (h.position) outputs.push(h.position(vec3(0)));
      h.discard?.();
      if (h.color) outputs.push(h.color(vec3(1).toVar()));
      if (h.alpha) outputs.push(h.alpha(float(1)));
      if (h.roughness) outputs.push(h.roughness(float(0.5)));
      if (h.normal) outputs.push(h.normal(vec3(0, 0, 1).toVar()));
      if (h.emissive) outputs.push(h.emissive(vec3(0)));
      if (h.output) outputs.push(h.output(vec3(0)));
    }
  } finally {
    setCurrentStack(null);
  }
  const nodes = new Set<Node>(), attributes = new Set<string>(), textures = new Set<THREE.Texture>();
  const visit = (n: Node) => {
    if (!n || nodes.has(n)) return;
    nodes.add(n);
    const a = n as unknown as { isTextureNode?: boolean; value?: unknown };
    if (n instanceof AttributeNode) attributes.add((n as unknown as { getAttributeName(): string }).getAttributeName());
    if (a.isTextureNode && a.value instanceof THREE.Texture) textures.add(a.value);
    for (const c of (n as unknown as { getChildren(): Iterable<Node> }).getChildren()) visit(c);
    // An If/ElseIf branch is a function that runs only when a program is built: run it here.
    const cond = n as unknown as { condNode?: Node; ifNode?: Branch; elseNode?: Branch };
    if (cond.condNode) for (const b of [cond.ifNode, cond.elseNode]) if (b?.jsFunc) visit(runBranch(b.jsFunc));
  };
  outputs.forEach(visit);
  return { hooks, attributes, textures, nodes };
}

type Branch = Node & { jsFunc?: () => unknown };

/** A branch's body built into a stack of its own (plus what it returns, if anything). */
function runBranch(body: () => unknown): Node {
  const stack = new StackNode();
  setCurrentStack(stack);
  try {
    const out = body();
    if (out && (out as Node).isNode) (stack as unknown as { addToStack(n: Node): void }).addToStack(out as Node);
  } finally {
    setCurrentStack(null);
  }
  return stack;
}
