import { scheduleState, type Toilet } from "../core";
export function ToiletStatus({ toilet, now }: { toilet: Toilet; now: Date }) {
  const s = scheduleState(toilet, now);
  return (
    <span className={`status ${s}`}>
      <span />
      {s === "open" ? "時段開放" : s === "closed" ? "非開放時段" : "時間未知"}
    </span>
  );
}
