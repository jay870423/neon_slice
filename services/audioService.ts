
export class AudioService {
    private ctx: AudioContext | null = null;
    private isMuted: boolean = false;
    private isPlaying: boolean = false;
    
    // Scheduler
    private tempo: number = 120;
    private lookahead: number = 25.0; // ms to sleep
    private scheduleAheadTime: number = 0.1; // s to schedule
    private nextNoteTime: number = 0.0;
    private current16thNote: number = 0;
    private timerID: number | undefined;
    private intensity: 'low' | 'high' = 'low';
    
    // Effects
    private masterGain: GainNode | null = null;
    private reverbNode: ConvolverNode | null = null;
  
    // Scale: C Minor Pentatonic (C3, Eb3, F3, G3, Bb3, C4)
    private scale = [130.81, 155.56, 174.61, 196.00, 233.08, 261.63];
  
    constructor() {
      // Lazy init
    }
  
    init() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.4;
        this.masterGain.connect(this.ctx.destination);
        
        // Create simple reverb impulse
        this.reverbNode = this.ctx.createConvolver();
        this.reverbNode.buffer = this.createImpulseResponse(2.0, 2.0, false);
        this.reverbNode.connect(this.masterGain);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }
  
    private createImpulseResponse(duration: number, decay: number, reverse: boolean): AudioBuffer {
      const sampleRate = this.ctx!.sampleRate;
      const length = sampleRate * duration;
      const impulse = this.ctx!.createBuffer(2, length, sampleRate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);
  
      for (let i = 0; i < length; i++) {
        const n = reverse ? length - i : i;
        left[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
        right[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      }
      return impulse;
    }
  
    // --- SFX ---
  
    playSliceSfx() {
      if (!this.ctx || this.isMuted) return;
      const t = this.ctx.currentTime;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.masterGain!); // Use master gain
  
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
      
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
  
      osc.start(t);
      osc.stop(t + 0.15);
    }
  
    playBombSfx() {
      if (!this.ctx || this.isMuted) return;
      const t = this.ctx.currentTime;
      
      // Noise Burst
      const bufferSize = this.ctx.sampleRate * 0.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = this.ctx.createGain();
      
      // Filter for "thud" sound
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, t);
      filter.frequency.exponentialRampToValueAtTime(50, t + 0.4);
  
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain!);
      
      noiseGain.gain.setValueAtTime(0.5, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      
      noise.start(t);
    }
  
    // --- BGM ENGINE ---
  
    startBGM(intensity: 'low' | 'high') {
      if (this.isPlaying) this.stopBGM();
      this.init();
      if (!this.ctx) return;
  
      this.intensity = intensity;
      this.isPlaying = true;
      this.current16thNote = 0;
      this.tempo = intensity === 'high' ? 135 : 100;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
  
      this.scheduler();
    }
  
    stopBGM() {
      this.isPlaying = false;
      window.clearTimeout(this.timerID);
    }
  
    toggleMute() {
      this.isMuted = !this.isMuted;
      if (this.masterGain) {
          this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.4, this.ctx!.currentTime, 0.1);
      }
    }
  
    private nextNote() {
      const secondsPerBeat = 60.0 / this.tempo;
      // 0.25 because we're scheduling 16th notes
      this.nextNoteTime += 0.25 * secondsPerBeat; 
      this.current16thNote++;
      if (this.current16thNote === 16) {
        this.current16thNote = 0;
      }
    }
  
    private scheduleNote(beatNumber: number, time: number) {
      if (this.isMuted) return;
  
      // KICK: 4 on the floor for high intensity, sparse for low
      if (this.intensity === 'high') {
        if (beatNumber % 4 === 0) {
          this.playKick(time);
        }
      } else {
        if (beatNumber === 0 || beatNumber === 10) {
          this.playKick(time);
        }
      }
  
      // SNARE / CLAP
      if (beatNumber % 8 === 4) {
         this.playSnare(time);
      }
  
      // HI-HAT: Offbeats
      if (beatNumber % 2 === 0) {
        this.playHiHat(time, 0.05); // Closed
      } else {
         if (this.intensity === 'high') {
             this.playHiHat(time, 0.03); 
         }
      }
  
      // BASS
      if (this.intensity === 'high') {
        // Driving 8th notes
        if (beatNumber % 2 === 0) {
          const note = beatNumber < 8 ? this.scale[0] : this.scale[1]; // C then Eb
          this.playBass(time, note / 2); // Octave down
        }
      } else {
        // Drone bass
        if (beatNumber === 0) {
           this.playBass(time, this.scale[0] / 2, 2); // Long note
        }
      }
  
      // MELODY / ARP
      if (this.intensity === 'high') {
        // Random arpeggio on 16th notes
        if ([0, 3, 6, 9, 12, 14].includes(beatNumber)) {
           const noteIdx = Math.floor(Math.random() * 4); // Use lower part of scale
           this.playSynth(time, this.scale[noteIdx], 0.1);
        }
      } else {
        // Sparse melody
        if (beatNumber === 0 || beatNumber === 6 || beatNumber === 12) {
           const noteIdx = Math.floor(Math.random() * this.scale.length);
           this.playSynth(time, this.scale[noteIdx] * 2, 0.5); // High octave, long
        }
      }
    }
  
    private scheduler() {
      if (!this.isPlaying || !this.ctx) return;
  
      // Schedule notes ahead
      while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
        this.scheduleNote(this.current16thNote, this.nextNoteTime);
        this.nextNote();
      }
  
      this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
    }
  
    // --- SYNTH INSTRUMENTS ---
  
    private playKick(time: number) {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.connect(gain);
      gain.connect(this.masterGain!);
  
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
      
      gain.gain.setValueAtTime(0.8, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
  
      osc.start(time);
      osc.stop(time + 0.5);
    }
  
    private playSnare(time: number) {
      // Noise
      const bufferSize = this.ctx!.sampleRate * 0.2;
      const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      
      const noise = this.ctx!.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;
      const gain = this.ctx!.createGain();
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.reverbNode!); // Send to reverb
      gain.connect(this.masterGain!);
  
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
  
      noise.start(time);
      noise.stop(time + 0.2);
    }
  
    private playHiHat(time: number, duration: number) {
        // Noise for hat
        const bufferSize = this.ctx!.sampleRate * duration;
        const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx!.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx!.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;
        const gain = this.ctx!.createGain();

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

        noise.start(time);
    }
  
    private playBass(time: number, freq: number, duration: number = 0.2) {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();
      
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, time);
      filter.frequency.exponentialRampToValueAtTime(100, time + duration); // Envelope on filter
  
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);
  
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.linearRampToValueAtTime(0, time + duration);
  
      osc.start(time);
      osc.stop(time + duration);
    }
  
    private playSynth(time: number, freq: number, duration: number) {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      
      osc.type = 'square'; // 'Chiptune' style
      osc.frequency.value = freq;
      
      osc.connect(gain);
      gain.connect(this.reverbNode!);
      gain.connect(this.masterGain!);
  
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.linearRampToValueAtTime(0, time + duration);
  
      osc.start(time);
      osc.stop(time + duration);
    }
  }
  
  export const audioService = new AudioService();
