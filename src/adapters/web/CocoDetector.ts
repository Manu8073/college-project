import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import type { Detection, ObjectDetector } from '../../core/ports';

export class CocoDetector implements ObjectDetector {
  private model!: cocoSsd.ObjectDetection;
  private video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }


  async load() {
    this.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
  }

  async detect(): Promise<Detection[]> {
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return [];
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