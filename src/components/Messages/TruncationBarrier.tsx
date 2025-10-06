import styled from "@emotion/styled";

interface TruncationBarrierProps {
  direction: "up" | "down";
  text: string;
  className?: string;
}

const Barrier = styled.div<{ direction: "up" | "down" }>`
  margin: 20px 0;
  padding: 12px 15px;
  background: var(--color-editing-mode-alpha);
  ${(props) =>
    props.direction === "down"
      ? `
    border-bottom: 3px solid;
    border-image: repeating-linear-gradient(
        45deg,
        var(--color-editing-mode),
        var(--color-editing-mode) 10px,
        transparent 10px,
        transparent 20px
      )
      1;
  `
      : `
    border-top: 3px solid;
    border-image: repeating-linear-gradient(
        -45deg,
        var(--color-editing-mode),
        var(--color-editing-mode) 10px,
        transparent 10px,
        transparent 20px
      )
      1;
  `}
  color: var(--color-editing-mode);
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  position: relative;
  z-index: 10;
`;

export const TruncationBarrier: React.FC<TruncationBarrierProps> = ({
  direction,
  text,
  className,
}) => {
  return (
    <Barrier direction={direction} className={className}>
      {text}
    </Barrier>
  );
};
