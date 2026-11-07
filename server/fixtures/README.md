# Media regression fixture

`voice-tones.ogg` is an original synthetic four-second signal, encoded as Ogg Vorbis.
It contains a 330 Hz sine wave for the first second and 660 Hz for the remaining
three seconds, amplitude 0.2, mono, sampled at 44,100 Hz. There is no speech or
third-party recording. It is distributed under the repository license.

The integration test uploads and decodes this fixed file. It deliberately does
not need a Vorbis **encoder** in the installed PyAV build: supported audio uploads
only need decoding. The test still generates the matching WAV and transparent
PNG, and checks the rendered audio frequency, gain, start and stop positions.
