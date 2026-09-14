import {
  createElement,
  useEffect,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { acquire, release } from "./cursorBlendRuntime";

export type CursorBlendProps = {
  as?: ElementType;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function CursorBlend({
  as: Component = "span",
  className,
  children,
  ...rest
}: CursorBlendProps) {
  useEffect(() => {
    acquire();
    return () => {
      release();
    };
  }, []);

  return createElement(
    Component,
    {
      ...rest,
      className,
      "data-cursor": "blend",
    },
    children,
  );
}
