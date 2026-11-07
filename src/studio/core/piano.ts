/**
 * Procedural Piano Synthesizer for AnyVis
 * Generates peaceful, elegant acoustic piano background music in pure NumPy + pydub.
 * No external soundfonts, network requests, or ffmpeg dependencies required.
 */

export const PIANO_RUNTIME = `
import numpy as _np
import math as _math
from pydub import AudioSegment as _AudioSegment

def _anyvis_piano_segment(duration, seed=42):
    """Generate peaceful, elegant piano music as a pydub.AudioSegment.

    Parameters
    ----------
    duration : float or int
        Duration in seconds (0.1 to 600.0). Accurate to the millisecond.
    seed : int, optional
        Fixed random seed for 100% reproducible synthesis (default 42).

    Returns
    -------
    pydub.AudioSegment
        16-bit PCM stereo AudioSegment at 24000 Hz, with peak <= 0.8 and typical RMS ~0.12-0.20.
    """
    sr = 24000
    duration_s = float(duration)
    if not _math.isfinite(duration_s) or duration_s < 0 or duration_s > 600:
        raise ValueError("Piano duration must be finite and within 0 to 600 seconds")
    duration_s = max(0.1, duration_s)
    duration_ms = int(round(duration_s * 1000.0))
    total_samples = duration_ms * (sr // 1000)

    bpm = 68.0
    beat_sec = 60.0 / bpm
    bar_sec = 4.0 * beat_sec

    # 8-bar soothing progression in C Major / A Minor:
    # Bar 0: Cmaj9  (C3=48, G3=55, B3=59, D4=62, E4=64)
    # Bar 1: Em7    (E3=52, B3=59, D4=62, G4=67)
    # Bar 2: Fmaj9  (F2=41, C3=48, E3=52, A3=57, C4=60)
    # Bar 3: Am9    (A2=45, E3=52, G3=55, B3=59, C4=60)
    # Bar 4: Dm9    (D3=50, A3=57, C4=60, E4=64, F4=65)
    # Bar 5: Em7    (E3=52, B3=59, D4=62, G4=67)
    # Bar 6: Fmaj7  (F2=41, C3=48, E3=52, A3=57)
    # Bar 7: Gsus4->G (G2=43, D3=50, G3=55, C4=60->B3=59)
    progression = [
        {"lh": [(0.0, 48, 0.48, 3.4), (1.0, 55, 0.36, 2.5), (2.0, 59, 0.32, 1.8), (3.0, 62, 0.30, 1.2)],
         "rh": [(1.0, 64, 0.54, 2.2), (2.5, 62, 0.48, 1.4)]},
        {"lh": [(0.0, 52, 0.46, 3.4), (1.0, 59, 0.35, 2.5), (2.0, 62, 0.30, 1.8), (3.0, 67, 0.28, 1.2)],
         "rh": [(1.5, 67, 0.50, 2.0), (3.0, 71, 0.46, 1.4)]},
        {"lh": [(0.0, 41, 0.48, 3.5), (1.0, 48, 0.36, 2.5), (2.0, 52, 0.33, 1.8), (3.0, 57, 0.30, 1.2)],
         "rh": [(0.5, 72, 0.56, 2.0), (2.0, 69, 0.50, 1.6), (3.5, 64, 0.42, 1.0)]},
        {"lh": [(0.0, 45, 0.46, 3.4), (1.0, 52, 0.35, 2.5), (2.0, 55, 0.32, 1.8), (3.0, 59, 0.28, 1.2)],
         "rh": [(1.0, 67, 0.52, 2.0), (2.5, 64, 0.46, 1.5)]},
        {"lh": [(0.0, 50, 0.46, 3.4), (1.0, 57, 0.35, 2.5), (2.0, 60, 0.30, 1.8), (3.0, 64, 0.28, 1.2)],
         "rh": [(1.0, 65, 0.52, 2.0), (2.5, 69, 0.48, 1.5)]},
        {"lh": [(0.0, 52, 0.45, 3.4), (1.0, 59, 0.35, 2.5), (2.0, 62, 0.30, 1.8), (3.0, 67, 0.28, 1.2)],
         "rh": [(1.0, 67, 0.54, 2.0), (3.0, 71, 0.50, 1.5)]},
        {"lh": [(0.0, 41, 0.48, 3.5), (1.0, 48, 0.36, 2.5), (2.0, 52, 0.33, 1.8), (3.0, 57, 0.30, 1.2)],
         "rh": [(0.5, 72, 0.56, 2.0), (2.0, 76, 0.58, 1.8), (3.0, 74, 0.50, 1.2)]},
        {"lh": [(0.0, 43, 0.48, 3.5), (1.0, 50, 0.36, 2.5), (2.0, 55, 0.32, 1.8), (3.0, 59, 0.28, 1.2)],
         "rh": [(1.0, 72, 0.54, 2.0), (2.5, 67, 0.46, 1.5)]},
    ]

    tail_samples = int(3.5 * sr)
    buffer_len = total_samples + tail_samples
    out_audio = _np.zeros((buffer_len, 2), dtype=_np.float32)

    def midi_to_freq(m):
        return 440.0 * (2.0 ** ((m - 69.0) / 12.0))

    rng = _np.random.RandomState(seed)
    total_sec = total_samples / sr
    n_bars = int(_math.ceil(total_sec / bar_sec)) + 1

    for b in range(n_bars):
        bar_idx = b % len(progression)
        cycle_idx = b // len(progression)
        bar_start_sec = b * bar_sec
        if bar_start_sec >= total_sec:
            break

        bar_data = progression[bar_idx]
        notes_to_play = []
        for beat_pos, midi_pitch, vel, dur in bar_data["lh"]:
            pan = max(-0.35, min(-0.1, -0.35 + (midi_pitch - 40) * 0.01))
            notes_to_play.append((bar_start_sec + beat_pos * beat_sec, midi_pitch, vel, dur, pan))

        for beat_pos, midi_pitch, vel, dur in bar_data["rh"]:
            var_pitch = midi_pitch
            # 4-bar / 8-bar musical variation in alternate cycles
            if cycle_idx % 2 == 1 and b % 4 >= 2 and var_pitch <= 67:
                var_pitch += 12
            pan = max(0.1, min(0.35, 0.1 + (var_pitch - 60) * 0.012))
            h_vel = vel * (0.96 + 0.08 * rng.uniform())
            notes_to_play.append((bar_start_sec + beat_pos * beat_sec, var_pitch, h_vel, dur, pan))

        for start_t, midi_pitch, vel, dur, pan in notes_to_play:
            start_sample = int(start_t * sr)
            if start_sample >= total_samples:
                continue
            freq = midi_to_freq(midi_pitch)
            dur_samples = min(int(dur * sr), buffer_len - start_sample)
            if dur_samples <= 0:
                continue

            t = _np.arange(dur_samples, dtype=_np.float32) / sr
            # Acoustic piano model: inharmonicity, velocity-dependent overtones, unison beating
            B = 0.00018
            tau0 = 3.5 * (150.0 / (freq + 80.0)) ** 0.55
            rolloff = 1.0 + (1.0 - vel) * 1.1
            harm_weights = [1.0, 0.55 / rolloff, 0.28 / (rolloff**2), 0.14 / (rolloff**3), 0.06 / (rolloff**4), 0.02 / (rolloff**5)]
            df = 0.32 + 0.0006 * freq

            note_sig = _np.zeros(dur_samples, dtype=_np.float32)
            for h, w in zip(range(1, len(harm_weights) + 1), harm_weights):
                if w < 0.005:
                    continue
                fh = h * freq * _math.sqrt(1.0 + B * h * h)
                if fh > sr * 0.45:
                    continue
                tau_h = tau0 / (1.0 + 0.45 * (h ** 1.35))
                # Unison double-string detuning with anti-phase singing sustain
                env = (0.75 * _np.cos(2 * _np.pi * df * t) + 0.25) * _np.exp(-t / tau_h)
                note_sig += w * env * _np.sin(2 * _np.pi * fh * t)

            # Attack smoothing (3.5 ms)
            att = int(0.0035 * sr)
            if att > 0 and dur_samples > att:
                note_sig[:att] *= _np.linspace(0.0, 1.0, att, dtype=_np.float32)

            # Felt hammer transient thump
            thump = _np.exp(-t / 0.007) * _np.sin(2 * _np.pi * 90.0 * t) * (0.035 * vel)
            note_sig += thump

            # Damping at release
            rel = int(0.16 * sr)
            if rel > 0 and dur_samples > rel:
                note_sig[-rel:] *= _np.linspace(1.0, 0.0, rel, dtype=_np.float32)

            note_sig *= vel * 0.95

            # Stereo spatialization
            angle = (pan + 1.0) * (_np.pi / 4.0)
            left_sig = note_sig * _math.cos(angle)
            right_sig = note_sig * _math.sin(angle)

            out_audio[start_sample:start_sample + dur_samples, 0] += left_sig
            out_audio[start_sample:start_sample + dur_samples, 1] += right_sig

    raw = out_audio[:total_samples]

    # Gentle stereo room reflections (multi-tap delay)
    reverb = _np.zeros_like(raw)
    delays_ms = [23, 37, 53, 71, 97, 127, 163, 199]
    gains_l = [0.24, -0.18, 0.14, -0.11, 0.08, -0.06, 0.05, -0.03]
    gains_r = [-0.20, 0.22, -0.13, 0.12, -0.07, 0.07, -0.04, 0.04]
    for d, gl, gr in zip(delays_ms, gains_l, gains_r):
        shift = int(d * sr / 1000)
        if shift < total_samples:
            reverb[shift:, 0] += raw[:-shift, 1] * gl + raw[:-shift, 0] * (gl * 0.35)
            reverb[shift:, 1] += raw[:-shift, 0] * gr + raw[:-shift, 1] * (gr * 0.35)

    reverb *= 0.40
    raw += reverb
    del reverb
    final_audio = raw

    # Soft limiter to ensure peak strictly <= 0.75 <= 0.8
    lim = 0.74
    final_audio /= lim
    _np.tanh(final_audio, out=final_audio)
    final_audio *= lim

    # Fade-in (350ms or 1/3 duration)
    fade_in_len = min(int(0.35 * sr), total_samples // 3)
    if fade_in_len > 0:
        fi = (0.5 * (1.0 - _np.cos(_np.linspace(0.0, _np.pi, fade_in_len, dtype=_np.float32))))[:, None]
        final_audio[:fade_in_len] *= fi

    # Fade-out (1.5 seconds or 1/2 duration)
    fade_out_len = min(int(1.5 * sr), total_samples // 2)
    if fade_out_len > 0:
        fo = (0.5 * (1.0 + _np.cos(_np.linspace(0.0, _np.pi, fade_out_len, dtype=_np.float32))))[:, None]
        final_audio[-fade_out_len:] *= fo

    # Export to 16-bit PCM AudioSegment
    int16_audio = _np.clip(final_audio * 32767.0, -32768.0, 32767.0).astype(_np.int16)
    return _AudioSegment(data=int16_audio.tobytes(), sample_width=2, frame_rate=sr, channels=2)
`;
