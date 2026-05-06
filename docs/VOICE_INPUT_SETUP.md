# Voice Input Setup Guide

## Overview

The voice input functionality has been fully implemented with the following features:
- 🎤 Mic button appears when input is empty (replaces send button)
- 🌊 Real-time waveform visualization during recording
- ⏱️ Recording timer display
- 🛑 Stop button positioned in bottom right
- 🔄 Transcribing state with loading indicator
- 📝 Automatic text insertion into prompt box
- 🔐 Secure backend API with user authentication

## Required Configuration

### 1. Choose the speech-to-text provider

Voice input is controlled by the Convex env var `STT_PROVIDER`.

Supported values:

1. `google`
2. `groq`

If unset, the app defaults to `google`.

### 2. Google setup

When `STT_PROVIDER=google`, voice input uses Google Cloud Speech-to-Text V2 with `chirp_3`. It uses auto language detection by default, so you do not need to force Kiswahili or another locale.

You have two supported Google configuration paths:

1. **Preferred: configure Google BYOK in the app**
   - Open `Settings -> Providers`
   - Enable `Google`
   - Choose `Vertex AI`
   - Paste a Google Cloud service account JSON key with access to Speech-to-Text V2

2. **Or configure internal Convex environment variables**

   **For Development / Production:**
   ```bash
   npx convex env set STT_PROVIDER google
   npx convex env set GOOGLE_VERTEX_CREDENTIALS_JSON '{"type":"service_account",...}'
   npx convex env set GOOGLE_SPEECH_LOCATION us
   ```

   **Or via Convex Dashboard:**
   - Go to your [Convex Dashboard](https://dashboard.convex.dev/)
   - Navigate to your project's Deployment Settings
   - Add `GOOGLE_VERTEX_CREDENTIALS_JSON`
   - Optionally add `GOOGLE_SPEECH_LOCATION` (`us` by default)

`GOOGLE_SPEECH_LOCATION` is intentionally separate from `GOOGLE_VERTEX_LOCATION`. Speech-to-Text V2 uses speech regions such as `us` or `eu`, while Vertex model inference often uses locations like `us-central1`.

### 3. Groq setup

When `STT_PROVIDER=groq`, voice input uses Groq `whisper-large-v3-turbo`.

You can configure Groq either way:

1. **Preferred: configure Groq BYOK in the app**
   - Open `Settings -> Providers`
   - Enable `Groq`
   - Paste your Groq API key

2. **Or configure internal Convex environment variables**

   ```bash
   npx convex env set STT_PROVIDER groq
   npx convex env set GROQ_API_KEY your-groq-api-key
   ```

## Testing the Feature

1. **Start your development server** (if not already running):
   ```bash
   bun run dev
   ```

2. **Test the voice input:**
   - Open the chat interface
   - Make sure the input field is empty
   - You should see a mic icon instead of the send button
   - Click the mic icon to start recording
   - Speak clearly for a few seconds
   - Click the stop button to end recording
   - The transcribed text should appear in the input field

## Browser Requirements

- **Microphone permissions**: Users will be prompted to allow microphone access
- **HTTPS required**: Voice input only works on HTTPS (or localhost for development) - **critical for iOS Safari**
- **Modern browser**: Supports MediaRecorder API and Web Audio API
- **iOS Support**: Compatible with iOS Safari 14.3+ (iPad/iPhone) - must open directly in Safari browser, not PWA/home screen app

## Supported Audio Formats

The implementation automatically detects and uses the best supported format:

**iOS Safari (preferred formats):**
1. `audio/mp4`
2. `audio/aac`
3. `audio/m4a`

**Other browsers:**
1. `audio/webm;codecs=opus` (preferred)
2. `audio/webm`
3. `audio/ogg;codecs=opus`
4. Browser default (fallback)

## File Size Limits

- Maximum audio file size: **25MB**
- Recordings are automatically chunked and optimized

## Troubleshooting

### Common Issues:

1. **"Your browser doesn't support audio recording"**
   - Update to a modern browser (Chrome, Firefox, Safari, Edge)
   - Ensure you're on HTTPS (not HTTP)

2. **"No speech detected"**
   - Check microphone permissions
   - Ensure microphone is working
   - Speak closer to the microphone
   - Try speaking louder and more clearly

3. **"Transcription service error"**
   - Check `STT_PROVIDER` and confirm the intended provider is configured
   - For Google: verify Google provider is configured in `Vertex AI` mode, not `AI Studio`
   - For Google: check `GOOGLE_VERTEX_CREDENTIALS_JSON` is valid if using internal credentials
   - For Google: ensure the Google Cloud project has Speech-to-Text V2 enabled
   - For Groq: verify `GROQ_API_KEY` is configured or Groq BYOK is enabled
   - Check network connectivity

4. **"Unauthorized" error**
   - User must be logged in to use voice input
   - Check authentication status

5. **iOS Safari specific issues**
   - **"Not supported" error**: Update to iOS 14.3+ and use Safari directly (not PWA/home screen app)
   - **Silent recordings after first use**: Refresh the page - iOS Safari requires fresh audio streams
   - **Fails after switching apps**: This is a known iOS Safari bug - refresh the page to recover
   - **Red recording bar**: Normal behavior - it clears when recording stops
   - **Home screen PWA**: Launch from Safari directly, not from home screen shortcut

### Debug Steps:

1. **Check environment variable:**
   ```bash
   npx convex env list
   ```

2. **Check browser console** for any error messages

3. **Test microphone** in other applications

4. **Verify Google Cloud setup**
   - If using Google: confirm Speech-to-Text V2 is enabled for the project
   - If using Google: confirm the service account can access Speech-to-Text
   - If using Google: confirm `GOOGLE_SPEECH_LOCATION` is set to a valid speech region if you changed it from the default
   - If using Groq: confirm the Groq key has credits and speech-to-text access

## API Usage & Costs

- **Google mode**: Speech-to-Text V2 `chirp_3` with auto language detection
- **Groq mode**: `whisper-large-v3-turbo`
- **Costs**:
  - Google: [Speech-to-Text pricing](https://cloud.google.com/speech-to-text/pricing)
  - Groq: [Groq pricing](https://console.groq.com/docs/models)

## Implementation Details

### Backend Components:
- `convex/speech_to_text.ts` - HTTP action for transcription
- `convex/http.ts` - Route configuration with CORS

### Frontend Components:
- `src/hooks/use-voice-recorder.ts` - Recording logic and state management
- `src/components/voice-recorder.tsx` - UI component with waveform visualization
- `src/components/multimodal-input.tsx` - Integration with chat input

The implementation follows security best practices with proper authentication, error handling, and user feedback.

## iOS Safari Compatibility

The voice input implementation has been updated based on [kaliatech's web-audio-recording-tests](https://github.com/kaliatech/web-audio-recording-tests) to ensure iOS Safari compatibility:

- **Audio Graph Architecture**: Uses `createMediaStreamDestination()` instead of raw getUserMedia stream for MediaRecorder
- **Proper Audio Routing**: Creates gain nodes and audio analysis before getUserMedia call
- **Enhanced Cleanup**: Comprehensive resource cleanup to prevent iOS Safari stability issues
- **Stream Management**: Always uses fresh audio streams for each recording session
