import type { Detection } from '../core/ports';

export class CameraView {
  readonly video = document.createElement('video');
  private canvas = document.createElement('canvas');
  private stream: MediaStream | null = null;

  constructor(parent: HTMLElement) {
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.setAttribute('aria-label', 'Camera preview');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;max-width:640px;margin-top:1rem';
    this.video.style.cssText = 'width:100%;display:block;background:#000';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    wrap.append(this.video, this.canvas);
    parent.append(wrap);
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  draw(dets: Detection[]) {
    const ctx = this.canvas.getContext('2d')!;
    const { width: W, height: H } = this.canvas;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 3;
    ctx.font = '16px sans-serif';
    for (const d of dets) {
      const { x, y, w, h } = d.box;
      ctx.strokeStyle = '#00ff66';
      ctx.strokeRect(x * W, y * H, w * W, h * H);
      ctx.fillStyle = '#00ff66';
      ctx.fillText(`${d.label} ${Math.round(d.score * 100)}%`, x * W + 4, y * H + 18);
    }
  }
}