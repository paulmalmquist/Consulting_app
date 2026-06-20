// @react-three/fiber v8 augments the legacy global JSX namespace, but this
// repo compiles against @types/react v19, where JSX.IntrinsicElements resolves
// through React's own namespace. Bridge fiber's element map into it so
// <mesh>, <group>, <primitive>, etc. type-check. Remove when fiber moves to v9
// (which targets React 19 types directly).

import type { ThreeElements } from "@react-three/fiber";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
