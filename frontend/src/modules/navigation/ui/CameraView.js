export class CameraView {
  constructor(parent) {
    this.video = document.createElement('video');
    this.canvas = document.createElement('canvas');
    this.stream = null;

    this.video.playsInline = true;
    this.video.muted = true;
    this.video.setAttribute('aria-label', 'Camera preview');

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;max-width:640px;margin-top:1rem';
    this.video.style.cssText = 'width:100%;display:block;background:#000;border-radius:12px;overflow:hidden;';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';

    wrap.append(this.video, this.canvas);
    if (parent) {
      parent.append(wrap);
    }
    this.element = wrap;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.canvas.width = this.video.videoWidth || 640;
    this.canvas.height = this.video.videoHeight || 480;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  draw(dets) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width: W, height: H } = this.canvas;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 3;
    ctx.font = 'bold 15px sans-serif';

    for (const d of dets) {
      const { x, y, w, h } = d.box;
      const isVehicle = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(d.label);
      const isPerson = d.label === 'person';
      const color = isVehicle ? '#ff3b30' : isPerson ? '#00e5ff' : '#00ff66';

      ctx.strokeStyle = color;
      ctx.strokeRect(x * W, y * H, w * W, h * H);

      // Bounding box badge background
      const text = `${d.label} ${Math.round(d.score * 100)}%`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(x * W, y * H - 22 > 0 ? y * H - 22 : y * H, textWidth + 12, 20);

      ctx.fillStyle = color;
      ctx.fillText(text, x * W + 6, y * H - 22 > 0 ? y * H - 7 : y * H + 15);
    }
  }
}
