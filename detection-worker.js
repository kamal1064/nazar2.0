/* NAZAR - Background Object Detection Web Worker */

let tfLoaded = false;
let cocoLoaded = false;
let model = null;
let isModelLoading = false;

// Dynamic load of library scripts inside worker context
try {
  importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');
  tfLoaded = true;
  importScripts('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd');
  cocoLoaded = true;
} catch (err) {
  console.error("Worker failed to import scripts: ", err);
  self.postMessage({ type: 'status', status: 'error', error: 'Script import failed' });
}

async function loadModel() {
  if (!tfLoaded || !cocoLoaded) {
    self.postMessage({ type: 'status', status: 'error', error: 'Dependencies not loaded' });
    return;
  }
  if (model || isModelLoading) return;
  isModelLoading = true;

  try {
    model = await cocoSsd.load();
    self.postMessage({ type: 'status', status: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'status', status: 'error', error: err.message });
  } finally {
    isModelLoading = false;
  }
}

self.onmessage = async (event) => {
  const { type, imageData, threshold } = event.data;

  if (type === 'load') {
    await loadModel();
    return;
  }

  if (type === 'detect') {
    if (!model) {
      self.postMessage({ type: 'error', error: 'Model not loaded' });
      return;
    }

    try {
      // Memory Safety: start intermediate scope bounds
      tf.engine().startScope();

      // Convert ImageData array buffer to tensor pixels
      const tensor = tf.browser.fromPixels(imageData);

      // Execute local object detection predictions
      const predictions = await model.detect(tensor);

      // Immediately dispose of input tensor
      tensor.dispose();

      // Memory Safety: clear intermediate scope bounds
      tf.engine().endScope();

      // Grab live tensor diagnostics
      const memStats = tf.memory();

      self.postMessage({
        type: 'predictions',
        predictions,
        diagnostics: {
          tensors: memStats.numTensors,
          bytes: memStats.numBytes
        }
      });

    } catch (err) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }
};
