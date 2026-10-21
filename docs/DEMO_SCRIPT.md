# Demo video script (60-90 seconds)

PROJECT_SPEC Section 10: problem, pipeline in 3 steps, live demo with the Signal Lab, one
validation plot, one honest limitation. Record only the author (or someone who has agreed in
writing to be in a public video). Do not show any study participant or recording.

| Time      | Picture                                                                                      | Words (about 150 in total)                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00-0:10 | App opening; the privacy badge                                                               | "A webcam sees more than a face. BlinkPulse Lab measures blinks and estimates pulse rate from ordinary video, entirely on this computer. Nothing is uploaded."                                                                                 |
| 0:10-0:30 | The Pipeline overview diagram from `docs/METHODS.md`, three steps highlighted in turn        | "Step one: a pre-trained model finds 478 points on the face. Step two: the eye points give the eye aspect ratio, and a calibrated state machine times each blink. Step three: the colour of three skin regions is turned into a pulse signal." |
| 0:30-0:55 | Live: Start, Calibrate, then the Signal Lab with the forehead region                         | "Here is that third step, live. The raw colour barely moves. POS combines the channels, a band-pass filter I wrote keeps 42 to 180 beats a minute, and the strongest peak in the spectrum is the estimate."                                    |
| 0:55-1:10 | One validation plot from `docs/VALIDATION.md` (e.g. the V2b Bland-Altman plot), with its n   | "Against a pulse oximeter, with n participants, the agreement was ... (read the real numbers; if V2 has not been run, say so instead)."                                                                                                        |
| 1:10-1:25 | The limitation in `docs/LIMITATIONS.md` about skin tone and light; the "-" state of the card | "It does not work equally well for everyone: weaker light and darker skin give a weaker colour signal, so the app shows a dash instead of guessing. It is not a medical device."                                                               |

Rules for the video:

- Use only results that are in `docs/VALIDATION.md`, with their sample sizes. If a validation has
  not been run, say that.
- Show the eye-closure indicator only with its full title and "(experimental)", never as a
  detector; do not mention driving or safety except by showing the disclaimer.
- Do not mention heart-rate variability, stress, emotion, attention, or health.
