# Image Pasting Support - Implementation Summary

## Overview
Added full support for pasting images into the chat input, including display, transmission, and rendering in the chat history.

## Complete Data Flow

```
User pastes image
  ↓
ChatInput.handlePaste extracts clipboard image
  ↓
Convert to base64 data URL
  ↓
Store in imageAttachments state (ImageAttachment[])
  ↓
Display in ImageAttachments component (80x80 thumbnails with × button)
  ↓
On send: include in sendMessage IPC call as imageParts
  ↓
ipcMain handler creates CmuxMessage with CmuxImagePart[]
  ↓
HistoryService appends message to history
  ↓
AI SDK convertToModelMessages transforms to provider format
  ↓
StreamingMessageAggregator extracts image parts to DisplayedMessage
  ↓
UserMessage component renders images inline (max 300x300)
```

## Files Modified

### Types
- **src/types/message.ts**
  - Added `CmuxImagePart` interface (image + mimeType)
  - Updated `CmuxMessage` to include image parts
  - Updated `DisplayedMessage` user type to include `imageParts?` field

- **src/types/ipc.ts**
  - Extended `sendMessage` signature to accept `imageParts?` in options

### Backend
- **src/services/ipcMain.ts**
  - Extract `imageParts` from options
  - Create `CmuxImagePart[]` from incoming data
  - Pass to `createCmuxMessage` as `additionalParts`
  - Added debug logging for image parts

- **src/utils/messages/StreamingMessageAggregator.ts**
  - Extract image parts from `CmuxMessage.parts` for user messages
  - Include in `DisplayedMessage` when present

### Frontend
- **src/components/ImageAttachments.tsx** (new)
  - Displays image thumbnails (80x80) before sending
  - Remove button for each image
  - Only renders when images present

- **src/components/ChatInput.tsx**
  - Added `imageAttachments` state
  - `handlePaste` extracts images from clipboard DataTransfer
  - `handleRemoveImage` removes specific attachment
  - Updated `handleSend` to include image parts in API call
  - Clear attachments on successful send
  - Allow sending with images only (no text required)
  - Pass `onPaste` to VimTextArea

- **src/components/Messages/UserMessage.tsx**
  - Added `ImageContainer` and `MessageImage` styled components
  - Render images inline (max 300x300, responsive)
  - Images displayed below text content

## Key Design Decisions

1. **Base64 Data URLs**: Images stored as data URLs (not file paths) for simplicity and compatibility with AI providers

2. **Two Display Sizes**:
   - Input area: 80x80 thumbnails (compact for multiple images)
   - Message history: 300x300 max (larger for readability)

3. **Image Parts Separate from Text**: Images stored as separate parts in `CmuxMessage`, not embedded in text content

4. **Provider-Agnostic**: AI SDK handles provider-specific image formatting automatically

5. **Optional Text**: Users can send images without text, useful for "what's in this image?" queries

6. **History Preservation**: Images included in chat history, available for context in follow-up messages

## Testing Recommendations

Manual testing scenarios:
1. Paste single image, send with text
2. Paste multiple images, send together
3. Paste image without text
4. Remove image before sending
5. Paste large image (verify data URL works)
6. Send message, verify image appears in history
7. Verify AI can see and respond to image content

## Future Enhancements (Not Implemented)

Potential improvements:
- Drag & drop support
- File picker button
- Image compression/resizing for large files
- Progress indicator for large images
- Image preview modal/zoom
- Copy image from chat history
- Support for image URLs (not just data URLs)
- Image captions/alt text

## Known Limitations

1. Large images create large data URLs (can impact performance)
2. No image format validation (relies on browser)
3. No file size warnings
4. Images not persisted separately (stored in history as data URLs)
5. No image editing/cropping before send

## Debug Tips

Enable debug logging:
```bash
DEBUG=cmux:* bun run dev
```

Look for:
- `sendMessage: Creating message with images` - Backend received images
- Image count and mimeTypes in logs
- Check browser console for clipboard errors
- Inspect `DisplayedMessage.imageParts` in React DevTools
