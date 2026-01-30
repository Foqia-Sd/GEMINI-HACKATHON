<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/15hT97ImUp3I8A1RCovQHcl6DU_IzRkdN

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Gemini API Integration

LinguaBot is a voice-to-voice English speaking coach and evaluator powered by the Gemini API.

When the user clicks “Start Talking”, their speech is captured in the browser and converted to text using the Web Speech API. This transcript, along with the recent conversation history, is sent to the Gemini model through the Gemini API.

Gemini generates a short, natural conversational reply acting as a friendly English speaking partner. The response is displayed in the chat and converted back to audio using browser text-to-speech, allowing the user to have a real-time spoken conversation with the AI.

When the user clicks “Performance Report”, the latest spoken answer is sent to Gemini with an IELTS-style examiner prompt. Gemini analyzes fluency, grammar, vocabulary, and coherence, then returns a structured evaluation including an estimated band score, corrected sentences, and personalized improvement tips.

Gemini is therefore the core intelligence of the app, responsible for both live conversational responses and automated speaking assessment. This enables instant, human-like English practice and feedback without any human tutor, fully powered by the Gemini API.

