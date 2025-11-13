import React from "react";

export interface ImageAttachment {
  id: string;
  url: string;
  mediaType: string;
}

interface ImageAttachmentsProps {
  images: ImageAttachment[];
  onRemove: (id: string) => void;
}

export const ImageAttachments: React.FC<ImageAttachmentsProps> = ({ images, onRemove }) => {
  if (images.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 py-2">
      {images.map((image) => (
        <div
          key={image.id}
          className="border-border-light bg-dark group relative h-20 w-20 overflow-hidden rounded border"
        >
          {/* <img src={image.url} alt="Attached image" className="h-full w-full object-cover" /> */}
          <button
            onClick={() => onRemove(image.id)}
            title="Remove image"
            className="absolute top-1 right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-red-600 p-0 text-sm leading-none font-bold text-white shadow-lg transition-all hover:scale-110 hover:bg-red-700"
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
