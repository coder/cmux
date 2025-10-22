import React from "react";

interface ErrorMessageProps {
  title?: string;
  message: string;
  details?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ title, message, details }) => {
  return (
    <div className="bg-error-bg text-error border border-error rounded p-3 my-2 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
      {title && (
        <div className="font-bold mb-2 flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          {title}
        </div>
      )}
      <div>{message}</div>
      {details && <div className="opacity-90">{details}</div>}
    </div>
  );
};
