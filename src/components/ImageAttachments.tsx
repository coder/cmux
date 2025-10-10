import React from "react";
import styled from "@emotion/styled";

const AttachmentsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
`;

const ImagePreview = styled.div`
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #3e3e42;
  background: #1e1e1e;
`;

const PreviewImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const RemoveButton = styled.button`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  padding: 0;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
  }
`;

export interface ImageAttachment {
  id: string;
  dataUrl: string;
  mimeType: string;
}

interface ImageAttachmentsProps {
  images: ImageAttachment[];
  onRemove: (id: string) => void;
}

export const ImageAttachments: React.FC<ImageAttachmentsProps> = ({ images, onRemove }) => {
  if (images.length === 0) return null;

  return (
    <AttachmentsContainer>
      {images.map((image) => (
        <ImagePreview key={image.id}>
          <PreviewImage src={image.dataUrl} alt="Attached image" />
          <RemoveButton onClick={() => onRemove(image.id)} title="Remove image">
            ×
          </RemoveButton>
        </ImagePreview>
      ))}
    </AttachmentsContainer>
  );
};
