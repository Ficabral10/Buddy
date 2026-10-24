# Notability plan (Best Use of Notability)

Judging: **Process** (do the notes show how the idea evolved?), **Detail** (could someone follow
your thinking?), **Feature usage** (handwriting, audio, diagrams, PDFs, Smart Notes), **Relevance**
(did Notability play a real role, or was it added after the fact?).

The only way to score on Relevance is to really use it from now until submission. Don't recreate
fake "earlier" notes; when you write about decisions already made, date them honestly
("written Sat 4 PM about this morning's decision").

## One shared notebook: "Lola, Cal Hacks 13.0"

1. **The plan (PDF + handwriting).** Import `Design Doc v2` and this Hacker Guide. Annotate by hand:
   circle the Anthropic criteria, mark what we cut, and write why next to it.
2. **Decision log (handwriting, timestamped).** One line per real decision:
   - Native iOS app → web app (Xcode needs macOS 26.6; the team's Mac couldn't install it).
   - Competitor scan → focus on a named, underserved community.
   - Added "¿Es una estafa?" (why: what users told us, or the stakes for older adults).
   - Added the "Toca aquí" ring on screenshots (iOS forbids pointing at Settings).
3. **User interviews (audio + notes).** With permission, record the 2 or 3 conversations with
   Spanish-speaking older adults (or their relatives) while taking handwritten notes. These also
   feed docs/CUSTOMER.md for the Microsoft and Anthropic tracks.
4. **Diagrams (hand-drawn).** The user flow (ask → confirm → step → screenshot → ring → done →
   message family) and the architecture (phone OCR → detector → library ← Claude, Cartesia voice).
   Use the sketch in the pitch and README.
5. **Testing log.** Each test run: who, task, time, where they got stuck, what you changed.
6. **Smart Notes.** Use them to summarize the interviews and the testing log into "what we learned".
7. **Share.** Make the notebook link public and paste it into the Devpost "Notability" section and
   docs/TRACKS.md.

## In the demo (10 seconds)
Show one page: the hand sketch of the "Toca aquí" ring next to the real screen, and say how the
interview notes changed what you built.
