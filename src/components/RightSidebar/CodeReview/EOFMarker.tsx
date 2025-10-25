/**
 * EOFMarker - End of file indicator shown when expansion reaches EOF
 */

import React from "react";

export const EOFMarker = React.memo(() => {
  return (
    <div className="block w-full" role="presentation">
      <div className="flex px-2 font-mono text-[11px] whitespace-pre">
        {/* Indicator column - matches diff line structure */}
        <span className="inline-block w-1 shrink-0 text-center opacity-40">·</span>

        {/* Line number column - matches diff line structure */}
        <span className="flex min-w-9 shrink-0 items-center justify-end pr-1 select-none">
          <span className="text-[9px] opacity-40">EOF</span>
        </span>

        {/* Content area - matches diff line structure */}
        <span className="pl-2 text-[11px] italic opacity-40">End of file</span>
      </div>
    </div>
  );
});

EOFMarker.displayName = "EOFMarker";
