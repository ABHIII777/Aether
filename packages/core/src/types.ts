export type AetherText = {
  kind: "text";
  value: string;
};

export type AetherProps = Record<string, unknown>;

export type ComponentType<P extends AetherProps = AetherProps> = (
  props: P,
) => AetherRenderable;

export type AetherElement = {
  kind: "element";
  type: string;
  props: AetherProps;
  children: AetherNode[];
};

export type AetherComponent = {
  kind: "component";
  type: ComponentType<any>;
  props: AetherProps;
  children: AetherNode[];
};

export type AetherFragment = {
  kind: "fragment";
  children: AetherNode[];
};

export type AetherNode =
  | AetherElement
  | AetherComponent
  | AetherFragment
  | AetherText;

export type AetherChild =
  | AetherNode
  | string
  | number
  | boolean
  | null
  | undefined
  | AetherChild[];

export type AetherRenderable =
  | AetherNode
  | AetherChild[]
  | string
  | number
  | boolean
  | null
  | undefined;
