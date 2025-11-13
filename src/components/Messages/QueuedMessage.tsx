import React from "react";
import type { QueuedMessage as QueuedMessageType } from "@/types/message";
import type { ButtonConfig } from "./MessageWindow";
import { MessageWindow } from "./MessageWindow";

interface QueuedMessageProps {
  message: QueuedMessageType;
  className?: string;
  onEdit?: () => void;
}

export const QueuedMessage: React.FC<QueuedMessageProps> = ({ message, className, onEdit }) => {
  const { content } = message;

  const buttons: ButtonConfig[] = onEdit
    ? [
        {
          label: "Edit",
          onClick: onEdit,
        },
      ]
    : [];

  return (
    <>
      <MessageWindow
        label="queued"
        borderColor="var(--color-user-border)"
        message={message}
        className={className}
        buttons={buttons}
      >
        {content && (
          <pre className="text-subtle m-0 font-mono text-xs leading-4 break-words whitespace-pre-wrap opacity-90">
            {content}
          </pre>
        )}
        {message.imageParts && message.imageParts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.imageParts.map((img, idx) => (
              <img
                key={idx}
                src={img.url}
                alt={`Attachment ${idx + 1}`}
                className="border-border-light max-h-[300px] max-w-80 rounded border"
              />
            ))}
          </div>
        )}
      </MessageWindow>
    </>
  );
};
