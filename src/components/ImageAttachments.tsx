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
          className="relative w-20 h-20 rounded overflow-hidden border border-[#3e3e42] bg-[#1e1e1e]"
        >
          <img src={image.url} alt="Attached image" className="w-full h-full object-cover" />
          <button
            onClick={() => onRemove(image.id)}
            title="Remove image"
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white border-0 cursor-pointer flex items-center justify-center text-sm leading-none p-0 hover:bg-black/90"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
