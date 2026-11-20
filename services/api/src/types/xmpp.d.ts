declare module "@xmpp/client" {
  export interface XElement { name: string; attrs: Record<string, string>; children: unknown[]; getChild(name: string, xmlns?: string): XElement | undefined; getChildren(name: string, xmlns?: string): XElement[]; getChildText(name: string, xmlns?: string): string | null; getText(): string; is(name: string, xmlns?: string): boolean; }
  export function xml(name: string, attrs?: Record<string, string | undefined>, ...children: Array<XElement | string>): XElement;
  export function client(opts: Record<string, unknown>): {
    start(): Promise<unknown>; stop(): Promise<void>; send(el: XElement): Promise<void>;
    on(event: string, fn: (...a: any[]) => void): void;
    iqCaller: { request(el: XElement, timeout?: number): Promise<XElement> };
  };
}
