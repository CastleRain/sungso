// Original 16-bar piano miniature for this invitation. No samples or third-party recordings.
// A user gesture creates/resumes audio. No autoplay or analytics.
const beat = 60 / 72;
const chords = [[48,55,60,64],[43,50,59,62],[45,52,57,60],[41,48,57,60],
  [48,55,60,64],[43,50,59,62],[41,48,57,60],[43,50,55,62],
  [45,52,57,60],[40,47,55,59],[41,48,57,60],[48,55,60,64],
  [38,45,53,57],[43,50,59,62],[48,55,60,64],[48,55,60,67]];
const melody = [
  [[0,72,1.5],[1.5,76,.5],[2,79,1],[3,76,1]], [[0,74,2],[2,71,1],[3,67,1]],
  [[0,72,1],[1,76,1],[2,74,1],[3,72,1]], [[0,69,3]],
  [[.5,67,1],[1.5,72,.5],[2,76,1],[3,79,1]], [[0,78,1],[1,74,1],[2,71,2]],
  [[0,72,1],[1,69,1],[2,65,2]], [[0,67,3]],
  [[0,76,1.5],[1.5,79,.5],[2,81,1],[3,79,1]], [[0,76,2],[2,71,2]],
  [[0,72,1],[1,69,1],[2,77,1],[3,76,1]], [[0,74,1],[1,72,2]],
  [[0,69,1],[1,72,1],[2,74,1.5]], [[0,71,1],[1,74,1],[2,79,1],[3,74,1]],
  [[0,76,2],[2,72,2]], [[0,72,4]],
];

export class InvitationMusic {
  constructor(config, onState) {
    this.config = config; this.onState = onState; this.volume = config.volume;
    this.playing = false; this.pending = false; this.bar = 0; this.context = null;
  }
  initialize() {
    if (this.context || this.audio) return;
    if (this.config.src) {
      this.audio = new window.Audio(this.config.src); this.audio.loop = true; this.audio.volume = this.volume;
      this.audio.addEventListener('pause', () => { this.playing = false; this.onState(false); });
      this.audio.addEventListener('error', () => this.onState(false, '음악을 불러오지 못했어요. 다시 눌러 주세요.'));
      return;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('audio-unavailable');
    this.context = new AudioContextCtor();
    const ctx = this.context;
    this.output = ctx.createGain(); this.output.gain.value = this.volume * .55;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 20; compressor.ratio.value = 3;
    this.output.connect(compressor); compressor.connect(ctx.destination);
    this.dry = ctx.createGain(); this.dry.gain.value = .85; this.dry.connect(this.output);
    const reverb = ctx.createConvolver(), wet = ctx.createGain(); wet.gain.value = .2;
    const impulse = ctx.createBuffer(2, ctx.sampleRate * 2.6, ctx.sampleRate);
    let seed = 117;
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 1073741823.5 - 1) * Math.pow(1 - i / data.length, 3); }
    }
    reverb.buffer = impulse; this.reverb = reverb; reverb.connect(wet); wet.connect(this.output);
    this.wave = ctx.createPeriodicWave(new Float32Array(9), new Float32Array([0,1,.32,.16,.08,.045,.022,.01,.005]), { disableNormalization: false });
    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running' && this.playing) { this.playing = false; clearInterval(this.timer); this.onState(false); }
    });
  }
  note(midi, time, length, velocity) {
    const ctx = this.context, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.setPeriodicWave(this.wave); osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const duration = Math.max(1.5, length * beat + 1.8);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(velocity, time + .016);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001, velocity * .28), time + .5);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    osc.connect(gain); gain.connect(this.dry); gain.connect(this.reverb);
    osc.start(time); osc.stop(time + duration + .05);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  schedule() {
    if (!this.playing || !this.context) return;
    while (this.nextBar < this.context.currentTime + .5) {
      const chord = chords[this.bar % chords.length], tune = melody[this.bar % melody.length];
      this.note(chord[0], this.nextBar, 3, .17);
      for (let step = 0; step < 8; step++) this.note(chord[[1,2,3,2,1,2,3,2][step]], this.nextBar + step * .5 * beat, .8, step % 2 ? .07 : .085);
      for (const [offset, note, duration] of tune) this.note(note, this.nextBar + offset * beat, duration, .18);
      this.bar++; this.nextBar += 4 * beat;
    }
  }
  async play() {
    if (this.pending) return;
    this.pending = true;
    try {
      this.initialize();
      if (this.audio) await this.audio.play();
      else {
        await this.context.resume();
        this.playing = true;
        if (!this.nextBar || this.nextBar < this.context.currentTime) this.nextBar = this.context.currentTime + .1;
        this.output.gain.setTargetAtTime(this.volume * .55, this.context.currentTime, .15);
        this.schedule(); this.timer = setInterval(() => this.schedule(), 200);
      }
      this.playing = true; this.onState(true);
    } catch { this.playing = false; this.onState(false, '음악 재생이 제한되어 있어요. 다시 눌러 주세요.'); }
    finally { this.pending = false; }
  }
  async pause() {
    clearInterval(this.timer);
    this.playing = false;
    if (this.audio) this.audio.pause();
    else if (this.context) await this.context.suspend();
    this.onState(false);
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.audio) this.audio.volume = this.volume;
    if (this.context) this.output.gain.setTargetAtTime(this.volume * .55, this.context.currentTime, .1);
  }
}
