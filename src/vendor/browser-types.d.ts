declare const window: { addEventListener(type:string, handler:(event:any)=>void):void; combatLab?: unknown; };
declare const document: { body: HTMLElement; hidden: boolean; getElementById(id:string): HTMLElement | null; createElement(tag:"canvas"): HTMLCanvasElement; createElement(tag:string): HTMLElement; addEventListener(type:string, handler:(event:any)=>void):void; };
declare const console: { log(...args: unknown[]): void; };
declare const performance: { now(): number };
declare function setTimeout(callback:(...args:any[])=>void, delay?: number): number;
declare function requestAnimationFrame(callback:(now:number)=>void): number;
declare class Blob { constructor(parts?: unknown[], options?: { type?: string }); }
declare const URL: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void; };
declare class HTMLElement { id: string; innerHTML: string; textContent: string | null; href: string; download: string; appendChild(child: HTMLElement): void; addEventListener(type:string, handler:(event:any)=>void):void; click(): void; }
declare class HTMLCanvasElement extends HTMLElement { width: number; height: number; getContext(kind:"2d"): CanvasRenderingContext2D | null; }
declare class CanvasRenderingContext2D { fillStyle: string; strokeStyle: string; font: string; clearRect(x:number,y:number,w:number,h:number):void; fillRect(x:number,y:number,w:number,h:number):void; strokeRect(x:number,y:number,w:number,h:number):void; beginPath():void; moveTo(x:number,y:number):void; lineTo(x:number,y:number):void; stroke():void; fillText(text:string,x:number,y:number):void; }
declare module "node:assert/strict" { const assert: { ok(value: unknown, message?: string): void; equal(actual: unknown, expected: unknown, message?: string): void; deepEqual(actual: unknown, expected: unknown, message?: string): void; }; export default assert; }
