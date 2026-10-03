import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export class CocoDetector {
  constructor(video) {
    this.video = video;
    this.model = null;
  }

  async load() {
    this.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
  }

  async detect() {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth || !this.model) return [];

    const preds = await this.model.detect(v, 10, 0.5);
    return preds.map((p) => ({
      label: p.class,
      score: p.score,
      box: {
        x: p.bbox[0] / v.videoWidth,
        y: p.bbox[1] / v.videoHeight,
        w: p.bbox[2] / v.videoWidth,
        h: p.bbox[3] / v.videoHeight,
      },
    }));
  }
}
