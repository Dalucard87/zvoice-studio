// Захват сырых сэмплов с входа (запись)
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.port.onmessage = (e) => {
      if (e.data.cmd === 'start') this.on = true;
      else if (e.data.cmd === 'stop') this.on = false;
    };
  }
  process(inputs) {
    const inp = inputs[0];
    if (this.on && inp && inp.length && inp[0] && inp[0].length) {
      const chans = inp.map((ch) => ch.slice());
      this.port.postMessage(
        { type: 'audio', frames: chans[0].length, chans },
        chans.map((c) => c.buffer)
      );
    }
    return true;
  }
}
registerProcessor('capture-proc', CaptureProcessor);
